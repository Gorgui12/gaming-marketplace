import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { pinoHttp } from 'pino-http';
import { corsAllowedOrigins } from './config/env.js';
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
import { adminGamesRouter } from './modules/games/admin-games.routes.js';
import { gamesRouter } from './modules/games/games.routes.js';
import { adminListingsRouter } from './modules/listings/admin-listings.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';

export function createApp(): Express {
  const app = express();

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
  app.use(globalRateLimiter);
  app.use(attachUser);

  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/listings', listingsRouter);
  app.use('/api/v1/games', gamesRouter);
  app.use('/api/v1/transactions', transactionsRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/disputes', disputesRouter);
  app.use('/api/v1/affiliates', affiliatesRouter);
  app.use('/api/v1/admin', adminAffiliatesRouter);
  app.use('/api/v1/admin', adminGamesRouter);
  app.use('/api/v1/admin', adminListingsRouter);
  app.use('/api/v1/uploads', uploadsRouter);

  app.use(errorHandlerMiddleware);

  return app;
}
