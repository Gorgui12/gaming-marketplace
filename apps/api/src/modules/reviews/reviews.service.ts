import { NotificationType, TransactionState } from '@gm/types';
import { Types } from 'mongoose';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { ReviewModel } from './review.model.js';
import { TransactionModel } from '../transactions/transaction.model.js';
import { UserModel } from '../users/user.model.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationService } from '../notifications/notification.service.js';

export class ReviewsService {
  /**
   * Un avis ne peut être laissé que sur une transaction COMPLETED, par
   * l'acheteur ou le vendeur, à propos de l'autre partie — jamais sur
   * soi-même, jamais avant la fin réelle de la transaction.
   */
  static async create(input: {
    transactionId: string;
    authorId: string;
    rating: number;
    comment?: string;
  }) {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }
    if (transaction.escrowStatus !== TransactionState.COMPLETED) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Vous ne pouvez laisser un avis qu'une fois la transaction terminée",
        409,
      );
    }

    const isBuyer = String(transaction.buyer) === input.authorId;
    const isSeller = String(transaction.seller) === input.authorId;
    if (!isBuyer && !isSeller) {
      throw AppError.forbidden("Vous n'êtes pas partie prenante de cette transaction");
    }
    const targetId = isBuyer ? String(transaction.seller) : String(transaction.buyer);

    let review;
    try {
      review = await ReviewModel.create({
        transaction: transaction._id,
        author: input.authorId,
        target: targetId,
        rating: input.rating,
        comment: input.comment,
      });
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Vous avez déjà laissé un avis pour cette transaction',
          409,
        );
      }
      throw err;
    }

    await this.recomputeReputation(targetId);

    await AuditService.log({
      actor: input.authorId,
      action: 'review.created',
      entityType: 'Review',
      entityId: String(review._id),
      metadata: { transactionId: String(transaction._id), rating: input.rating },
    });

    NotificationService.create({
      userId: targetId,
      type: NotificationType.NEW_REVIEW,
      title: 'Nouvel avis reçu',
      message: `Vous avez reçu un avis ${input.rating}/5.`,
      metadata: { reviewId: String(review._id) },
    }).catch(() => {});

    return review;
  }

  /**
   * Recalcule reputation.average / reputation.count depuis la source de
   * vérité (les avis eux-mêmes) plutôt que d'incrémenter en place — évite
   * toute dérive si un avis est un jour supprimé/modifié.
   */
  static async recomputeReputation(userId: string): Promise<void> {
    const agg = await ReviewModel.aggregate([
      { $match: { target: new Types.ObjectId(userId) } },
      { $group: { _id: '$target', average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const stats = agg[0] as { average?: number; count?: number } | undefined;
    await UserModel.findByIdAndUpdate(userId, {
      $set: {
        'reputation.average': stats ? Math.round(stats.average! * 10) / 10 : 0,
        'reputation.count': stats?.count ?? 0,
      },
    });
  }

  static async listForUser(userId: string, limit = 50) {
    return ReviewModel.find({ target: userId }).sort({ createdAt: -1 }).limit(limit);
  }

  static async listMine(authorId: string, limit = 50) {
    return ReviewModel.find({ author: authorId }).sort({ createdAt: -1 }).limit(limit);
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
