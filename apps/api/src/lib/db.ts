import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let connected = false;

export async function connectDb(): Promise<void> {
  if (connected) return;
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  connected = true;
  logger.info('MongoDB connecté');
}

export async function disconnectDb(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
