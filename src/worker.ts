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
    maxPoolSize: 100,     
    minPoolSize: 10,
  } as any);

  console.log('✅ Worker connected to MongoDB');

  // ✅ start workers ONLY AFTER DB is ready
  const workers = await import('./services/workers');

  console.log('🚀 Worker started and listening...');

  // ✅ Graceful Shutdown
  const shutdown = async () => {
    console.log('🛑 Shutting down workers...');
    await Promise.all([
      workers.replyWorker.close(),
      workers.bulkWorker.close(),
      workers.messageWorker.close(),
    ]);
    await mongoose.disconnect();
    console.log('✅ Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

boot().catch((err) => {
  console.error('❌ Worker boot failed:', err);
  process.exit(1);
});
