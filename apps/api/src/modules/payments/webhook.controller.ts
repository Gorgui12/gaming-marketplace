import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { PaymentService } from './payments.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Contrôleur générique pour toutes les routes webhook de paiement: il
 * délègue à PaymentService.handleWebhook, qui utilise le provider actif
 * via la configuration (PAYMENT_PROVIDER). Une seule implémentation sert
 * donc à la fois l'IPN PayDunya et le webhook UnitechPay.
 *
 * Politique de réponse, volontairement stricte :
 *  - 4xx (signature invalide, payload malformé, montant incohérent) → on
 *    remonte l'erreur. Le provider voit un échec et retentera, ce qui est le
 *    bon comportement : acquitter un webhook qu'on a refusé de traiter
 *    masquerait définitivement la livraison.
 *  - 5xx / erreur inattendue → on acquitte quand même en 200. Une erreur
 *    interne ne se résoudra pas par un retry, et le provider qui boucle
 *    sur un bug de notre côté finit par nous bloquer.
 */
export const handlePaymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  try {
    await PaymentService.handleWebhook(req.body, req.headers as Record<string, string>);
  } catch (err) {
    logger.error({ err }, 'Erreur traitement webhook de paiement');
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (typeof statusCode === 'number' && statusCode < 500) {
      throw err;
    }
  }
  res.status(200).json({ success: true, data: { received: true } });
});
