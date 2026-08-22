import { TransactionState } from '@gm/types';
import type { OpenDisputeInput } from '@gm/validation';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { TransactionModel } from '../transactions/transaction.model.js';
import { assertTransition, type Actor } from '../transactions/transaction-state-machine.js';
import { DisputeModel } from './dispute.model.js';
import { AuditService } from '../audit/audit.service.js';

export class DisputesService {
  static async open(input: OpenDisputeInput & { userId: string }) {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }

    const actor: Actor =
      String(transaction.buyer) === input.userId
        ? 'BUYER'
        : String(transaction.seller) === input.userId
          ? 'SELLER'
          : (() => {
              throw AppError.forbidden("Vous n'êtes pas partie prenante de cette transaction");
            })();

    if (transaction.disputeStatus === 'open') {
      throw new AppError(
        ErrorCode.DISPUTE_ALREADY_OPEN,
        'Un litige est déjà ouvert pour cette transaction',
        409,
      );
    }

    // Note MVP: seul l'acheteur peut déclencher l'ouverture d'un litige
    // (le vendeur peut signaler un problème via le support/admin, à affiner
    // en Phase 6). On ne laisse jamais un acteur non prévu par la state
    // machine forcer une transition.
    if (actor !== 'BUYER') {
      throw AppError.forbidden(
        "Seul l'acheteur peut ouvrir un litige directement pour le moment",
      );
    }

    assertTransition(transaction.escrowStatus as TransactionState, TransactionState.DISPUTED, 'BUYER');

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

    return dispute;
  }
}
