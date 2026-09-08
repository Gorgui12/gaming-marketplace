import { Router } from 'express';
import { UserRole } from '@gm/types';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../middlewares/rbac.middleware.js';
import {
  changeTier,
  getAffiliateConversions,
  listAffiliates,
  listTiers,
  reviewApplication,
  updateAffiliate,
  updateTier,
} from './admin-affiliates.controller.js';
import {
  createPromoCode,
  deactivatePromoCode,
  listPromoCodes,
} from './admin-promo-codes.controller.js';
import { createPayout, listPayouts, markPayoutPaid } from './admin-payouts.controller.js';
import { listCampaignsWithStats } from './admin-campaigns.controller.js';

export const adminAffiliatesRouter = Router();

adminAffiliatesRouter.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

// /admin/affiliates
adminAffiliatesRouter.get('/affiliates', listAffiliates);
adminAffiliatesRouter.post('/affiliates/:id/review', reviewApplication);
adminAffiliatesRouter.patch('/affiliates/:id', updateAffiliate);
adminAffiliatesRouter.post('/affiliates/:id/tier', changeTier);
adminAffiliatesRouter.get('/affiliates/:id/conversions', getAffiliateConversions);

// /admin/affiliate-tiers
adminAffiliatesRouter.get('/affiliate-tiers', listTiers);
adminAffiliatesRouter.patch('/affiliate-tiers/:id', updateTier);

// /admin/promo-codes
adminAffiliatesRouter.get('/promo-codes', listPromoCodes);
adminAffiliatesRouter.post('/promo-codes', createPromoCode);
adminAffiliatesRouter.post('/promo-codes/:id/deactivate', deactivatePromoCode);

// /admin/affiliate-payouts
adminAffiliatesRouter.get('/affiliate-payouts', listPayouts);
adminAffiliatesRouter.post('/affiliate-payouts', createPayout);
adminAffiliatesRouter.post('/affiliate-payouts/:id/mark-paid', markPayoutPaid);

// /admin/affiliate-campaigns
adminAffiliatesRouter.get('/affiliate-campaigns', listCampaignsWithStats);
