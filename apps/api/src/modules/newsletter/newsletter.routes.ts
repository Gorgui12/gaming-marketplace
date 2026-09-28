import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { logger } from '../../lib/logger.js';
import { NewsletterService } from './newsletter.service.js';

/**
 * Declenchement de la newsletter par un cron externe.
 *
 * Monté sur /api/v1/internal/newsletter, VOLONTAIREMENT hors de
 * `adminRouter` : celui-ci impose un cookie de session (admin.routes.ts
 * applique `requireAuth` + `requireRole`) qu'un appel serveur-à-serveur de
 * cron-job.org ne peut pas fournir. Le secret joue ici le rôle de
 * l'authentification.
 *
 * Pourquoi un cron externe et pas un `setInterval` dans l'API : le
 * déploiement cible est Render en offre gratuite, qui endort l'instance après
 * quelques minutes d'inactivité. Le `setInterval` de server.ts (balayage des
 * paiements) souffre de ce sommeil — une notification peut partir avec
 * plusieurs heures de retard. Un cron externe, lui, réveille l'instance par
 * une requête.
 */

/** Nombre d'octets de hasard dans un secret de comparison. */
const SECRET_MIN_LENGTH = 16;

/**
 * Comparaison a temps constant.
 *
 * Un `===` sur des secrets laisse fuiter le nombre de caractères corrects via
 * le temps de comparaison, ce qui suffit pour reconstruire un secret octet
 * par octet. `timingSafeEqual` est la contrepartie standard ; elle suppose
 * que les deux buffers font la même taille, d'où le contrôle de longueur
 * juste avant.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Garde d'authentification du cron.
 *
 * Renvoie 503 (et non 401) quand aucun secret n'est configure : c'est un
 * probleme de configuration serveur, pas une tentative d'intrusion, et la
 * distinction evite qu'un exploitant passe une nuit a chercher une attaque
 * dans ses logs.
 */
export const requireCronSecret = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!env.CRON_SECRET || env.CRON_SECRET.length < SECRET_MIN_LENGTH) {
    logger.error(
      'CRON_SECRET absent ou trop court — endpoint de newsletter neutralise. Definir CRON_SECRET pour activer les envois automatiques.',
    );
    next(
      new AppError(
        ErrorCode.FORBIDDEN,
        'Declenchement automatique desactive (CRON_SECRET non configure)',
        503,
      ),
    );
    return;
  }

  const provided = req.headers['x-cron-secret'];
  const value = Array.isArray(provided) ? provided[0] : provided;

  if (!value || !secretsMatch(value, env.CRON_SECRET)) {
    next(new AppError(ErrorCode.FORBIDDEN, 'Secret cron invalide', 401));
    return;
  }

  next();
};

// Aucun paramètre de date sur cette route, volontairement.
//
// Une version précédente acceptait `?at=` pour rejouer une période. Avec la
// planification par `NEWSLETTER_DAYS`, ce paramètre est devenu un contournement :
// appeler avec la date d'un jour programmé forcerait l'envoi les autres jours.
// Le test d'envoi de l'admin ne passe pas par ici — il appelle directement
// `EmailService`, sans toucher à la clé de campagne.

export const sendNewsletter = asyncHandler(async (_req: Request, res: Response) => {
  const result = await NewsletterService.sendCampaign({
    initiatedBy: 'cron:external',
  });

  res.status(200).json({
    success: true,
    data: {
      alreadySent: result.alreadySent,
      recipientCount: result.recipientCount,
      successCount: result.successCount,
      failureCount: result.failureCount,
      listingCount: result.listingIds.length,
    },
  });
});

export const internalNewsletterRouter = Router();

internalNewsletterRouter.post('/send', requireCronSecret, sendNewsletter);
