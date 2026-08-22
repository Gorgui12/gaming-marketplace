import { Router } from 'express';
import { webhookRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handlePayDunyaIpn } from './webhook.controller.js';

export const paymentsRouter = Router();

// L'IPN doit rester public (appelé par PayDunya, pas par un utilisateur
// authentifié) mais protégé par vérification de hash dans le provider +
// rate limiting dédié.
paymentsRouter.post('/paydunya/ipn', webhookRateLimiter, handlePayDunyaIpn);
