import type { Request, Response } from 'express';
import { AffiliatePayoutStatus, CommissionStatus } from '@gm/types';
import { createAffiliatePayoutSchema, markPayoutPaidSchema } from '@gm/validation';
import { asyncHandler } from '../../../lib/async-handler.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { ErrorCode } from '../../../lib/errors/error-codes.js';
import { AffiliateModel } from '../affiliate.model.js';
import { AffiliatePayoutModel } from '../affiliate-payout.model.js';
import { AffiliateConversionModel } from '../affiliate-conversion.model.js';
import { AuditService } from '../../audit/audit.service.js';

export const listPayouts = asyncHandler(async (_req: Request, res: Response) => {
  const payouts = await AffiliatePayoutModel.find().sort({ createdAt: -1 }).limit(200);
  res.status(200).json({ success: true, data: { payouts } });
});

/**
 * §24 — workflow manuel: crée une demande de payout pour le montant
 * disponible de l'affilié. Ne transfère rien automatiquement.
 */
export const createPayout = asyncHandler(async (req: Request, res: Response) => {
  const input = createAffiliatePayoutSchema.parse(req.body);
  const affiliate = await AffiliateModel.findById(input.affiliateId);
  if (!affiliate) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Affilié introuvable');
  }
  if (input.amount > affiliate.availableCommission) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Montant demandé supérieur à la commission disponible',
      400,
    );
  }

  const payout = await AffiliatePayoutModel.create({
    affiliate: affiliate._id,
    amount: input.amount,
    currency: 'XOF', // TODO: dériver de la devise réelle de l'affilié une fois le multi-devise affilié modélisé
    status: AffiliatePayoutStatus.PENDING,
  });

  affiliate.availableCommission -= input.amount;
  await affiliate.save();

  await AuditService.log({
    actor: req.user!.id,
    action: 'admin.payout_created',
    entityType: 'AffiliatePayout',
    entityId: String(payout._id),
    metadata: { amount: input.amount },
  });

  res.status(201).json({ success: true, data: { payout } });
});

export const markPayoutPaid = asyncHandler(async (req: Request, res: Response) => {
  const input = markPayoutPaidSchema.parse(req.body);
  const payout = await AffiliatePayoutModel.findById(req.params.id);
  if (!payout) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Payout introuvable');
  }

  payout.status = AffiliatePayoutStatus.PAID;
  payout.method = input.method;
  payout.reference = input.reference;
  payout.processedBy = req.user!.id as never;
  await payout.save();

  await AffiliateConversionModel.updateMany(
    { affiliate: payout.affiliate, status: CommissionStatus.AVAILABLE },
    { $set: { status: CommissionStatus.PAID } },
  );

  await AuditService.log({
    actor: req.user!.id,
    action: 'admin.payout_marked_paid',
    entityType: 'AffiliatePayout',
    entityId: String(payout._id),
    metadata: { reference: input.reference },
  });

  res.status(200).json({ success: true, data: { payout } });
});
