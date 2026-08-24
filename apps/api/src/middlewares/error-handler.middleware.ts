import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors/app-error.js';
import { ErrorCode } from '../lib/errors/error-codes.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Données invalides',
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, 'AppError 5xx');
    }
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Erreurs de schéma Mongoose (ex: champ min/max violé) : problème de
  // données métier → 400 explicite au lieu d'un 500 générique.
  if (err instanceof Error && err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: { code: ErrorCode.VALIDATION_ERROR, message: err.message },
    });
    return;
  }

  logger.error({ err, path: req.path }, 'Erreur non gérée');

  res.status(500).json({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message:
        env.NODE_ENV === 'production'
          ? 'Une erreur interne est survenue'
          : err instanceof Error
            ? err.message
            : 'Erreur inconnue',
    },
  });
}
