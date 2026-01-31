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
// ✅ OUTBOUND: FAST (replies + interactive buttons + receipt pdf)
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

export type OutboundButton = { id: string; title: string };

function safeJobId(id: string) {
  // BullMQ custom id: keep it clean + short
  return String(id || '')
    .replace(/[:\s]/g, '_')        // replace colon + spaces
    .replace(/[^\w.-]/g, '_')      // keep only [a-zA-Z0-9_ . -]
    .slice(0, 240);
}

// ✅ Text replies (interactive/fast)
export const queueOutboundMessage = async (phoneNumber: string, message: string, jobId?: string, meta?: { dbMessageId?: string }, delay: number = 0) => {
  const finalJobId = safeJobId(jobId || `reply_${phoneNumber}_${Date.now()}`);
  await replyQueue.add('send-text', { phoneNumber, message, ...meta }, { jobId: finalJobId, delay });
};

// ✅ Bulk/summaries/pdf links (slower)
export const queueOutboundBulk = async (phoneNumber: string, message: string, jobId?: string) => {
  const finalJobId = safeJobId(jobId || `bulk_${phoneNumber}_${Date.now()}`);
  await bulkQueue.add('send-text', { phoneNumber, message }, { jobId: finalJobId });
};

// ============================================================
// ✅ Interactive Buttons (QUEUED)
// Worker must handle job.name === 'send-buttons'
// Payload: { phoneNumber, bodyText, buttons }
// ============================================================
export const queueOutboundButtons = async (
  phoneNumber: string,
  bodyText: string,
  buttons: OutboundButton[],
  jobId?: string,
  delay: number = 0
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
    { jobId: finalJobId, delay }
  );
};

// ============================================================
// ✅ List Message (QUEUED)
// Worker must handle job.name === 'send-list'
// ============================================================
export const queueOutboundList = async (
  phoneNumber: string,
  bodyText: string,
  buttonText: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[],
  jobId?: string,
  delay: number = 0
) => {
  const finalJobId = safeJobId(jobId || `list_${phoneNumber}_${Date.now()}`);

  await replyQueue.add(
    'send-list',
    {
      phoneNumber,
      bodyText: String(bodyText || '').slice(0, 1024),
      buttonText: String(buttonText || '').slice(0, 20),
      sections
    },
    { jobId: finalJobId, delay }
  );
};

// ============================================================
// ✅ Sale response (text + buttons)
// Worker must handle job.name === 'send-sale-response'
// ============================================================
export const queueSaleResponse = async (
  phoneNumber: string,
  message: string,
  bodyText: string,
  buttons: OutboundButton[],
  jobId?: string
) => {
  const finalJobId = safeJobId(jobId || `sale_${phoneNumber}_${Date.now()}`);

  await replyQueue.add(
    'send-sale-response',
    { phoneNumber, message, bodyText, buttons },
    { jobId: finalJobId }
  );
};

export const queueWelcomeResponse = async (
  phoneNumber: string,
  message: string,
  loginUrl: string,
  jobId?: string
) => {
  const finalJobId = safeJobId(jobId || `welcome_${phoneNumber}_${Date.now()}`);

  await replyQueue.add(
    'send-welcome-response',
    { phoneNumber, message, loginUrl },
    { jobId: finalJobId }
  );
};

// ============================================================
// ✅ Registration Complete (Text + Text + Multiple Button Batches)
// Worker must handle job.name === 'send-registration-complete'
// ============================================================
export const queueRegistrationComplete = async (
  phoneNumber: string,
  welcomeMsg: string,
  trialMsg: string,
  menuBatches: { bodyText: string; buttons: OutboundButton[] }[],
  jobId?: string
) => {
  const finalJobId = safeJobId(jobId || `reg_complete_${phoneNumber}_${Date.now()}`);

  await replyQueue.add(
    'send-registration-complete',
    { phoneNumber, welcomeMsg, trialMsg, menuBatches },
    { jobId: finalJobId }
  );
};

// ============================================================
// ✅ Receipt PDF (GENERATE + SEND DOCUMENT)
// Worker must handle job.name === 'send-sale-receipt'
// ============================================================
export async function queueSaleReceipt(
  phoneNumber: string,
  userId: string,
  saleId: string,
  jobId?: string
) {
  const finalJobId = safeJobId(jobId || `receipt_${phoneNumber}_${saleId}_${Date.now()}`);

  await replyQueue.add(
    'send-sale-receipt',
    { phoneNumber, userId, saleId },
    { jobId: finalJobId }
  );
}

// ============================================================
// ✅ Invoice PDF (GENERATE + SEND DOCUMENT)
// Worker must handle job.name === 'send-invoice-pdf'
// ============================================================
export async function queueInvoicePdf(
  phoneNumber: string,
  invoiceId: string,
  jobId?: string
) {
  const finalJobId = safeJobId(jobId || `invoice_${phoneNumber}_${invoiceId}_${Date.now()}`);

  await replyQueue.add(
    'send-invoice-pdf',
    { phoneNumber, invoiceId },
    { jobId: finalJobId }
  );
}

// ============================================================
// ✅ SOCKET EVENT PUBLISHER (For Workers)
// ============================================================
export const publishSocketEvent = async (room: string, event: string, data: any) => {
  try {
    await connection.publish('socket-events', JSON.stringify({ room, event, data }));
  } catch (e) {
    console.error('Failed to publish socket event via Redis', e);
  }
};
