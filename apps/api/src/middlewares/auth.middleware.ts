import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors/app-error.js';
import { verifySessionToken } from '../modules/auth/session.js';

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
 */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[process.env.SESSION_COOKIE_NAME ?? 'gm_session'];
  if (!token) {
    next();
    return;
  }
  const session = verifySessionToken(token);
  if (session) {
    req.user = { id: session.userId, roles: session.roles };
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  next();
}
