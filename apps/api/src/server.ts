import 'dotenv/config';
import { createApp } from './app.js';
import { connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  app.listen(env.API_PORT, () => {
    logger.info(`API démarrée sur le port ${env.API_PORT} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Échec du démarrage du serveur');
  process.exit(1);
});
