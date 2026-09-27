import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors/app-error.js';
import { ErrorCode } from '../lib/errors/error-codes.js';
import { verifySessionToken } from '../modules/auth/session.js';
import { UserModel } from '../modules/users/user.model.js';
import { UserAccountStatus } from '@gm/types';

export interface AuthenticatedUser {
  id: string;
  roles: string[];
  /**
   * Relu en base à chaque requête (comme `status`) et non dans le cookie :
   * sans cela, un email nouvellement confirmé resterait « non vérifié » côté
   * API pendant toute la durée de vie du cookie, et l'utilisateur ne pourrait
   * pas reprendre ses actions sensibles même après avoir cliqué sur le lien.
   */
  emailVerified: boolean;
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
 *  - revalider `emailVerified`, lui aussi susceptible de changer en cours de
 *    vie de la session (confirmation d'email, ou validation forcée par un
 *    administrateur) ;
 *  - rejeter un token dont `sessionVersion` ne correspond plus, ce qui
 *    invalide tous les cookies déjà émis lors d'un changement de statut,
 *    de rôle ou de mot de passe.
 *
 * Sans ces contrôles, un bannissement ou une révocation de privilèges
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
    .select('status roles sessionVersion emailVerified')
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
      req.user = {
        id: String(user._id),
        roles: user.roles,
        // `?? true` : les comptes créés avant l'introduction du champ
        // seraient sinon tous brutalement bloqués par le nouveau garde-fou.
        // Seuls les comptes explicitement `false` sont refusés.
        emailVerified: user.emailVerified ?? true,
      };
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

/**
 * Refuse les actions sensibles à un compte dont l'email n'a pas été confirmé.
 *
 * À poser APRÈS requireAuth. Sans cette étape, un compte créé avec une
 * adresse fantaisiste (ou la mailbox d'un tiers) restait pleinement
 * opérationnel : il pouvait vendre, acheter, déposer des fonds en séquestre
 * et puis disparaître — c'est-à-dire empocher sans jamais avoir répondu à un
 * seul email.
 *
 * La navigation et la lecture restent ouvertes : on ne casse pas le tunnel
 * d'inscription si l'email atterrit en courrier indésirable. Seules les
 * actions engageantes sont bloquées, et un lien de renvoi est fourni (§
 * /auth/resend-verification).
 */
export function requireEmailVerified(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  if (!req.user.emailVerified) {
    next(
      new AppError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        "Vous devez confirmer votre adresse email pour effectuer cette action. " +
          'Consultez votre boîte mail, ou renvoyez le lien de confirmation depuis la page /verify-email.',
        403,
      ),
    );
    return;
  }
  next();
}
