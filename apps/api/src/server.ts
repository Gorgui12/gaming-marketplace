import 'dotenv/config';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { PaymentService } from './modules/payments/payments.service.js';
import { EmailService } from './lib/email/email.service.js';
import type { Server } from 'node:http';

// Fréquence du balayage des paiements abandonnés (filet de sécurité anti
// blocage des annonces si le webhook provider est perdu).
const STALE_PAYMENT_SWEEP_MS = 5 * 60 * 1000;

// Les PaaS (Fly.io, Railway, Render, Heroku...) injectent le port d'écoute
// dans `PORT` et y routent le trafic entrant. `API_PORT` reste la valeur de
// confort pour le dev local. `PORT` prend donc la priorité dès qu'il existe.
const PORT = Number(process.env.PORT) || env.API_PORT;

// Les conteneurs ne sont atteignables que via l'interface publique : écouter
// sur 127.0.0.1 (défaut d'Express) rendrait l'API injoignable depuis le proxy.
const HOST = process.env.HOST || '0.0.0.0';

// Fenêtre laissée à l'arrêt propre avant le SIGKILL de Fly.
const SHUTDOWN_TIMEOUT_MS = 10_000;

let server: Server | undefined;

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  server = app.listen(PORT, HOST, () => {
    logger.info(`API démarrée sur http://${HOST}:${PORT} (${env.NODE_ENV})`);
  });

  // Diagnostic Resend au démarrage : si l'API est injoignable (mauvaise clé,
  // quota épuisé...), c'est visible dès le boot dans les logs — au lieu
  // d'attendre le premier échec d'email.
  const resend = await EmailService.verifyConnection();
  if (resend.ok) {
    logger.info({ from: env.RESEND_FROM }, 'Resend joignable au démarrage');
  } else {
    logger.warn(
      { from: env.RESEND_FROM, err: resend.error },
      'Resend INJOIGNABLE au démarrage — les emails ne partiront pas. Vérifier RESEND_API_KEY.',
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

// Arrêt propre : Fly envoie SIGTERM avant chaque déploiement et avant chaque
// scale-down, et n'accorde qu'une courte fenêtre avant le SIGKILL. Sans ça,
// les requêtes en vol (et le pool MongoDB) sont coupés net. Le process ne
// quitte qu'après fermeture du serveur HTTP puis de la connexion Mongo.
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info(`${signal} reçu — arrêt propre en cours`);
  const forceExit = setTimeout(() => {
    logger.error('Arrêt propre dépassé — sortie forcée');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // server.close() cesse d'accepter de nouvelles connexions et attend la
    // fin des requêtes déjà en vol avant de rappeler le callback.
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
    await disconnectDb();
    clearTimeout(forceExit);
    logger.info('Arrêt propre terminé');
  } catch (err) {
    logger.error({ err }, 'Erreur pendant l\'arrêt propre');
  } finally {
    process.exit(0);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Échec du démarrage du serveur');
  process.exit(1);
});
