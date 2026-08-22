import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Logger structuré. IMPORTANT: ne jamais logger de mot de passe, de token
 * de session, de credentialsPayload (identifiants de compte gaming) ou de
 * secret de paiement. Les middlewares utilisant ce logger doivent
 * explicitement whitelister les champs sérialisés, jamais tout l'objet
 * req.body brut.
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.credentialsPayload',
      '*.passwordHash',
      '*.secretKey',
      '*.apiKey',
    ],
    remove: true,
  },
});
