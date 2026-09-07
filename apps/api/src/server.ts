import 'dotenv/config';
import { createApp } from './app.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { PaymentService } from './modules/payments/payments.service.js';

// Fréquence du balayage des paiements abandonnés (filet de sécurité anti
// blocage des annonces si le webhook provider est perdu).
const STALE_PAYMENT_SWEEP_MS = 5 * 60 * 1000;

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  app.listen(env.API_PORT, () => {
    logger.info(`API démarrée sur le port ${env.API_PORT} (${env.NODE_ENV})`);
  });

  // Balayage périodique : libère les annonces dont le paiement a été
  // abandonné/expiré sans que le webhook UnitechPay soit arrivé. unref()
  // pour ne pas maintenir le process vivant en cas d'arrêt.
  setInterval(() => {
    PaymentService.sweepStalePayments().catch((err) =>
      logger.error({ err }, 'Échec balayage paiements en attente'),
    );
  }, STALE_PAYMENT_SWEEP_MS).unref();
  logger.info(`Balayage paiements en attente démarré (toutes les ${STALE_PAYMENT_SWEEP_MS / 60000} min)`);
}

main().catch((err) => {
  logger.error({ err }, 'Échec du démarrage du serveur');
  process.exit(1);
});
