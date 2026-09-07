import { Router } from 'express';
import { webhookRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handlePaymentWebhook } from './webhook.controller.js';

export const paymentsRouter = Router();

// Les webhooks doivent rester publics (appelés par le provider, pas par un
// utilisateur authentifié) mais protégés par vérification de signature dans
// le provider + rate limiting dédié.
//
// L'IPN PayDunya est conservé à l'identique: repasser PAYMENT_PROVIDER=paydunya
// dans .env suffit, la route reste fonctionnelle.
paymentsRouter.post('/paydunya/ipn', webhookRateLimiter, handlePaymentWebhook);
// Webhook UnitechPay (à configurer côté dashboard UnitechPay — voir
// docs/PAYMENTS.md). Même contrôleur générique que l'IPN PayDunya.
paymentsRouter.post('/unitechpay/webhook', webhookRateLimiter, handlePaymentWebhook);
