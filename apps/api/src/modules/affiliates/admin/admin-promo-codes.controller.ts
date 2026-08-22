import type { Request, Response } from 'express';
import { createPromoCodeSchema } from '@gm/validation';
import { asyncHandler } from '../../../lib/async-handler.js';
import { PromoCodeModel } from '../promo-code.model.js';
import { AuditService } from '../../audit/audit.service.js';

export const listPromoCodes = asyncHandler(async (_req: Request, res: Response) => {
  const codes = await PromoCodeModel.find().sort({ createdAt: -1 }).limit(200);
  res.status(200).json({ success: true, data: { codes } });
});

export const createPromoCode = asyncHandler(async (req: Request, res: Response) => {
  const input = createPromoCodeSchema.parse(req.body);
  const promoCode = await PromoCodeModel.create({
    code: input.code.toUpperCase(),
    affiliate: input.affiliateId,
    campaign: input.campaignId,
    discountType: input.discountType,
    discountValue: input.discountValue,
    minimumOrderAmount: input.minimumOrderAmount,
    maximumDiscount: input.maximumDiscount,
    usageLimit: input.usageLimit,
    usagePerUser: input.usagePerUser,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  await AuditService.log({
    actor: req.user!.id,
    action: 'admin.promo_code_created',
    entityType: 'PromoCode',
    entityId: String(promoCode._id),
  });

  res.status(201).json({ success: true, data: { promoCode } });
});

export const deactivatePromoCode = asyncHandler(async (req: Request, res: Response) => {
  const promoCode = await PromoCodeModel.findByIdAndUpdate(
    req.params.id,
    { active: false },
    { new: true },
  );
  await AuditService.log({
    actor: req.user!.id,
    action: 'admin.promo_code_deactivated',
    entityType: 'PromoCode',
    entityId: req.params.id!,
  });
  res.status(200).json({ success: true, data: { promoCode } });
});
