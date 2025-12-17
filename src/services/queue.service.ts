import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

// ✅ interactive responses
export const replyQueue = new Queue('outbound-replies', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

// ✅ bulk/summaries/pdf links
export const bulkQueue = new Queue('outbound-bulk', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

// ✅ inbound
export const messageQueue = new Queue('incoming-messages', {
  connection,
  defaultJobOptions: {
    attempts: 1000,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 500,
  },
});

// ✅ This keeps your controller import EXACTLY as you want:
export const queueOutboundMessage = async (phoneNumber: string, message: string) => {
  await replyQueue.add(
    'send-text',
    { phoneNumber, message },
    { jobId: `reply:${phoneNumber}:${Date.now()}` }
  );
};

// optional helper if you need it
export const queueOutboundBulk = async (phoneNumber: string, message: string) => {
  await bulkQueue.add(
    'send-text',
    { phoneNumber, message },
    { jobId: `bulk:${phoneNumber}:${Date.now()}` }
  );
};
