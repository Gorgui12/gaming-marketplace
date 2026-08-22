import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { PaymentService } from './payments.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Toujours répondre 200 rapidement une fois l'IPN acquitté (même si déjà
 * traité) — PayDunya retente en cas d'erreur, ce qui est acceptable, mais
 * on ne veut pas provoquer de retries inutiles sur une erreur de
 * traitement qui ne se résoudra pas par un simple retry.
 */
export const handlePayDunyaIpn = asyncHandler(async (req: Request, res: Response) => {
  try {
    await PaymentService.handleWebhook(req.body, req.headers as Record<string, string>);
  } catch (err) {
    logger.error({ err }, 'Erreur traitement IPN PayDunya');
    // Exception: erreur de hash invalide -> on laisse remonter en 401 pour
    // qu'un vrai flood malveillant ne soit pas silencieusement accepté.
    if ((err as { statusCode?: number })?.statusCode === 401) {
      throw err;
    }
  }
  res.status(200).json({ success: true, data: { received: true } });
});
