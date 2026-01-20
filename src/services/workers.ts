// src/services/queue.worker.ts
import { Worker } from 'bullmq';
import { connection } from './queue.service';
import { sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppDocumentBuffer } from './whatsapp.service';
import { generateSaleReceiptPdfBuffer } from '../controllers/receipt.controller';

export const replyWorker = new Worker(
  'outbound-replies',
  async (job) => {
    console.log('📌 Reply job:', job.name, job.data?.phoneNumber);

    if (job.name === 'send-text') {
      const { phoneNumber, message } = job.data;
      await sendWhatsAppText(phoneNumber, message);
      return;
    }

    if (job.name === 'send-sale-response') {
      const { phoneNumber, message, bodyText, buttons } = job.data;
      await sendWhatsAppText(phoneNumber, message); // ✅ first
      await sendWhatsAppButtons(phoneNumber, bodyText, buttons); // ✅ then
      return;
    }

    if (job.name === 'send-welcome-response') {
      const { phoneNumber, message, loginUrl } = job.data;
      await sendWhatsAppText(phoneNumber, message); // ✅ first
      await sendWhatsAppText(phoneNumber, `🌐 *Web Access*\n\nLogin here to manage your shop on the web:\n${loginUrl}`); // ✅ then
      return;
    }

    // ✅ NEW: Send receipt PDF to WhatsApp
    if (job.name === 'send-sale-receipt') {
  const { phoneNumber, userId, saleId } = job.data as {
    phoneNumber: string;
    userId: string;
    saleId: string;
  };

  const { buffer, filename, mimeType } = await generateSaleReceiptPdfBuffer(userId, saleId);

  await sendWhatsAppDocumentBuffer({
    to: phoneNumber,
    buffer,
    filename,
    mimeType, // optional (defaults to application/pdf if you coded it like we did)
    caption: '🧾 Receipt PDF (open it → Print).',
  });

  return;
}


    if (job.name === 'send-buttons') {
      const { phoneNumber, bodyText, buttons } = job.data;
      await sendWhatsAppButtons(phoneNumber, bodyText, buttons);
      return;
    }

    console.log(`⚠️ Unknown reply job name: ${job.name}`);
  },
  {
    connection,
    limiter: { max: 15, duration: 1000 },
    concurrency: 10,
    lockDuration: 60_000,
  }
);

replyWorker.on('completed', (job) =>
  console.log(`✅ Reply sent: ${job.name} -> ${job.data.phoneNumber}`)
);

replyWorker.on('failed', (job, err) =>
  console.error(`❌ Reply failed [${job?.name}] [Attempt ${job?.attemptsMade ?? 'N/A'}]: ${err.message}`)
);

// ============================================================
// WORKER: OUTBOUND BULK (SLOW / summaries / alerts)
// Handles:
//  - job.name === 'send-text'
// ============================================================
export const bulkWorker = new Worker(
  'outbound-bulk',
  async (job) => {
    const name = job.name;

    if (name !== 'send-text') {
      console.log(`⚠️ Unknown bulk job: ${name}`);
      return;
    }

    const { phoneNumber, message } = job.data as { phoneNumber: string; message: string };
    console.log(`📤 Bulk(TEXT) -> ${phoneNumber}`);
    await sendWhatsAppText(phoneNumber, message);
  },
  {
    connection,
    limiter: { max: 5, duration: 1000 },
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
