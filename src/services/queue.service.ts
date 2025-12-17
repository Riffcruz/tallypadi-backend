import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

// OUTBOUND (WhatsApp replies, summaries, etc.)
export const notificationQueue = new Queue('daily-summary', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

// INBOUND (messages from webhook to worker)
export const messageQueue = new Queue('incoming-messages', {
  connection,
  defaultJobOptions: {
    attempts: 1000,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 500,
  },
});

export const queueOutboundMessage = async (phoneNumber: string, message: string) => {
  if (!phoneNumber || !message || !message.trim()) return;

  await notificationQueue.add(
    'send-text',
    { phoneNumber, message },
    { jobId: `outbound:${phoneNumber}:${Date.now()}` }
  );
};

// ✅ BULK SENDER (used for long reports split into chunks)
export const queueOutboundBulk = async (phoneNumber: string, messages: string[]) => {
  if (!phoneNumber || !Array.isArray(messages) || messages.length === 0) return;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || !msg.trim()) continue;

    await notificationQueue.add(
      'send-text',
      { phoneNumber, message: msg },
      { jobId: `outbound:${phoneNumber}:${Date.now()}:${i}` }
    );
  }
};
