import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors/app-error.js';
import { verifySessionToken } from '../modules/auth/session.js';
import { UserModel } from '../modules/users/user.model.js';
import { UserAccountStatus } from '@gm/types';

export interface AuthenticatedUser {
  id: string;
  roles: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Vérifie la présence et la validité du cookie de session.
 * Ne lève jamais d'erreur si absent — c'est requireAuth qui décide si
 * l'authentification est obligatoire pour une route donnée. Ça permet de
 * réutiliser ce middleware globalement sans casser les routes publiques.
 *
 * Le token est stateless, donc on ne peut pas se fier à ses `roles` seul :
 * on relit le compte en base à chaque requête authentifiée pour
 *  - refuser un compte dont le statut n'est plus ACTIVE (bannissement) ;
 *  - utiliser les rôles réellement en base, pas ceux figés dans le cookie
 *    (une rétrogradation doit prendre effet immédiatement) ;
 *  - rejeter un token dont `sessionVersion` ne correspond plus, ce qui
 *    invalide tous les cookies déjà émis lors d'un changement de statut,
 *    de rôle ou de mot de passe.
 *
 * Sans ces trois contrôles, un bannissement ou une révocation de privilèges
 * restait sans effet pendant toute la durée de vie du cookie
 * (SESSION_TTL_DAYS, 7 jours par défaut).
 */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[process.env.SESSION_COOKIE_NAME ?? 'gm_session'];
  if (!token) {
    next();
    return;
  }

  const session = verifySessionToken(token);
  if (!session) {
    next();
    return;
  }

  UserModel.findById(session.userId)
    .select('status roles sessionVersion')
    .lean()
    .then((user) => {
      if (!user) {
        next();
        return;
      }
      if (user.status !== UserAccountStatus.ACTIVE) {
        next();
        return;
      }
      if ((user.sessionVersion ?? 0) !== session.sessionVersion) {
        next();
        return;
      }
      req.user = { id: String(user._id), roles: user.roles };
      next();
    })
    .catch(next);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  next();
}
