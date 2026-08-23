import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { DisputeStatus, TransactionState } from '@gm/types';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { assertTransition } from '../transactions/transaction-state-machine.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DisputeModel, TransactionModel } from './admin-stats.models.js';

const OPEN_DISPUTE_STATUSES: string[] = [
  DisputeStatus.OPEN,
  DisputeStatus.UNDER_REVIEW,
  DisputeStatus.WAITING_FOR_BUYER,
  DisputeStatus.WAITING_FOR_SELLER,
];

export const listAdminDisputes = asyncHandler(async (req: Request, res: Response) => {
  const query = z
    .object({
      status: z
        .enum(Object.values(DisputeStatus) as [string, ...string[]])
        .default('OPEN'),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(50).default(20),
    })
    .parse(req.query);

  const filter = query.status === 'ALL' ? {} : { status: query.status };
  const skip = (query.page - 1) * query.pageSize;

  const [disputes, total] = await Promise.all([
    DisputeModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.pageSize)
      .populate('transaction', 'amount currency escrowStatus paymentReference'),
    DisputeModel.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      disputes,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  });
});

const resolveSchema = z.object({
  outcome: z.enum(['BUYER', 'SELLER']),
  resolution: z.string().trim().min(3).max(2000),
});

export const resolveAdminDispute = asyncHandler(async (req: Request, res: Response) => {
  const input = resolveSchema.parse(req.body);
  const disputeId = req.params.id!;

  const dispute = await DisputeModel.findById(disputeId);
  if (!dispute) {
    throw AppError.notFound(ErrorCode.DISPUTE_NOT_FOUND, 'Litige introuvable');
  }
  if (!OPEN_DISPUTE_STATUSES.includes(dispute.status as DisputeStatus)) {
    throw new AppError(
      ErrorCode.CONFLICT,
      `Ce litige est déjà clôturé (${dispute.status})`,
      409,
    );
  }

  const transaction = await TransactionModel.findById(dispute.transaction);
  if (!transaction) {
    throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
  }

  // Vérifie la légalité de la transition AVANT toute action irréversible.
  const targetState =
    input.outcome === 'BUYER' ? TransactionState.REFUND_PENDING : TransactionState.SELLER_PAYOUT_PENDING;
  assertTransition(transaction.escrowStatus as TransactionState, targetState, 'ADMIN');

  if (input.outcome === 'BUYER') {
    // Rembourse l'acheteur (REFUND_PENDING -> REFUNDED) + reverse les
    // commissions affiliées — logique centralisée dans TransactionsService.
    await TransactionsService.adminRefund({
      transactionId: String(transaction._id),
      adminId: req.user!.id,
      reason: `Litige ${String(dispute._id)}: ${input.resolution}`,
    });
  } else {
    // Tranche en faveur du vendeur (-> COMPLETED) + approuve les commissions.
    await TransactionsService.adminReleaseToSeller({
      transactionId: String(transaction._id),
      adminId: req.user!.id,
      reason: `Litige ${String(dispute._id)}: ${input.resolution}`,
    });
  }

  transaction.disputeStatus = 'resolved';
  await transaction.save();

  dispute.status = input.outcome === 'BUYER' ? DisputeStatus.RESOLVED_BUYER : DisputeStatus.RESOLVED_SELLER;
  dispute.assignedAdmin = new Types.ObjectId(req.user!.id);
  dispute.resolution = input.resolution;
  dispute.resolvedAt = new Date();
  await dispute.save();

  await AuditService.log({
    actor: req.user!.id,
    action: 'dispute.resolved',
    entityType: 'Dispute',
    entityId: String(dispute._id),
    metadata: {
      outcome: input.outcome,
      transactionId: String(transaction._id),
      resolution: input.resolution,
    },
  });

  res.status(200).json({ success: true, data: { dispute } });
});
