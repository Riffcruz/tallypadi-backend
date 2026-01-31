// src/services/queue.worker.ts
import { Worker } from 'bullmq';
import { connection } from './queue.service';
import { sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppDocumentBuffer } from './whatsapp.service';
import { generateSaleReceiptPdfBuffer } from '../controllers/receipt.controller';
import { Invoice } from '../models/invoice.model';
import { generateInvoicePdf } from './invoice.pdf.service';
import fs from 'fs';
import path from 'path';
import { User } from '../models/user.model';
import { SupportMessage } from '../models/supportMessage.model';

export const replyWorker = new Worker(
  'outbound-replies',
  async (job) => {
    console.log('📌 Reply job:', job.name, job.data?.phoneNumber);

    if (job.name === 'send-text') {
      const { phoneNumber, message, dbMessageId } = job.data;
      const waId = await sendWhatsAppText(phoneNumber, message);
      
      if (dbMessageId && waId) {
        try {
          await SupportMessage.findByIdAndUpdate(dbMessageId, { waMessageId: waId });
        } catch (e) {
          console.error('Failed to update SupportMessage with waId', e);
        }
      }
      return;
    }

    if (job.name === 'send-list') {
      const { phoneNumber, bodyText, buttonText, sections } = job.data;
      await sendWhatsAppList(phoneNumber, bodyText, buttonText, sections);
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

      // ✅ NEW: Post-registration buttons
      await sendWhatsAppButtons(phoneNumber, 'What would you like to do next?', [
        { id: 'CMD_CREATE_INVOICE', title: 'Invoice Generation' },
        { id: 'CMD_HELP', title: 'Help' },
        { id: 'CMD_SUPPORT', title: 'Contact Support' },
      ]);
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

    // ✅ NEW: Send Invoice PDF
    if (job.name === 'send-invoice-pdf') {
        const { phoneNumber, invoiceId } = job.data as { phoneNumber: string, invoiceId: string };
        
        try {
            const inv = await Invoice.findById(invoiceId);
            if (!inv) return;

            // Need user/business name
            const user = await User.findById(inv.user);
            let businessName = 'My Shop';
            
            if (user) {
                if (user.role === 'STAFF' && user.ownerId) {
                    const owner = await User.findById(user.ownerId);
                    businessName = owner?.businessName || 'My Shop';
                } else {
                    businessName = user.businessName || 'My Shop';
                }
            }

            // Generate File
            const pdfFileName = await generateInvoicePdf(inv, businessName);
            const filePath = path.join(process.cwd(), 'public', 'reports', pdfFileName);

            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                
                await sendWhatsAppDocumentBuffer({
                    to: phoneNumber,
                    buffer,
                    filename: pdfFileName,
                    caption: `📄 Invoice #${inv.invoiceNumber}`,
                });

                // Cleanup: Delete file after sending (to avoid storage maxing out)
                fs.unlinkSync(filePath);
            }
        } catch (e) {
            console.error('Failed to send invoice PDF:', e);
        }
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

replyWorker.on('failed', (job, err) => {
  console.error(`❌ Reply failed [${job?.name}] [Attempt ${job?.attemptsMade ?? 'N/A'}]: ${err.message}`);
  if (err.message.includes('400') || err.message.includes('131047')) { // Meta error code for 24h window
     console.warn(`⚠️ TIP: If this was a notification to an agent, ensure they have messaged the bot in the last 24h (Session Window).`);
  }
});

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
