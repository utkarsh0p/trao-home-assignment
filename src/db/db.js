import mongoose from 'mongoose';
import { env } from '../lib/env.js';

/** Opens the single shared mongoose connection. Called once at boot. */
export async function connectDb() {
  if (!env.mongoUri) throw new Error('Missing required environment variable: MONGODB_URI');

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
