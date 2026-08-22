import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limit spécifique et plus strict pour les routes sensibles au
 * brute-force (login) — volontairement séparé du rate limit global.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Trop de tentatives, réessayez plus tard' },
  },
});

/**
 * Rate limit dédié aux webhooks entrants — plus permissif car le provider
 * peut retenter légitimement, mais protège contre un flood malveillant.
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
