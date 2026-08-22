import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors/app-error.js';
import type { UserRole } from '@gm/types';

/**
 * requireRole('ADMIN','SUPER_ADMIN') -> autorise si l'utilisateur a AU MOINS
 * un des rôles listés. À utiliser après requireAuth dans la chaîne de
 * middlewares.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role as UserRole));
    if (!hasRole) {
      next(AppError.forbidden('Rôle insuffisant pour cette action'));
      return;
    }
    next();
  };
}
