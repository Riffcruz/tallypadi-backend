import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// ✅ Export connection so worker/services can reuse same Redis connection
export const connection = new IORedis(
  process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }
);

// ============================================================
// QUEUE 1: OUTBOUND (WhatsApp replies / summaries)  ✅ EXPORT
// ============================================================
export const notificationQueue = new Queue('daily-summary', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

// Helper to queue outbound messages
// keep IDs BullMQ-safe (no ":" etc)
function safeJobId(id: string) {
  return String(id || '')
    .replace(/[:\s]/g, '_')   // replace colon + spaces
    .replace(/[^\w.-]/g, '_') // keep only [a-zA-Z0-9_ . -]
    .slice(0, 240);
}

export const queueOutboundMessage = async (phoneNumber: string, message: string) => {
  const text = String(message || '').trim();
  if (!text) return;

  const finalJobId = safeJobId(`outbound_${phoneNumber}_${Date.now()}`);

  await notificationQueue.add(
    'send-text',
    { phoneNumber, message: text },
    { jobId: finalJobId }
  );
};


// ============================================================
// QUEUE 2: INBOUND (incoming WhatsApp messages) ✅ EXPORT
// ============================================================
export const messageQueue = new Queue('incoming-messages', {
  connection,
  defaultJobOptions: {
    attempts: 1000,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 500,
  },
});
