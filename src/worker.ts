import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import mongoose from 'mongoose';
import { env } from './config/env';

async function boot() {
  // ✅ do not buffer queries when disconnected
  mongoose.set('bufferCommands', false);

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    maxPoolSize: 100,     // ✅ helps on small VPS
    minPoolSize: 1,
  } as any);

  console.log('✅ Worker connected to MongoDB');

  // ✅ start workers ONLY AFTER DB is ready
  await import('./services/workers');

  console.log('🚀 Worker started and listening...');
}

boot().catch((err) => {
  console.error('❌ Worker boot failed:', err);
  process.exit(1);
});
