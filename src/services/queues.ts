import { Queue } from './memory-queue.lib';

// ✅ MOCK Redis Connection (No-op)
// We export this just in case other files import 'connection' expecting an object,
// but in the memory-queue world, we don't use it.
export const connection = {
    status: 'ready',
    on: () => {},
    quit: async () => {}
};

// ============================================================
// QUEUE 1: OUTBOUND (WhatsApp replies / summaries)  ✅ EXPORT
// ============================================================
export const notificationQueue = new Queue('daily-summary', {
  // connection, // No connection needed for memory queue
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

// Helper to queue outbound messages
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
  // connection,
  defaultJobOptions: {
    attempts: 1000,
    removeOnComplete: true,
    removeOnFail: 500,
  },
});