import { z } from 'zod';

export const applyForAffiliateSchema = z.object({
  displayName: z.string().min(2).max(80),
  description: z.string().max(1000).optional(),
  platforms: z
    .array(z.enum(['TIKTOK', 'YOUTUBE', 'INSTAGRAM', 'FACEBOOK', 'WHATSAPP', 'TELEGRAM']))
    .min(1),
  followerCount: z.number().int().nonnegative().optional(),
  audienceDescription: z.string().max(500).optional(),
});
export type ApplyForAffiliateInput = z.infer<typeof applyForAffiliateSchema>;

export const recordAffiliateClickSchema = z.object({
  affiliateCode: z.string().min(1).max(30),
  sessionId: z.string().min(1),
  landingPage: z.string().min(1),
  referrer: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  campaignId: z.string().optional(),
  deviceType: z.string().optional(),
});
export type RecordAffiliateClickInput = z.infer<typeof recordAffiliateClickSchema>;

export const createAffiliateCampaignSchema = z.object({
  name: z.string().min(2).max(120),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
export type CreateAffiliateCampaignInput = z.infer<typeof createAffiliateCampaignSchema>;

// --- Admin ---

export const reviewAffiliateApplicationSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  commissionRate: z.number().min(0).max(1).optional(),
  tierSlug: z.string().optional(),
  notes: z.string().max(500).optional(),
});
export type ReviewAffiliateApplicationInput = z.infer<typeof reviewAffiliateApplicationSchema>;

export const updateAffiliateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'TERMINATED']).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  tierSlug: z.string().optional(),
});
export type UpdateAffiliateInput = z.infer<typeof updateAffiliateSchema>;

export const createPromoCodeSchema = z.object({
  code: z.string().min(3).max(30),
  affiliateId: z.string().optional(),
  campaignId: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  discountValue: z.number().positive(),
  minimumOrderAmount: z.number().nonnegative().optional(),
  maximumDiscount: z.number().positive().optional(),
  usageLimit: z.number().int().positive().optional(),
  usagePerUser: z.number().int().positive().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;

export const createAffiliatePayoutSchema = z.object({
  affiliateId: z.string().min(1),
  amount: z.number().positive(),
});
export type CreateAffiliatePayoutInput = z.infer<typeof createAffiliatePayoutSchema>;

export const markPayoutPaidSchema = z.object({
  method: z.string().min(1).max(60),
  reference: z.string().min(1).max(120),
});
export type MarkPayoutPaidInput = z.infer<typeof markPayoutPaidSchema>;
