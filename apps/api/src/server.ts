import 'dotenv/config';
import { createApp } from './app.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { PaymentService } from './modules/payments/payments.service.js';
import { EmailService } from './lib/email/email.service.js';

// Fréquence du balayage des paiements abandonnés (filet de sécurité anti
// blocage des annonces si le webhook provider est perdu).
const STALE_PAYMENT_SWEEP_MS = 5 * 60 * 1000;

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  app.listen(env.API_PORT, () => {
    logger.info(`API démarrée sur le port ${env.API_PORT} (${env.NODE_ENV})`);
  });

  // Diagnostic SMTP au démarrage : si le serveur de mail est injoignable
  // (mauvaises clés, port bloqué par le cloud...), c'est visible dès le
  // boot dans les logs — au lieu d'attendre le premier échec d'email.
  const smtp = await EmailService.verifyConnection();
  if (smtp.ok) {
    logger.info({ smtpHost: env.SMTP_HOST, smtpPort: env.SMTP_PORT }, 'SMTP joignable au démarrage');
  } else {
    logger.warn(
      { smtpHost: env.SMTP_HOST, smtpPort: env.SMTP_PORT, err: smtp.error },
      'SMTP INJOIGNABLE au démarrage — les emails ne partiront pas. Vérifier SMTP_HOST/PORT/identifiants.',
    );
  }

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
