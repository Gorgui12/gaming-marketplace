import type { Request, Response } from 'express';
import {
  reviewAffiliateApplicationSchema,
  updateAffiliateSchema,
  changeAffiliateTierSchema,
  updateAffiliateTierSchema,
} from '@gm/validation';
import { asyncHandler } from '../../../lib/async-handler.js';
import { AffiliateService } from '../affiliate.service.js';
import { AffiliateModel } from '../affiliate.model.js';
import { AffiliateConversionModel } from '../affiliate-conversion.model.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { ErrorCode } from '../../../lib/errors/error-codes.js';

export const listAffiliates = asyncHandler(async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const affiliates = await AffiliateService.listForAdmin({ status });
  res.status(200).json({ success: true, data: { affiliates } });
});

export const reviewApplication = asyncHandler(async (req: Request, res: Response) => {
  const decision = reviewAffiliateApplicationSchema.parse(req.body);
  const affiliate = await AffiliateService.review({
    affiliateId: req.params.id!,
    adminId: req.user!.id,
    decision,
  });
  res.status(200).json({ success: true, data: { affiliate } });
});

export const updateAffiliate = asyncHandler(async (req: Request, res: Response) => {
  const input = updateAffiliateSchema.parse(req.body);
  const affiliate = await AffiliateModel.findById(req.params.id);
  if (!affiliate) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Affilié introuvable');
  }
  if (input.tierSlug) {
    await AffiliateService.changeTier({
      affiliateId: String(affiliate._id),
      adminId: req.user!.id,
      tierSlug: input.tierSlug,
      commissionRate: input.commissionRate,
    });
    res.status(200).json({ success: true, data: { affiliate } });
    return;
  }
  if (input.status) {
    await AffiliateService.setStatus({
      affiliateId: String(affiliate._id),
      adminId: req.user!.id,
      status: input.status,
    });
  }
  if (input.commissionRate !== undefined) {
    affiliate.commissionRate = input.commissionRate;
    await affiliate.save();
  }
  res.status(200).json({ success: true, data: { affiliate } });
});

export const listTiers = asyncHandler(async (_req: Request, res: Response) => {
  const tiers = await AffiliateService.listTiers();
  res.status(200).json({ success: true, data: { tiers } });
});

export const updateTier = asyncHandler(async (req: Request, res: Response) => {
  const input = updateAffiliateTierSchema.parse(req.body);
  const tier = await AffiliateService.updateTier({
    tierId: req.params.id!,
    adminId: req.user!.id,
    ...input,
  });
  res.status(200).json({ success: true, data: { tier } });
});

export const changeTier = asyncHandler(async (req: Request, res: Response) => {
  const input = changeAffiliateTierSchema.parse(req.body);
  const affiliate = await AffiliateService.changeTier({
    affiliateId: req.params.id!,
    adminId: req.user!.id,
    ...input,
  });
  res.status(200).json({ success: true, data: { affiliate } });
});

export const getAffiliateConversions = asyncHandler(async (req: Request, res: Response) => {
  const conversions = await AffiliateConversionModel.find({ affiliate: req.params.id })
    .sort({ createdAt: -1 })
    .limit(200);
  res.status(200).json({ success: true, data: { conversions } });
});
