import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDb } from './config/db';

async function boot() {
  await connectDb();
  console.log('✅ Worker connected to MongoDB');

  // ✅ start workers ONLY AFTER DB is ready
  const workers = await import('./services/workers');

  console.log('🚀 Worker started and listening...');

  // ✅ Graceful Shutdown
  const shutdown = async () => {
    console.log('🛑 Shutting down workers...');
    const closePromises = [];
    if (workers.replyWorker) closePromises.push(workers.replyWorker.close());
    if (workers.bulkWorker) closePromises.push(workers.bulkWorker.close());
    if (workers.messageWorker) closePromises.push(workers.messageWorker.close());
    if (workers.notificationWorker) closePromises.push(workers.notificationWorker.close());
    if (workers.adAutomationWorker) closePromises.push(workers.adAutomationWorker.close());
    if (workers.marketplaceIndexWorker) closePromises.push(workers.marketplaceIndexWorker.close());
    if (workers.broadcastWorker) closePromises.push(workers.broadcastWorker.close());
    
    await Promise.all(closePromises);
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
