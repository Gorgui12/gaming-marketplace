import { Router } from 'express';
import { requireAuth, requireEmailVerified } from '../../middlewares/auth.middleware.js';
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
// Devenir affilié, c'est ouvrir droit à des commissions : réservé aux emails
// confirmés, sinon un compte éphémère suffit à s'insérer dans le système.
affiliatesRouter.post('/apply', requireEmailVerified, applyForAffiliate);
affiliatesRouter.get('/me', getAffiliateDashboard);
affiliatesRouter.post('/campaigns', requireEmailVerified, createCampaign);
affiliatesRouter.get('/campaigns', listMyCampaigns);
