import { Worker } from 'bullmq';
import { connection } from './queue.service'; // use the exported connection
import { sendWhatsAppText } from './whatsapp.service';


// ============================================================
// WORKER: OUTBOUND REPLIES (FAST / interactive)
// ============================================================
export const replyWorker = new Worker(
  'outbound-replies',
  async (job) => {
    const { phoneNumber, message } = job.data;
    console.log(`💬 Reply -> ${phoneNumber}`);
    await sendWhatsAppText(phoneNumber, message); // ✅ throws on final failure
  },
  {
    connection,
    limiter: { max: 15, duration: 1000 }, // faster than bulk
    concurrency: 10,
    lockDuration: 60_000,
  }
);

replyWorker.on('completed', (job) => console.log(`✅ Reply sent: ${job.data.phoneNumber}`));
replyWorker.on('failed', (job, err) =>
  console.error(`❌ Reply failed [Attempt ${job?.attemptsMade ?? 'N/A'}]: ${err.message}`)
);

// ============================================================
// WORKER: OUTBOUND BULK (SLOW / summaries / alerts)
// ============================================================
export const bulkWorker = new Worker(
  'outbound-bulk',
  async (job) => {
    const { phoneNumber, message } = job.data;
    console.log(`📤 Bulk -> ${phoneNumber}`);
    await sendWhatsAppText(phoneNumber, message);
  },
  {
    connection,
    limiter: { max: 5, duration: 1000 }, // safer bulk limiter
    concurrency: 3,
    lockDuration: 60_000,
  }
);

bulkWorker.on('completed', (job) => console.log(`✅ Bulk sent: ${job.data.phoneNumber}`));
bulkWorker.on('failed', (job, err) =>
  console.error(`❌ Bulk failed [Attempt ${job?.attemptsMade ?? 'N/A'}]: ${err.message}`)
);

// ============================================================
// WORKER: INCOMING MESSAGES (Inbound)
// ============================================================
export const messageWorker = new Worker(
  'incoming-messages',
  async (job) => {
    const { from, text, messageId, mediaId, isVoiceMessage, profileName } = job.data;
    console.log(`⚡ Worker processing ${from} (${messageId})...`);

    const { handleMessageLogic } = await import('../controllers/whatsapp.controller');
    await handleMessageLogic(from, text, messageId, mediaId, isVoiceMessage, profileName);
  },
  {
    connection,
    concurrency: 10,
    stalledInterval: 10_000,
    lockDuration: 5 * 60 * 1000,
  }
);

messageWorker.on('completed', (job) => console.log(`✔️ Done: ${job.data.from}`));
messageWorker.on('failed', (job, err) =>
  console.error(`❌ Message failed [Attempt ${job?.attemptsMade ?? 'N/A'}]: ${err.message}`)
);
