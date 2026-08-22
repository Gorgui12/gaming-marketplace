import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
  applyForAffiliate,
  createCampaign,
  getAffiliateDashboard,
  listMyCampaigns,
  recordClick,
} from './affiliates.controller.js';

export const affiliatesRouter = Router();

// Public — tracking de clic, pas d'auth requise (§4).
affiliatesRouter.post('/track-click', recordClick);

affiliatesRouter.use(requireAuth);
affiliatesRouter.post('/apply', applyForAffiliate);
affiliatesRouter.get('/me', getAffiliateDashboard);
affiliatesRouter.post('/campaigns', createCampaign);
affiliatesRouter.get('/campaigns', listMyCampaigns);
