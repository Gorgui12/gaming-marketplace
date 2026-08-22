import type { ErrorCode } from './error-codes.js';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(code: ErrorCode, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static notFound(code: ErrorCode, message: string): AppError {
    return new AppError(code, message, 404);
  }

  static forbidden(message = 'Accès refusé'): AppError {
    return new AppError('FORBIDDEN' as ErrorCode, message, 403);
  }

  static unauthorized(message = 'Authentification requise'): AppError {
    return new AppError('UNAUTHORIZED' as ErrorCode, message, 401);
  }

  static conflict(code: ErrorCode, message: string): AppError {
    return new AppError(code, message, 409);
  }
}
