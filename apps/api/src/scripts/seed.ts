import 'dotenv/config';
import argon2 from 'argon2';
import { UserRole } from '@gm/types';
import { GAMES_SEED } from '@gm/config';
import { connectDb, disconnectDb } from '../lib/db.js';
import { GameModel } from '../modules/games/game.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

async function seed(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Le seed ne doit jamais être exécuté en production');
  }

  await connectDb();

  for (const game of GAMES_SEED) {
    await GameModel.findOneAndUpdate({ slug: game.slug }, game, { upsert: true, new: true });
  }
  logger.info(`${GAMES_SEED.length} jeu(x) seedé(s)`);

  const devAdminEmail = 'admin@dev.local';
  const existingAdmin = await UserModel.findOne({ email: devAdminEmail });
  if (!existingAdmin) {
    await UserModel.create({
      email: devAdminEmail,
      passwordHash: await argon2.hash('ChangeMe123!'),
      firstName: 'Dev',
      lastName: 'Admin',
      username: 'devadmin',
      country: 'SN',
      currency: 'XOF',
      roles: [UserRole.SUPER_ADMIN],
      emailVerified: true,
    });
    logger.info(`Admin de dev créé: ${devAdminEmail} / ChangeMe123! (à changer immédiatement)`);
  }

  await disconnectDb();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
