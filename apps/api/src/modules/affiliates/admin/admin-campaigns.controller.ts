import type { Request, Response } from 'express';
import { asyncHandler } from '../../../lib/async-handler.js';
import { AffiliateCampaignModel } from '../affiliate-campaign.model.js';
import { AffiliateClickModel } from '../affiliate-click.model.js';

/**
 * §18/§22 — stats agrégées par campagne via aggregation pipeline (§29:
 * éviter les requêtes N+1 en bouclant sur chaque campagne).
 */
export const listCampaignsWithStats = asyncHandler(async (_req: Request, res: Response) => {
  const campaigns = await AffiliateCampaignModel.find().sort({ createdAt: -1 }).limit(200);
  const campaignIds = campaigns.map((c) => c._id);

  const clicksAgg = await AffiliateClickModel.aggregate([
    { $match: { campaign: { $in: campaignIds } } },
    { $group: { _id: '$campaign', clicks: { $sum: 1 } } },
  ]);
  // Note: AffiliateConversion ne porte pas directement `campaign` aujourd'hui
  // (attribution résolue au niveau affilié) — jointure possible via
  // promoCode->campaign si le besoin business se confirme. Laissé
  // volontairement simple au MVP (§36: tracking/attribution avant stats
  // avancées par campagne).

  const clicksByCampaign = new Map(clicksAgg.map((c) => [String(c._id), c.clicks]));

  const result = campaigns.map((c) => ({
    campaign: c,
    clicks: clicksByCampaign.get(String(c._id)) ?? 0,
  }));

  res.status(200).json({ success: true, data: { campaigns: result } });
});
