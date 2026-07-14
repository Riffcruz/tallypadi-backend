// src/services/queue.worker.ts
import { Worker } from 'bullmq'; // ✅ Switched to BullMQ
import axios from 'axios';
import { createRedisConnection } from './queue.service'; // ✅ Factory for dedicated connections
import { sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppDocumentBuffer, sendWhatsAppFlow, sendTypingIndicator, sendWhatsAppCtaUrl, sendWhatsAppMediaById } from './whatsapp.service';
import { generateSaleReceiptPdfBuffer } from '../controllers/receipt.controller';
import { Invoice } from '../models/invoice.model';
import { generateInvoicePdf } from './invoice.pdf.service';
import { User } from '../models/user.model';
import { SupportMessage } from '../models/supportMessage.model';
import { processRawWebhook, handleMessageLogic } from '../controllers/whatsapp.controller';
import { executePushNotification, executeGlobalPushNotification } from './push.service';
import {
  applyProviderCampaignControl,
  submitProviderCampaignToProvider,
  syncProviderCampaignMetricsFromProvider,
} from './Campaign/providerAutomation.service';
import {
  reconcileMarketplaceListings,
  refreshMarketplaceFacets,
  refreshMarketplaceListing,
  refreshMarketplaceOwnerListings,
} from './marketplaceIndex.service';
import { sendBroadcastEmail } from './email.service';

export const replyWorker = new Worker(
  'outbound-replies', // ✅ Fixed: Matches queue.service.ts
  async (job: import('bullmq').Job) => {
    // console.log('📌 Reply job:', job.name, job.data?.phoneNumber);

    if (job.name === 'send-text') {
      const { phoneNumber, message, dbMessageId } = job.data || {};
      sendTypingIndicator(phoneNumber).catch(() => {});
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
      sendTypingIndicator(phoneNumber).catch(() => {});
      await sendWhatsAppList(phoneNumber, bodyText, buttonText, sections);
      return;
    }

    if (job.name === 'send-sale-response') {
      const { phoneNumber, message, bodyText, buttons } = job.data;
      sendTypingIndicator(phoneNumber).catch(() => {});
      await sendWhatsAppText(phoneNumber, message); // ✅ first
      await sendWhatsAppButtons(phoneNumber, bodyText, buttons); // ✅ then
      return;
    }

    if (job.name === 'send-welcome-response') {
      const { phoneNumber, message, loginUrl } = job.data;
      sendTypingIndicator(phoneNumber).catch(() => {});
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

    if (job.name === 'send-registration-complete') {
        const { phoneNumber, welcomeMsg, trialMsg, menuBatches } = job.data;
        
        sendTypingIndicator(phoneNumber).catch(() => {});
        // 1. Send Welcome Text
        await sendWhatsAppText(phoneNumber, welcomeMsg);
        
        // 2. Send Trial Text
        await sendWhatsAppText(phoneNumber, trialMsg);

        // 3. Send Button Batches Sequentially
        if (Array.isArray(menuBatches)) {
            for (const batch of menuBatches) {
                await sendWhatsAppButtons(phoneNumber, batch.bodyText, batch.buttons);
            }
        }
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

      sendTypingIndicator(phoneNumber).catch(() => {});
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
            let countryCode = 'NG';
            
            if (user) {
                if (user.role === 'STAFF' && user.ownerId) {
                    const owner = await User.findById(user.ownerId);
                    businessName = owner?.businessName || 'My Shop';
                    countryCode = owner?.countryCode || 'NG';
                } else {
                    businessName = user.businessName || 'My Shop';
                    countryCode = user.countryCode || 'NG';
                }
            }

            // Fetch brand logo
            let logoBuffer: Buffer | undefined;
            let logoUrl = user?.settings?.logoUrl;
            if (user && user.role === 'STAFF' && user.ownerId) {
                const owner = await User.findById(user.ownerId).lean();
                logoUrl = (owner as any)?.settings?.logoUrl;
            }

            if (logoUrl) {
                try {
                    const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
                    logoBuffer = Buffer.from(response.data);
                } catch (err) {
                    console.warn('[Worker Invoice PDF] Failed to fetch brand logo:', err);
                }
            }

            // Generate File (Buffer)
            const pdfBuffer = await generateInvoicePdf(inv, businessName, countryCode, logoBuffer);
            
            sendTypingIndicator(phoneNumber).catch(() => {});
            await sendWhatsAppDocumentBuffer({
                to: phoneNumber,
                buffer: pdfBuffer,
                filename: `invoice-${inv.invoiceNumber}.pdf`,
                caption: `📄 Invoice #${inv.invoiceNumber}`,
            });

        } catch (e) {
            console.error('Failed to send invoice PDF:', e);
        }
        return;
    }

    // ✅ NEW: Send Invoice PDF + Follow-up Buttons (combined — guaranteed ordering)
    if (job.name === 'send-invoice-pdf-with-buttons') {
        const { phoneNumber, invoiceId, buttonBodyText, buttons } = job.data as {
            phoneNumber: string;
            invoiceId: string;
            buttonBodyText: string;
            buttons: { id: string; title: string }[];
        };

        try {
            const inv = await Invoice.findById(invoiceId);
            if (!inv) return;

            // Need user/business name
            const user = await User.findById(inv.user);
            let businessName = 'My Shop';
            let countryCode = 'NG';

            if (user) {
                if (user.role === 'STAFF' && user.ownerId) {
                    const owner = await User.findById(user.ownerId);
                    businessName = owner?.businessName || 'My Shop';
                    countryCode = owner?.countryCode || 'NG';
                } else {
                    businessName = user.businessName || 'My Shop';
                    countryCode = user.countryCode || 'NG';
                }
            }

            // Fetch brand logo
            let logoBuffer: Buffer | undefined;
            let logoUrl = user?.settings?.logoUrl;
            if (user && user.role === 'STAFF' && user.ownerId) {
                const owner = await User.findById(user.ownerId).lean();
                logoUrl = (owner as any)?.settings?.logoUrl;
            }

            if (logoUrl) {
                try {
                    const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
                    logoBuffer = Buffer.from(response.data);
                } catch (err) {
                    console.warn('[Worker Invoice PDF] Failed to fetch brand logo:', err);
                }
            }

            // Generate + Send PDF first
            const pdfBuffer = await generateInvoicePdf(inv, businessName, countryCode, logoBuffer);

            sendTypingIndicator(phoneNumber).catch(() => {});
            await sendWhatsAppDocumentBuffer({
                to: phoneNumber,
                buffer: pdfBuffer,
                filename: `invoice-${inv.invoiceNumber}.pdf`,
                caption: `📄 Invoice #${inv.invoiceNumber}`,
            });

            // THEN send buttons (guaranteed to arrive after PDF)
            if (buttons?.length) {
                await sendWhatsAppButtons(phoneNumber, buttonBodyText, buttons);
            }

        } catch (e) {
            console.error('Failed to send invoice PDF with buttons:', e);
        }
        return;
    }


    if (job.name === 'send-reg-error') {
      const { phoneNumber, errorMsg, flowId } = job.data;
      sendTypingIndicator(phoneNumber).catch(() => {});
      await sendWhatsAppText(phoneNumber, errorMsg);
      await sendWhatsAppFlow(
        phoneNumber,
        "Sign Up",
        "Tap below to try again.",
        "TallyPadi",
        flowId,
        "Sign in",
        "SIGN_IN"
      );
      return;
    }

    if (job.name === 'send-greeting-menu') {
      const { phoneNumber, greetingMsg, menuBatches } = job.data;
      sendTypingIndicator(phoneNumber).catch(() => {});
      await sendWhatsAppText(phoneNumber, greetingMsg);
      for (const batch of menuBatches) {
        await sendWhatsAppButtons(phoneNumber, batch.bodyText, batch.buttons);
      }
      return;
    }

    if (job.name === 'send-subscribe-plans') {
      const { phoneNumber, planMsg } = job.data;
      sendTypingIndicator(phoneNumber).catch(() => {});
      await sendWhatsAppText(phoneNumber, planMsg);
      await sendWhatsAppCtaUrl(phoneNumber, '⭐ TYCOON Plan (Recommended)', [
          { displayText: '⭐ Subscribe Tycoon', url: 'https://tallypadi.com/payment?plan=TYCOON' }
      ]);
      await sendWhatsAppCtaUrl(phoneNumber, 'OGA BOSS Plan', [
          { displayText: 'Subscribe Oga Boss', url: 'https://tallypadi.com/payment?plan=OGA_BOSS' }
      ]);
      return;
    }

    if (job.name === 'send-cta-url') {
      const { phoneNumber, bodyText, buttons } = job.data;
      sendTypingIndicator(phoneNumber).catch(() => {});
      await sendWhatsAppCtaUrl(phoneNumber, bodyText, buttons);
      return;
    }

    if (job.name === 'send-buttons') {
      const { phoneNumber, bodyText, buttons } = job.data;
      sendTypingIndicator(phoneNumber).catch(() => {});
      await sendWhatsAppButtons(phoneNumber, bodyText, buttons);
      return;
    }

    if (job.name === 'send-flow') {
      const { phoneNumber, headerText, bodyText, footerText, flowId, flowCta, screenId } = job.data;
      sendTypingIndicator(phoneNumber).catch(() => {});
      await sendWhatsAppFlow(phoneNumber, headerText, bodyText, footerText, flowId, flowCta, screenId);
      return;
    }

    console.log(`⚠️ Unknown reply job name: ${job.name}`);
  },
  {
    connection: createRedisConnection('worker-reply') as any, // ✅ Dedicated Redis connection
    concurrency: 50,
    // lockDuration: 60_000,
  }
);

replyWorker.on('completed', (job: import('bullmq').Job) =>
  console.log(`✅ Reply sent: ${job.name} -> ${job.data?.phoneNumber}`)
);

replyWorker.on('failed', (job: import('bullmq').Job | undefined, err: Error) => {
  console.error(`❌ Reply failed [${job?.name}]: ${err.message}`);
});

// ============================================================
// WORKER: OUTBOUND BULK (SLOW / summaries / alerts)
// Handles:
//  - job.name === 'send-text'
// ============================================================
export const bulkWorker = new Worker(
  'outbound-bulk',
  async (job: import('bullmq').Job) => {
    const name = job.name;

    if (name !== 'send-text') {
      console.log(`⚠️ Unknown bulk job: ${name}`);
      return;
    }

    const { phoneNumber, message } = job.data as { phoneNumber: string; message: string };
    console.log(`📤 Bulk(TEXT) -> ${phoneNumber}`);
    sendTypingIndicator(phoneNumber).catch(() => {});
    await sendWhatsAppText(phoneNumber, message);
  },
  {
    connection: createRedisConnection('worker-bulk') as any, // ✅ Dedicated Redis connection
    // limiter: { max: 5, duration: 1000 },
    concurrency:50,
  }
);

bulkWorker.on('completed', (job: import('bullmq').Job) => console.log(`✅ Bulk sent: ${job.data?.phoneNumber}`));
bulkWorker.on('failed', (job: import('bullmq').Job | undefined, err: Error) =>
  console.error(`❌ Bulk failed: ${err.message}`)
);

// ============================================================
// WORKER: INCOMING MESSAGES (Inbound)
// ============================================================
export const messageWorker = new Worker(
  'incoming-messages',
  async (job: import('bullmq').Job) => {
    if (job.data.rawBody) {
      // ✅ New Path: Raw Webhook
      await processRawWebhook(job.data.rawBody);
    } else {
      // ⚠️ Legacy Path (Drain old jobs)
      const { from, text, messageId, mediaId, isVoiceMessage, profileName } = job.data;
      console.log(`⚡ Worker processing ${from} (${messageId})...`);
      await handleMessageLogic(from, text, messageId, mediaId, isVoiceMessage, profileName);
    }
  },
  {
    connection: createRedisConnection('worker-inbound') as any, // ✅ Dedicated Redis connection
    concurrency: 50, // High concurrency
  }
);

messageWorker.on('completed', (job: import('bullmq').Job) => console.log(`✔️ Done: ${job.data?.from}`));
messageWorker.on('failed', (job: import('bullmq').Job | undefined, err: Error) =>
  console.error(`❌ Message failed: ${err.message}`)
);

// ============================================================
// WORKER: NOTIFICATIONS (Push)
// ============================================================
export const notificationWorker = new Worker(
  'push-notifications',
  async (job: import('bullmq').Job) => {
    const { type, agentId, title, body, data } = job.data;

    if (type === 'SINGLE') {
      await executePushNotification(agentId, { title, body, data });
    } else if (type === 'GLOBAL') {
      await executeGlobalPushNotification({ title, body, data });
    }
  },
  {
    connection: createRedisConnection('worker-push') as any, // ✅ Dedicated Redis connection
    concurrency: 50, // Lower concurrency for push to avoid rate limits
  }
);

notificationWorker.on('completed', (job: import('bullmq').Job) => console.log(`🔔 Push sent: ${job.data?.type}`));
notificationWorker.on('failed', (job: import('bullmq').Job | undefined, err: Error) =>
  console.error(`❌ Push failed: ${err.message}`)
);

// ============================================================
// WORKER: ADS AUTOMATION
// Submits approved provider campaigns using TallyPadi system ad accounts.
// ============================================================
export const adAutomationWorker = new Worker(
  'ad-automation',
  async (job: import('bullmq').Job) => {
    if (job.name !== 'submit-provider-campaign') {
      if (job.name === 'sync-provider-metrics') {
        const providerCampaignId = String(job.data?.providerCampaignId || '');
        await syncProviderCampaignMetricsFromProvider(providerCampaignId);
        return;
      }
      if (job.name === 'control-provider-campaign') {
        const providerCampaignId = String(job.data?.providerCampaignId || '');
        const action = String(job.data?.action || 'PAUSE') as 'PAUSE' | 'STOP' | 'ENABLE';
        await applyProviderCampaignControl(providerCampaignId, action);
        return;
      }
      console.log(`⚠️ Unknown ads automation job: ${job.name}`);
      return;
    }

    const providerCampaignId = String(job.data?.providerCampaignId || '');
    await submitProviderCampaignToProvider(providerCampaignId);
  },
  {
    connection: createRedisConnection('worker-ad-automation') as any,
    concurrency: 3,
  }
);

adAutomationWorker.on('completed', (job: import('bullmq').Job) =>
  console.log(`📣 Ads automation completed: ${job.data?.providerCampaignId}`)
);
adAutomationWorker.on('failed', (job: import('bullmq').Job | undefined, err: Error) =>
  console.error(`❌ Ads automation failed [${job?.data?.providerCampaignId}]: ${err.message}`)
);

// ============================================================
// WORKER: MARKETPLACE INDEX
// Keeps the public marketplace read model and cached facets fresh.
// ============================================================
export const marketplaceIndexWorker = new Worker(
  'marketplace-index',
  async (job: import('bullmq').Job) => {
    if (job.name === 'refresh-product') {
      await refreshMarketplaceListing(String(job.data?.productId || ''));
      return;
    }

    if (job.name === 'refresh-owner') {
      await refreshMarketplaceOwnerListings(String(job.data?.ownerId || ''));
      return;
    }

    if (job.name === 'refresh-facets') {
      await refreshMarketplaceFacets();
      return;
    }

    if (job.name === 'reconcile-stale') {
      await reconcileMarketplaceListings();
      return;
    }

    console.log(`⚠️ Unknown marketplace index job: ${job.name}`);
  },
  {
    connection: createRedisConnection('worker-marketplace-index') as any,
    concurrency: 5,
  }
);

marketplaceIndexWorker.on('completed', (job: import('bullmq').Job) =>
  console.log(`🛒 Marketplace index completed: ${job.name}`)
);
marketplaceIndexWorker.on('failed', (job: import('bullmq').Job | undefined, err: Error) =>
  console.error(`❌ Marketplace index failed [${job?.name}]: ${err.message}`)
);

// ============================================================
// WORKER: BROADCAST
// Handles mass email and WhatsApp broadcasts
// ============================================================
export const broadcastWorker = new Worker(
  'broadcast-queue',
  async (job: import('bullmq').Job) => {
    if (job.name === 'send-broadcast') {
      const { recipient: u, jobPayload } = job.data;
      const { sendEmail, sendWhatsapp, mediaId, mediaType, message, emailSubject, emailDelayMs, templateHtml, globalEmailTemplate, apiBaseUrl } = jobPayload;

      // Unsubscribe check
      if (sendEmail && u.email) {
        // Double check from DB directly in case they unsubscribed recently
        const freshUser = await User.findById(u._id).lean();
        if (freshUser && freshUser.emailSubscribed === false) {
          // Skip email for this user
        } else {
          let personalizedSubject = '';
          let personalizedHtml = '';

          if (templateHtml) {
             personalizedSubject = emailSubject
                 .replace(/##usershopname##/g, u.businessName || 'Your Shop')
                 .replace(/##phonenumber##/g, u.phoneNumber || '')
                 .replace(/##name##/g, u.name || 'Partner');

             personalizedHtml = templateHtml
                 .replace(/##usershopname##/g, u.businessName || 'Your Shop')
                 .replace(/##phonenumber##/g, u.phoneNumber || '')
                 .replace(/##name##/g, u.name || 'Partner');
          } else if (emailSubject && message) {
             personalizedSubject = emailSubject
                 .replace(/##usershopname##/g, u.businessName || 'Your Shop')
                 .replace(/##phonenumber##/g, u.phoneNumber || '')
                 .replace(/##name##/g, u.name || 'Partner');

             let pMsg = message
                 .replace(/##usershopname##/g, u.businessName || 'Your Shop')
                 .replace(/##phonenumber##/g, u.phoneNumber || '')
                 .replace(/##name##/g, u.name || 'Partner');
             
             personalizedHtml = `<div style="font-family: sans-serif; white-space: pre-wrap;">${pMsg}</div>`;
          }

          if (personalizedSubject && personalizedHtml) {
             // Inject Unsubscribe Link
             const unsubLink = `${apiBaseUrl || 'https://tallypadi.com/api'}/public/unsubscribe?email=${encodeURIComponent(u.email)}`;
             personalizedHtml = personalizedHtml.replace(/{{unsubscribe_link}}/g, unsubLink);

             // Wrap with Global Email Template
             if (globalEmailTemplate && globalEmailTemplate.includes('{{message}}')) {
                 personalizedHtml = globalEmailTemplate.replace('{{message}}', personalizedHtml);
             }

             await sendBroadcastEmail(u.email, personalizedSubject, personalizedHtml);
             
             // Throttle internally per email strictly
             if (emailDelayMs > 0) {
                 await new Promise(r => setTimeout(r, emailDelayMs));
             }
          }
        }
      }

      // WhatsApp Broadcast
      if (sendWhatsapp && u.phoneNumber && message) {
        if (mediaId && mediaType) {
          await sendWhatsAppMediaById({
            to: u.phoneNumber,
            mediaId,
            type: mediaType as any,
            caption: message
          });
        } else {
          await sendWhatsAppText(u.phoneNumber, message);
        }
      }
      return;
    }

    console.log(`⚠️ Unknown broadcast job: ${job.name}`);
  },
  {
    connection: createRedisConnection('worker-broadcast') as any,
    concurrency: 1, // Single concurrency to strictly respect emailDelayMs throttling
  }
);

broadcastWorker.on('completed', (job: import('bullmq').Job) => {
  // console.log(`✅ Broadcast sent: ${job.data?.recipient?.email || job.data?.recipient?.phoneNumber}`);
});
broadcastWorker.on('failed', (job: import('bullmq').Job | undefined, err: Error) =>
  console.error(`❌ Broadcast failed [${job?.data?.recipient?.email}]: ${err.message}`)
);
