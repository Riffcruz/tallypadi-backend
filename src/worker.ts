import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { env } from './config/env';

async function boot() {
  // ✅ Optional but recommended: do not buffer commands forever
  mongoose.set('bufferCommands', false);

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 30000, // wait up to 30s to find Mongo
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
  } as any);

  console.log('✅ Worker connected to MongoDB');

  mongoose.connection.on('disconnected', () => {
    console.error('❌ Worker MongoDB disconnected');
  });

  mongoose.connection.on('error', (e) => {
    console.error('❌ Worker MongoDB error:', e);
  });

  // ✅ Start workers only after Mongo is connected
  await import('./services/workers');

  console.log('🚀 Worker started and listening...');
}

boot().catch((err) => {
  console.error('❌ Worker boot failed:', err);
  process.exit(1);
});
