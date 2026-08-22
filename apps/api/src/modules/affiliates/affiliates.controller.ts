import type { Request, Response } from 'express';
import {
  applyForAffiliateSchema,
  createAffiliateCampaignSchema,
  recordAffiliateClickSchema,
} from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { AffiliateService } from './affiliate.service.js';
import { AffiliateAttributionService } from './affiliate-attribution.service.js';
import { AffiliateCampaignModel } from './affiliate-campaign.model.js';
import { AffiliateModel } from './affiliate.model.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';

export const applyForAffiliate = asyncHandler(async (req: Request, res: Response) => {
  const input = applyForAffiliateSchema.parse(req.body);
  const affiliate = await AffiliateService.apply(req.user!.id, input);
  res.status(201).json({ success: true, data: { affiliate } });
});

export const getAffiliateDashboard = asyncHandler(async (req: Request, res: Response) => {
  const affiliate = await AffiliateService.getDashboard(req.user!.id);
  res.status(200).json({ success: true, data: { affiliate } });
});

/**
 * Endpoint public de tracking — appelé côté client depuis la page
 * /ref/:code avant redirection vers la marketplace (§4). Ne requiert pas
 * d'authentification: la majorité des clics viennent de visiteurs anonymes.
 */
export const recordClick = asyncHandler(async (req: Request, res: Response) => {
  const input = recordAffiliateClickSchema.parse(req.body);
  await AffiliateAttributionService.recordClick({
    affiliateCode: input.affiliateCode,
    sessionId: input.sessionId,
    landingPage: input.landingPage,
    referrer: input.referrer,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    campaignId: input.campaignId,
    deviceType: input.deviceType,
    ip: req.ip,
    userId: req.user?.id,
  });
  res.status(202).json({ success: true, data: null });
});

export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const input = createAffiliateCampaignSchema.parse(req.body);
  const affiliate = await AffiliateModel.findOne({ user: req.user!.id });
  if (!affiliate) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, "Vous n'avez pas de compte affilié");
  }
  const campaign = await AffiliateCampaignModel.create({
    name: input.name,
    affiliate: affiliate._id,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  res.status(201).json({ success: true, data: { campaign } });
});

export const listMyCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const affiliate = await AffiliateModel.findOne({ user: req.user!.id });
  if (!affiliate) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, "Vous n'avez pas de compte affilié");
  }
  const campaigns = await AffiliateCampaignModel.find({ affiliate: affiliate._id }).sort({
    createdAt: -1,
  });
  res.status(200).json({ success: true, data: { campaigns } });
});
