import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import mongoose from 'mongoose';
import { env } from './config/env';

async function boot() {
  // ✅ Important: do NOT buffer queries when disconnected
  mongoose.set('bufferCommands', false);

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
  } as any);

  console.log('✅ Worker connected to MongoDB');

  // ✅ start ONLY the Worker listeners (and ONLY once)
  await import('./services/workers');

  console.log('🚀 Worker started and listening...');
}

boot().catch((err) => {
  console.error('❌ Worker boot failed:', err);
  process.exit(1);
});
