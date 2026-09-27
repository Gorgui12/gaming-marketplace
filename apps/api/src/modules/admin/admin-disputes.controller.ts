import type { Request, Response } from 'express';
import { z } from 'zod';
import { DisputeStatus, TransactionState } from '@gm/types';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { assertTransition } from '../transactions/transaction-state-machine.js';
import { TransactionsService } from '../transactions/transactions.service.js';
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
      // `ALL` doit être accepté explicitement par le schéma : il ne fait pas
      // partie de l'enum DisputeStatus, et un z.enum le rejetait en 400. Le
      // filtre « tous les litiges » — celui dont l'admin a besoin pour voir
      // l'historique complet — était donc inaccessible depuis l'UI.
      status: z
        .union([
          z.literal('ALL'),
          z.enum(Object.values(DisputeStatus) as [string, ...string[]]),
        ])
        .default(DisputeStatus.OPEN),
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
      .populate('transaction', 'amount currency escrowStatus paymentReference buyer seller')
      // Sans ce populate, l'admin ne voit qu'un ObjectId en hexa comme
      // « openedBy » et ne peut pas identifier qui a ouvert le litige —
      // le champ dont il a justement besoin pour trancher.
      .populate('openedBy', 'email username firstName lastName')
      .populate('assignedAdmin', 'email username'),
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

  // La clôture du document Dispute n'est PAS faite ici : elle est portée par
  // TransactionsService, seul chemin vers l'argent. Ainsi, un remboursement
  // déclenché depuis la page Transactions (hors litige) solde aussi le litige,
  // au lieu de laisser transaction.disputeStatus = 'open' avec un litige
  // définitivement introuvable et un KPI faux positif.
  if (input.outcome === 'BUYER') {
    await TransactionsService.adminRefund({
      transactionId: String(transaction._id),
      adminId: req.user!.id,
      reason: `Litige ${String(dispute._id)}: ${input.resolution}`,
      disputeResolution: input.resolution,
    });
  } else {
    await TransactionsService.adminReleaseToSeller({
      transactionId: String(transaction._id),
      adminId: req.user!.id,
      reason: `Litige ${String(dispute._id)}: ${input.resolution}`,
      disputeResolution: input.resolution,
    });
  }

  // Relecture pour renvoyer l'état réellement persisté (le service a pu
  // modifier le document) plutôt que la version chargée en début de handler.
  const closed = (await DisputeModel.findById(dispute._id)) ?? dispute;

  // Pas d'AuditService.log ici : DisputesService.closeForTransaction journalise
  // déjà `dispute.resolved`, et c'est le seul point de passage. Un second log
  // dans le controller produirait deux entrées d'audit pour une seule
  // décision — et il manquerait d'ailleurs le cas du remboursement déclenché
  // depuis la page Transactions, qui n'est jamais journalisé ailleurs.
  res.status(200).json({ success: true, data: { dispute: closed } });
});
