import { Worker } from 'bullmq';
import { connection } from './queues';
import { sendWhatsAppText } from './whatsapp.service';

// ============================================================
// WORKER: DAILY SUMMARIES (Outbound - Rate Limited)
// ============================================================
export const summaryWorker = new Worker(
  'daily-summary',
  async (job) => {
    const { phoneNumber, message } = job.data;
    console.log(`📤 Sending summary to ${phoneNumber}...`);
    await sendWhatsAppText(phoneNumber, message);
  },
  {
    connection,
    limiter: { max: 20, duration: 1000 }, // safer than 80/sec
    lockDuration: 60_000,
  }
);

summaryWorker.on('active', (job) => console.log(`🚀 Summary active: ${job.data.phoneNumber}`));
summaryWorker.on('completed', (job) => console.log(`✅ Summary sent: ${job.data.phoneNumber}`));
summaryWorker.on('failed', (job, err) =>
  console.error(`❌ Summary failed [Attempt ${job?.attemptsMade ?? 'N/A'}]: ${err.message}`)
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
    concurrency: 10,              // ✅ reduce from 50 for stability
    stalledInterval: 10000,
    lockDuration: 5 * 60 * 1000,  // ✅ 5 mins for long Gemini calls
  }
);

messageWorker.on('active', (job) => console.log(`⏩ Active job: ${job.data.from}`));
messageWorker.on('completed', (job) => console.log(`✔️ Done: ${job.data.from}`));
messageWorker.on('failed', (job, err) =>
  console.error(`❌ Message failed [Attempt ${job?.attemptsMade ?? 'N/A'}]: ${err.message}`)
);
messageWorker.on('stalled', (jobId) => console.warn(`⚠️ Job stalled: ${jobId}`));
