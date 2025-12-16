import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { env } from './config/env';

async function boot() {
  await mongoose.connect(env.mongoUri);
  console.log('✅ Worker connected to MongoDB');

  // ✅ Start BullMQ workers AFTER DB is ready
  await import('./services/workers');

  console.log('🚀 Worker started and listening...');
}

boot().catch((err) => {
  console.error('❌ Worker boot failed:', err);
  process.exit(1);
});
