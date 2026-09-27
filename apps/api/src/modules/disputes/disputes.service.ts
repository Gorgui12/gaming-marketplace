import { DisputeStatus, NotificationType, TransactionState } from '@gm/types';
import { Types } from 'mongoose';
import type { OpenDisputeInput } from '@gm/validation';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { TransactionModel } from '../transactions/transaction.model.js';
import { assertTransition } from '../transactions/transaction-state-machine.js';
import { UserModel } from '../users/user.model.js';
import { ListingModel } from '../listings/listing.model.js';
import { EmailService } from '../../lib/email/email.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { DisputeModel } from './dispute.model.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Libellés lisibles des motifs d'ouverture. La valeur stockée en base reste
 * l'enum technique (voir `openDisputeSchema`) : on ne traduit qu'à l'affichage
 * et dans les emails, pour que le back-office et les données restent stables.
 */
const REASON_LABELS: Record<string, string> = {
  ACCESS_INCORRECT: 'Les accès fournis ne correspondent pas à l\'annonce',
  ACCOUNT_MISMATCH: 'Le compte reçu n\'est pas celui annoncé',
  SELLER_UNRESPONSIVE: 'Le vendeur ne répond plus',
  ACCOUNT_INACCESSIBLE: 'Le compte est inaccessible',
  MAJOR_ISSUE: 'Problème majeur (vol, compromission…)',
  OTHER: 'Autre motif',
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export class DisputesService {
  static async open(input: OpenDisputeInput & { userId: string }) {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }

    // Le vendeur est volontairement écarté de l'ouverture : il doit passer par
    // le support (cf. state machine, qui n'autorise que BUYER/ADMIN vers
    // DISPUTED). On identifie tout de même sa branche pour interdire un tiers
    // non partie prenante avant de trancher.
    if (String(transaction.buyer) !== input.userId) {
      throw AppError.forbidden("Vous n'êtes pas partie prenante de cette transaction");
    }

    if (transaction.disputeStatus === 'open') {
      throw new AppError(
        ErrorCode.DISPUTE_ALREADY_OPEN,
        'Un litige est déjà ouvert pour cette transaction',
        409,
      );
    }

    assertTransition(
      transaction.escrowStatus as TransactionState,
      TransactionState.DISPUTED,
      'BUYER',
    );

    const dispute = await DisputeModel.create({
      transaction: transaction._id,
      openedBy: input.userId,
      reason: input.reason,
      description: input.description,
    });

    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.DISPUTED,
      at: new Date(),
      actor: input.userId,
    });
    transaction.escrowStatus = TransactionState.DISPUTED;
    transaction.disputeStatus = 'open';
    await transaction.save();

    await AuditService.log({
      actor: input.userId,
      action: 'dispute.opened',
      entityType: 'Dispute',
      entityId: String(dispute._id),
      metadata: { transactionId: String(transaction._id), reason: input.reason },
    });

    // Le vendeur DOIT être prévenu : son argent est gelé et l'administrateur
    // va le contacter. Sans cette notification, il découvre le litige en
    // constatant simplement l'absence de paiement.
    const transactionId = String(transaction._id);
    const label = reasonLabel(input.reason);
    const [listing, buyer, seller] = await Promise.all([
      ListingModel.findById(transaction.listing).select('title'),
      UserModel.findById(transaction.buyer).select('email firstName'),
      UserModel.findById(transaction.seller).select('email firstName'),
    ]);
    const listingTitle = listing?.title ?? 'votre annonce';

    if (seller) {
      EmailService.sendDisputeOpened({
        to: seller.email,
        firstName: seller.firstName,
        role: 'seller',
        transactionId,
        reason: label,
      }).catch(() => {});
    }
    if (buyer) {
      EmailService.sendDisputeOpened({
        to: buyer.email,
        firstName: buyer.firstName,
        role: 'buyer',
        transactionId,
        reason: label,
      }).catch(() => {});
    }

    NotificationService.create({
      userId: String(transaction.seller),
      type: NotificationType.DISPUTE_OPENED,
      title: 'Litige ouvert sur une de vos ventes',
      message: `Un acheteur a ouvert un litige sur "${listingTitle}". Le montant reste bloqué jusqu'à la décision de notre équipe.`,
      metadata: { transactionId, disputeId: String(dispute._id) },
    }).catch(() => {});

    NotificationService.create({
      userId: String(transaction.buyer),
      type: NotificationType.DISPUTE_OPENED,
      title: 'Votre litige est ouvert',
      message: `Nous examinons votre litige sur "${listingTitle}". Vous serez notifié de la décision.`,
      metadata: { transactionId, disputeId: String(dispute._id) },
    }).catch(() => {});

    return dispute;
  }

  /**
   * Clôture du litige lié à une transaction, appelée par TransactionsService
   * au moment où la décision d'argent est effectivement appliquée.
   *
   * Point de passage OBLIGATOIRE et unique : c'est ici que l'on garantie que
   * `transaction.disputeStatus` et `dispute.status` ne peuvent jamais diverger.
   * Avant, un admin pouvait rembourser depuis la page Transactions sans toucher
   * au document Dispute — la transaction partait en REFUNDED et le litige
   * restait OPEN indéfiniment (KPI faux positif, résolution impossible ensuite
   * car la transition DISPUTED -> * était déjà consommée).
   *
   * Silencieux (pas d'erreur) s'il n'y a aucun litige ouvert : le
   * remboursement admin direct d'une transaction sans litige est un flux
   * légitime et ne doit pas échouer.
   */
  static async closeForTransaction(input: {
    transactionId: string;
    outcome: 'BUYER' | 'SELLER';
    resolution: string;
    adminId: string;
  }) {
    const dispute = await DisputeModel.findOne({
      transaction: input.transactionId,
      status: {
        $in: [
          DisputeStatus.OPEN,
          DisputeStatus.UNDER_REVIEW,
          DisputeStatus.WAITING_FOR_BUYER,
          DisputeStatus.WAITING_FOR_SELLER,
        ],
      },
    });
    if (!dispute) return null;

    dispute.status =
      input.outcome === 'BUYER' ? DisputeStatus.RESOLVED_BUYER : DisputeStatus.RESOLVED_SELLER;
    dispute.assignedAdmin = new Types.ObjectId(input.adminId);
    dispute.resolution = input.resolution;
    dispute.resolvedAt = new Date();
    await dispute.save();

    await AuditService.log({
      actor: input.adminId,
      action: 'dispute.resolved',
      entityType: 'Dispute',
      entityId: String(dispute._id),
      metadata: {
        outcome: input.outcome,
        transactionId: input.transactionId,
        resolution: input.resolution,
      },
    });

    // Les deux parties doivent apprendre la décision, y compris celle qui
    // l'a perdue : sans cela, le vendeur ne sait pas pourquoi il n'est pas payé
    // et l'acheteur ignore s'il doit attendre un virement manuel.
    const transaction = await TransactionModel.findById(input.transactionId).select(
      'buyer seller',
    );
    if (!transaction) return dispute;

    const targets: Array<{ userId: string; role: 'buyer' | 'seller' }> = [
      { userId: String(dispute.openedBy), role: 'buyer' },
      { userId: String(transaction.seller), role: 'seller' },
    ];
    // Déduplique le cas où l'acheteur serait aussi le vendeur du litige (ne
    // devrait pas arriver, la création d'annonce l'interdit, mais on ne veut
    // pas envoyer deux fois le même email).
    const uniqueTargets = targets.filter(
      (t, i) => targets.findIndex((x) => x.userId === t.userId) === i,
    );

    const users = await UserModel.find({
      _id: { $in: uniqueTargets.map((t) => t.userId) },
    }).select('email firstName');

    for (const target of uniqueTargets) {
      const user = users.find((u) => String(u._id) === target.userId);
      if (!user) continue;
      EmailService.sendDisputeResolved({
        to: user.email,
        firstName: user.firstName,
        role: target.role,
        outcome: input.outcome,
        transactionId: input.transactionId,
        resolution: input.resolution,
      }).catch(() => {});
      // Le titre doit suivre l'OUTCOME, pas le rôle : sinon la partie perdante
      // lit « tranché en votre faveur » alors qu'elle vient de perdre.
      NotificationService.create({
        userId: target.userId,
        type: NotificationType.DISPUTE_RESOLVED,
        title:
          input.outcome === 'BUYER'
            ? 'Litige tranché en faveur de l\'acheteur'
            : 'Litige tranché en faveur du vendeur',
        message:
          input.outcome === 'BUYER'
            ? 'Le litige a été tranché en faveur de l\'acheteur : il est remboursé de la totalité du montant.'
            : 'Le litige a été tranché en faveur du vendeur : la vente est validée et il est payé.',
        metadata: {
          transactionId: input.transactionId,
          disputeId: String(dispute._id),
          resolution: input.resolution,
        },
      }).catch(() => {});
    }

    return dispute;
  }

  /**
   * Litiges visibles par un utilisateur : ceux qu'il a ouverts, et ceux ouverts
   * sur une transaction où il est partie prenante (le vendeur n'ouvre pas de
   * litige, mais doit pouvoir suivre et comprendre celui ouvert par
   * l'acheteur).
   */
  static async listForUser(userId: string) {
    const transactions = await TransactionModel.find({
      $or: [{ buyer: userId }, { seller: userId }],
    }).select('_id');
    const transactionIds = transactions.map((t) => t._id);

    return DisputeModel.find({
      $or: [{ openedBy: userId }, { transaction: { $in: transactionIds } }],
    })
      .sort({ createdAt: -1 })
      .populate('transaction', 'amount currency escrowStatus paymentReference')
      .populate('openedBy', 'email username firstName lastName')
      .lean();
  }
}
