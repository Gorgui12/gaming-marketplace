import { NotificationType } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { TransactionModel } from '../transactions/transaction.model.js';
import { ConversationModel } from './conversation.model.js';
import { MessageModel } from './message.model.js';
import { detectContactInfoSharing } from './contact-info-detector.js';
import { NotificationService } from '../notifications/notification.service.js';

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

  static async listMessages(transactionId: string, userId: string) {
    await assertParticipant(transactionId, userId);
    const conversation = await ConversationModel.findOne({ transaction: transactionId });
    if (!conversation) return [];
    return MessageModel.find({ conversation: conversation._id }).sort({ createdAt: 1 });
  }

  static async sendMessage(input: { transactionId: string; senderId: string; content: string }) {
    const { otherPartyId } = await assertParticipant(input.transactionId, input.senderId);
    const conversation = await this.getOrCreateConversation(input.transactionId, input.senderId);

    const flagged = detectContactInfoSharing(input.content);
    const message = await MessageModel.create({
      conversation: conversation._id,
      sender: input.senderId,
      content: input.content,
      flaggedForContactInfo: flagged,
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
}
