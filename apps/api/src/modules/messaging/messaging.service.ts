import { NotificationType, UserRole } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { TransactionModel } from '../transactions/transaction.model.js';
import { UserModel } from '../users/user.model.js';
import { ConversationModel } from './conversation.model.js';
import { MessageModel } from './message.model.js';
import { detectContactInfoSharing } from './contact-info-detector.js';
import { NotificationService } from '../notifications/notification.service.js';

// Équipes autorisées à recevoir les signalements de messages bloqués.
const STAFF_ROLES = [
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.MODERATOR,
  UserRole.SUPPORT,
];

async function assertParticipant(transactionId: string, userId: string) {
  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
  }
  const isBuyer = String(transaction.buyer) === userId;
  const isSeller = String(transaction.seller) === userId;
  if (!isBuyer && !isSeller) {
    throw AppError.forbidden("Vous n'êtes pas partie prenante de cette transaction");
  }
  return { transaction, otherPartyId: isBuyer ? String(transaction.seller) : String(transaction.buyer) };
}

export class MessagingService {
  /**
   * Une seule conversation par transaction — créée à la demande au premier
   * message (pas à la création de la transaction, pour ne pas polluer la
   * base de conversations vides).
   */
  static async getOrCreateConversation(transactionId: string, userId: string) {
    const { transaction } = await assertParticipant(transactionId, userId);
    let conversation = await ConversationModel.findOne({ transaction: transactionId });
    if (!conversation) {
      conversation = await ConversationModel.create({
        transaction: transactionId,
        participants: [transaction.buyer, transaction.seller],
      });
    }
    return conversation;
  }

  /**
   * Les messages bloqués (§15) ne sont JAMAIS exposés aux participants de
   * la transaction — ils restent uniquement visibles par l'équipe sur
   * /api/v1/admin/messages/blocked.
   */
  static async listMessages(transactionId: string, userId: string) {
    await assertParticipant(transactionId, userId);
    const conversation = await ConversationModel.findOne({ transaction: transactionId });
    if (!conversation) return [];
    return MessageModel.find({
      conversation: conversation._id,
      flaggedForContactInfo: { $ne: true },
    }).sort({ createdAt: 1 });
  }

  static async sendMessage(input: { transactionId: string; senderId: string; content: string }) {
    const { otherPartyId } = await assertParticipant(input.transactionId, input.senderId);
    const conversation = await this.getOrCreateConversation(input.transactionId, input.senderId);

    const flagged = detectContactInfoSharing(input.content);
    if (flagged) {
      // §15 — coordonnées partagées : le message est BLOQUÉ. Il est
      // conservé en base comme preuve de la tentative (visible uniquement
      // par l'équipe), jamais notifié à l'autre partie, et les admins sont
      // signalés.
      const blocked = await MessageModel.create({
        conversation: conversation._id,
        sender: input.senderId,
        content: input.content,
        flaggedForContactInfo: true,
      });

      await this.notifyStaffContactInfoBlocked({
        messageId: String(blocked._id),
        transactionId: input.transactionId,
        conversationId: String(conversation._id),
        senderId: input.senderId,
        content: input.content,
      });

      throw new AppError(
        ErrorCode.CONTACT_INFO_BLOCKED,
        'Ce message contient des coordonnées de contact et a été bloqué. Toute communication doit rester sur la plateforme.',
        422,
      );
    }

    const message = await MessageModel.create({
      conversation: conversation._id,
      sender: input.senderId,
      content: input.content,
      flaggedForContactInfo: false,
    });

    NotificationService.create({
      userId: otherPartyId,
      type: NotificationType.NEW_MESSAGE,
      title: 'Nouveau message',
      message: input.content.length > 80 ? `${input.content.slice(0, 80)}…` : input.content,
      metadata: { transactionId: input.transactionId, conversationId: String(conversation._id) },
    }).catch(() => {});

    return message;
  }

  static async listBlockedForAdmin() {
    return MessageModel.find({ flaggedForContactInfo: true })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('sender', 'username firstName lastName email')
      .populate({
        path: 'conversation',
        select: 'transaction',
        populate: {
          path: 'transaction',
          select: 'buyer seller amount currency listing',
          populate: { path: 'listing', select: 'title' },
        },
      });
  }

  // Signalement aux équipes : notification in-app pour chaque membre du
  // staff + toutes les infos utiles pour la modération dans metadata.
  private static async notifyStaffContactInfoBlocked(input: {
    messageId: string;
    transactionId: string;
    conversationId: string;
    senderId: string;
    content: string;
  }): Promise<void> {
    try {
      const staff = await UserModel.find({ roles: { $in: STAFF_ROLES } }).select('_id');
      const transactionTitle = `transaction ${input.transactionId}`;
      await Promise.all(
        staff.map((admin) =>
          NotificationService.create({
            userId: String(admin._id),
            type: NotificationType.CONTACT_INFO_BLOCKED,
            title: 'Coordonnées partagées — message bloqué',
            message: `Un message contenant des coordonnées a été bloqué (${transactionTitle}).`,
            metadata: {
              messageId: input.messageId,
              transactionId: input.transactionId,
              conversationId: input.conversationId,
              senderId: input.senderId,
              content: input.content.length > 200 ? `${input.content.slice(0, 200)}…` : input.content,
            },
          }),
        ),
      );
    } catch (err) {
      // best-effort : un échec de notification ne doit jamais empêcher le
      // blocage du message.
    }
  }
}