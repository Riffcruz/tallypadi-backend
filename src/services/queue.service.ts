// src/services/queue.service.ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// ============================================================
// ✅ Redis Connection (single shared connection)
// ============================================================
export const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

// ============================================================
// ✅ OUTBOUND: FAST (replies + interactive buttons)
// Queue name: outbound-replies
// ============================================================
export const replyQueue = new Queue('outbound-replies', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

// ============================================================
// ✅ OUTBOUND: SLOW (summaries, alerts, pdf links, long messages)
// Queue name: outbound-bulk
// ============================================================
export const bulkQueue = new Queue('outbound-bulk', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

// ============================================================
// ✅ INBOUND: Webhook messages (process in background)
// Queue name: incoming-messages
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

// ============================================================
// ✅ HELPERS (Controller uses these)
// ============================================================

// ✅ Text replies (interactive/fast)
export const queueOutboundMessage = async (phoneNumber: string, message: string, jobId?: string) => {
  const finalJobId = safeJobId(jobId || `reply_${phoneNumber}_${Date.now()}`);
  await replyQueue.add('send-text', { phoneNumber, message }, { jobId: finalJobId });
};


// ✅ Bulk/summaries/pdf links (slower)
export const queueOutboundBulk = async (phoneNumber: string, message: string, jobId?: string) => {
  await bulkQueue.add(
    'send-text',
    { phoneNumber, message },
    { jobId: jobId || `bulk:${phoneNumber}:${Date.now()}` }
  );
};

// ============================================================
// ✅ NEW: Interactive Buttons (QUEUED)
// Worker must handle job.name === 'send-buttons'
// Payload: { phoneNumber, bodyText, buttons }
// ============================================================
export type OutboundButton = { id: string; title: string };

// src/services/queue.service.ts

function safeJobId(id: string) {
  // BullMQ custom id cannot contain ":" (and avoid other weird chars too)
  return String(id || '')
    .replace(/[:\s]/g, '_')        // replace colon + spaces
    .replace(/[^\w.-]/g, '_')      // keep only [a-zA-Z0-9_ . -]
    .slice(0, 240);                // keep it short
}

export const queueOutboundButtons = async (
  phoneNumber: string,
  bodyText: string,
  buttons: { id: string; title: string }[],
  jobId?: string
) => {
  const safeButtons = (buttons || [])
    .slice(0, 3)
    .map((b) => ({
      id: String(b?.id || '').slice(0, 256),
      title: String(b?.title || '').slice(0, 20),
    }))
    .filter((b) => b.id && b.title);

  const finalJobId = safeJobId(jobId || `btn_${phoneNumber}_${Date.now()}`);

  await replyQueue.add(
    'send-buttons',
    { phoneNumber, bodyText: String(bodyText || '').slice(0, 1024), buttons: safeButtons },
    { jobId: finalJobId }
  );
};

export const queueSaleResponse = async (phoneNumber: string, message: string, bodyText: string, buttons: any[], jobId?: string) => {
  await replyQueue.add(
    'send-sale-response',
    { phoneNumber, message, bodyText, buttons },
    { jobId: jobId || `sale_${phoneNumber}_${Date.now()}` }
  );
};
