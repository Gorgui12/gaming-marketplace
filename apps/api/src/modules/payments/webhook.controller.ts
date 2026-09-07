import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { PaymentService } from './payments.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Toujours répondre 200 rapidement une fois l'IPN acquitté (même si déjà
 * traité) — le provider retente en cas d'erreur, ce qui est acceptable,
 * mais on ne veut pas provoquer de retries inutiles sur une erreur de
 * traitement qui ne se résoudra pas par un simple retry.
 *
 * Contrôleur générique pour toutes les routes webhook de paiement: il
 * délègue à PaymentService.handleWebhook, qui utilise le provider actif
 * via la configuration (PAYMENT_PROVIDER). Une seule implémentation sert
 * donc à la fois l'IPN PayDunya et le webhook UnitechPay.
 */
export const handlePaymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  try {
    await PaymentService.handleWebhook(req.body, req.headers as Record<string, string>);
  } catch (err) {
    logger.error({ err }, 'Erreur traitement webhook de paiement');
    // Exception: erreur de signature invalide -> on laisse remonter en 401
    // pour qu'un vrai flood malveillant ne soit pas silencieusement accepté.
    if ((err as { statusCode?: number })?.statusCode === 401) {
      throw err;
    }
  }
  res.status(200).json({ success: true, data: { received: true } });
});
