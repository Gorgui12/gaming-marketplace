import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { pinoHttp } from 'pino-http';
import { env, corsAllowedOrigins } from './config/env.js';
import { logger } from './lib/logger.js';
import { attachUser } from './middlewares/auth.middleware.js';
import { globalRateLimiter } from './middlewares/rate-limit.middleware.js';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { listingsRouter } from './modules/listings/listings.routes.js';
import { transactionsRouter } from './modules/transactions/transactions.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { disputesRouter } from './modules/disputes/disputes.routes.js';
import { affiliatesRouter } from './modules/affiliates/affiliates.routes.js';
import { adminAffiliatesRouter } from './modules/affiliates/admin/admin-affiliates.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { adminGamesRouter } from './modules/games/admin-games.routes.js';
import { gamesRouter } from './modules/games/games.routes.js';
import { adminListingsRouter } from './modules/listings/admin-listings.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { reviewsRouter } from './modules/reviews/reviews.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { messagingRouter } from './modules/messaging/messaging.routes.js';
import { adminMessagesRouter } from './modules/messaging/admin-messages.routes.js';
import { blogRouter } from './modules/blog/blog.routes.js';
import { adminBlogRouter } from './modules/blog/admin-blog.routes.js';

export function createApp(): Express {
  const app = express();

  // Derrière un proxy, `req.ip` et `req.protocol` ne sont corrects que si
  // Express fait confiance au proxy. Sans ça, TOUS les clients partagent l'IP
  // du proxy et tombent dans un seul bucket de rate limit (ce que
  // express-rate-limit v7 signale d'ailleurs), `req.secure` reste false malgré
  // le TLS, et le hachage d'IP de l'anti-fraude affiliés perd toute granularité.
  // Le nombre de sauts dépend de l'hébergeur (Render 2, Fly 1, local 0) : il
  // vient de TRUST_PROXY_HOPS, 0 par défaut car un nombre faux est pire
  // qu'un absent — il faut le poser explicitement en production.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(
    cors({
      origin: corsAllowedOrigins,
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  // PayDunya poste son IPN en application/x-www-form-urlencoded (pas en
  // JSON) avec une structure imbriquée (data[status], data[invoice][token],
  // data[custom_data][internal_reference]...). `extended: true` active le
  // parsing des objets imbriqués via `qs`, indispensable pour lire
  // req.body.data.invoice.token comme documenté par PayDunya.
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(mongoSanitize());

  // Sonde de santé de la plateforme (Fly) et des orchestrateurs : déclarée
  // avant le rate limiter global pour que le trafic d'infrastructure ne
  // consomme jamais le quota des utilisateurs, ni ne fasse échouer la sonde
  // quand le quota est atteint.
  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  app.use(globalRateLimiter);
  app.use(attachUser);

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/listings', listingsRouter);
  app.use('/api/v1/games', gamesRouter);
  app.use('/api/v1/transactions', transactionsRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/disputes', disputesRouter);
  app.use('/api/v1/affiliates', affiliatesRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/admin', adminAffiliatesRouter);
  app.use('/api/v1/admin', adminGamesRouter);
  app.use('/api/v1/admin', adminListingsRouter);
  app.use('/api/v1/uploads', uploadsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/reviews', reviewsRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/conversations', messagingRouter);
  app.use('/api/v1/blog', blogRouter);
  app.use('/api/v1/admin', adminMessagesRouter);
  app.use('/api/v1/admin', adminBlogRouter);

  app.use(errorHandlerMiddleware);

  return app;
}
