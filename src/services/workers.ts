// src/services/queue.worker.ts
import { Worker } from 'bullmq'; // ✅ Switched to BullMQ
import axios from 'axios';
import { createRedisConnection, messageQueue } from './queue.service'; // ✅ Factory for dedicated connections
import { sendWhatsAppText, sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppDocumentBuffer, sendWhatsAppFlow, sendTypingIndicator, sendWhatsAppCtaUrl, sendWhatsAppMediaById, sendWhatsAppTemplate } from './whatsapp.service';
import { generateSaleReceiptPdfBuffer } from '../controllers/receipt.controller';
import { Invoice } from '../models/invoice.model';
import { generateInvoicePdf } from './invoice.pdf.service';
import { User } from '../models/user.model';
import { SupportMessage } from '../models/supportMessage.model';
import { WhatsAppInboundEvent } from '../models/whatsappInboundEvent.model';
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
import {
  sendBroadcastEmail,
  sendLiveSupportAdminNotification,
  sendPasswordResetOTP,
  sendSupportTicketAdminNotification,
} from './email.service';
import { createUnsubscribeToken } from './emailSecurity.service';
import { buildTallyPadiUpdateTemplateComponents } from './whatsappBroadcastTemplate.service';
import { ContactTicket } from '../models/contactTicket.model';

const escapeEmailHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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
            let logoWidth = user?.settings?.logoWidth || 250;
            let logoHeight = user?.settings?.logoHeight || 60;
            let logoBgColor = user?.settings?.logoBgColor || '#ffffff';
            let logoBgEnabled = user?.settings?.logoBgEnabled ?? false;
            
            if (user && user.role === 'STAFF' && user.ownerId) {
                const owner = await User.findById(user.ownerId).lean();
                logoUrl = (owner as any)?.settings?.logoUrl;
                logoWidth = (owner as any)?.settings?.logoWidth || 250;
                logoHeight = (owner as any)?.settings?.logoHeight || 60;
                logoBgColor = (owner as any)?.settings?.logoBgColor || '#ffffff';
                logoBgEnabled = (owner as any)?.settings?.logoBgEnabled ?? false;
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
            const pdfBuffer = await generateInvoicePdf(inv, businessName, countryCode, logoBuffer, 'A4', 'Staff', logoWidth, logoHeight, logoBgColor, logoBgEnabled);
            
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
            let logoWidth = user?.settings?.logoWidth || 250;
            let logoHeight = user?.settings?.logoHeight || 60;
            let logoBgColor = user?.settings?.logoBgColor || '#ffffff';
            let logoBgEnabled = user?.settings?.logoBgEnabled ?? false;
            
            if (user && user.role === 'STAFF' && user.ownerId) {
                const owner = await User.findById(user.ownerId).lean();
                logoUrl = (owner as any)?.settings?.logoUrl;
                logoWidth = (owner as any)?.settings?.logoWidth || 250;
                logoHeight = (owner as any)?.settings?.logoHeight || 60;
                logoBgColor = (owner as any)?.settings?.logoBgColor || '#ffffff';
                logoBgEnabled = (owner as any)?.settings?.logoBgEnabled ?? false;
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
            const pdfBuffer = await generateInvoicePdf(inv, businessName, countryCode, logoBuffer, 'A4', 'Staff', logoWidth, logoHeight, logoBgColor, logoBgEnabled);

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
    const inboundEventId = job.data.inboundEventId;
    try {
      if (inboundEventId) {
        const claimed = await WhatsAppInboundEvent.findOneAndUpdate(
          { _id: inboundEventId, status: { $ne: 'PROCESSED' } },
          { $set: { status: 'PROCESSING', lastError: null } },
          { new: true },
        );
        if (!claimed) return;
      }

      if (job.data.rawBody) {
        await processRawWebhook(job.data.rawBody);
      } else {
        const { from, text, messageId, mediaId, isVoiceMessage, profileName } = job.data;
        console.log(`⚡ Worker processing ${from} (${messageId})...`);
        await handleMessageLogic(from, text, messageId, mediaId, isVoiceMessage, profileName);
      }

      if (inboundEventId) {
        await WhatsAppInboundEvent.updateOne(
          { _id: inboundEventId },
          { $set: { status: 'PROCESSED', processedAt: new Date(), lastError: null } },
        );
      }
    } catch (error: any) {
      if (inboundEventId) {
        await WhatsAppInboundEvent.updateOne(
          { _id: inboundEventId },
          { $set: { status: 'FAILED', lastError: String(error?.message || error).slice(0, 1000) } },
        ).catch(() => {});
      }
      throw error;
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

// Redis can be temporarily unavailable after the webhook has already been
// acknowledged. Requeue durable inbox records without involving Meta or users.
const inboundRecoveryTimer = setInterval(async () => {
  try {
    const pending = await WhatsAppInboundEvent.find({ status: 'RECEIVED' })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    for (const event of pending) {
      try {
        await messageQueue.add(
          'process-message',
          { rawBody: event.rawBody, inboundEventId: String(event._id) },
          { jobId: event.messageId, removeOnComplete: true },
        );
        await WhatsAppInboundEvent.updateOne(
          { _id: event._id, status: 'RECEIVED' },
          { $set: { status: 'QUEUED', lastError: null } },
        );
      } catch (error: any) {
        console.warn(`⚠️ WhatsApp inbox recovery delayed for ${event.messageId}:`, error?.message || error);
        break;
      }
    }
  } catch (error: any) {
    console.error('❌ WhatsApp inbox recovery failed:', error?.message || error);
  }
}, 15000);
inboundRecoveryTimer.unref();

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
// WORKER: TRANSACTIONAL EMAIL
// Keeps SMTP latency and retries away from user-facing requests.
// ============================================================
export const transactionalEmailWorker = new Worker(
  'transactional-email',
  async (job: import('bullmq').Job) => {
    if (job.name === 'send-password-reset-email') {
      await sendPasswordResetOTP(job.data);
      return;
    }

    if (job.name === 'send-live-support-email') {
      await sendLiveSupportAdminNotification(job.data);
      return;
    }

    if (job.name === 'send-contact-ticket-email') {
      const { contactTicketId, ...notification } = job.data;
      try {
        await sendSupportTicketAdminNotification(notification);
        await ContactTicket.updateOne(
          { _id: contactTicketId },
          { $set: { emailNotificationStatus: 'SENT' }, $unset: { emailNotificationError: 1 } }
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Email notification failed';
        await ContactTicket.updateOne(
          { _id: contactTicketId },
          { $set: { emailNotificationStatus: 'FAILED', emailNotificationError: reason.slice(0, 500) } }
        );
        throw error;
      }
      return;
    }

    throw new Error(`Unknown transactional email job: ${job.name}`);
  },
  {
    connection: createRedisConnection('worker-transactional-email') as any,
    concurrency: 5,
  }
);

transactionalEmailWorker.on('failed', (job: import('bullmq').Job | undefined, err: Error) =>
  console.error(`❌ Transactional email failed [${job?.name || 'unknown'}]: ${err.message}`)
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
      const {
        sendEmail,
        sendWhatsapp,
        whatsappDeliveryMode,
        whatsappTemplateName,
        whatsappLanguageCode,
        whatsappUpdateTitle,
        whatsappUpdateMessage,
        whatsappButtonUrlParameter,
        mediaId,
        mediaType,
        message,
        emailSubject,
        emailDelayMs,
        templateHtml,
        globalEmailTemplate,
        apiBaseUrl,
        includeUnsubscribed,
      } = jobPayload;

      // Unsubscribe check
      if (sendEmail && u.email) {
        // Double check from DB directly in case they unsubscribed recently
        const freshUser = await User.findById(u._id).lean();
        if (freshUser?.emailDeliveryStatus === 'HARD_BOUNCED' || (freshUser?.emailSubscribed === false && !includeUnsubscribed)) {
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
                 .replace(/##usershopname##/g, escapeEmailHtml(u.businessName || 'Your Shop'))
                 .replace(/##phonenumber##/g, escapeEmailHtml(u.phoneNumber || ''))
                 .replace(/##name##/g, escapeEmailHtml(u.name || 'Partner'));
          } else if (emailSubject && message) {
             personalizedSubject = emailSubject
                 .replace(/##usershopname##/g, u.businessName || 'Your Shop')
                 .replace(/##phonenumber##/g, u.phoneNumber || '')
                 .replace(/##name##/g, u.name || 'Partner');

             let pMsg = message
                 .replace(/##usershopname##/g, u.businessName || 'Your Shop')
                 .replace(/##phonenumber##/g, u.phoneNumber || '')
                 .replace(/##name##/g, u.name || 'Partner');
             
             personalizedHtml = `<div style="font-family: sans-serif; white-space: pre-wrap;">${escapeEmailHtml(pMsg)}</div>`;
          }

          if (personalizedSubject && personalizedHtml) {
             // Inject Unsubscribe Link
             const unsubscribeToken = createUnsubscribeToken(u.email);
             const unsubLink = `${apiBaseUrl || 'https://tallypadi.com/api'}/public/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
             personalizedHtml = personalizedHtml.replace(/{{unsubscribe_link}}/g, unsubLink);

             // Wrap with Global Email Template
             if (/\{\{\s*message\s*\}\}/i.test(globalEmailTemplate || '')) {
                 personalizedHtml = String(globalEmailTemplate).replace(/\{\{\s*message\s*\}\}/i, personalizedHtml);
             }

             personalizedHtml = personalizedHtml.replace(/{{unsubscribe_link}}/g, unsubLink);
             personalizedHtml += `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font:12px sans-serif;color:#6b7280;">Do not want broadcast emails? <a href="${unsubLink}" style="color:#047857;">Unsubscribe</a></div>`;

             try {
               await sendBroadcastEmail(u.email, personalizedSubject, personalizedHtml, unsubLink);
             } catch (error: any) {
               const responseCode = Number(error?.responseCode || 0);
               if (responseCode >= 500 && responseCode < 600) {
                 await User.findByIdAndUpdate(u._id, {
                   emailDeliveryStatus: 'HARD_BOUNCED',
                   emailLastFailureAt: new Date(),
                   emailLastFailureReason: String(error?.response || error?.message || 'Permanent SMTP rejection').slice(0, 500),
                 });
               } else {
                 throw error;
               }
             }
             
             // Throttle internally per email strictly
             if (emailDelayMs > 0) {
                 await new Promise(r => setTimeout(r, emailDelayMs));
             }
          }
        }
      }

      // WhatsApp Broadcast
      if (sendWhatsapp && u.phoneNumber) {
        if (whatsappDeliveryMode === 'approved_template') {
          await sendWhatsAppTemplate({
            to: u.phoneNumber,
            name: whatsappTemplateName,
            languageCode: whatsappLanguageCode || 'en_US',
            components: buildTallyPadiUpdateTemplateComponents({
              customerName: u.businessName || u.name || 'there',
              updateTitle: whatsappUpdateTitle,
              updateMessage: whatsappUpdateMessage,
              buttonUrlParameter: whatsappButtonUrlParameter,
            }),
          });
        } else if (message && mediaId && mediaType) {
          await sendWhatsAppMediaById({
            to: u.phoneNumber,
            mediaId,
            type: mediaType as any,
            caption: message
          });
        } else if (message) {
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
