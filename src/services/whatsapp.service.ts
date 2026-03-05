import axios from 'axios';
import FormData from 'form-data';
import https from 'https';
import { env } from '../config/env';

/**
 * WhatsApp Cloud API helpers
 * - Optimized with persistent HTTP connections (Keep-Alive)
 * - All sending should happen from workers (queued)
 * - These functions ONLY talk to Meta API
 */

// ✅ Shared HTTPS Agent to prevent TCP port exhaustion at high scale
// Tuned keepAliveMsecs to aggressively heartbeat idle sockets before Meta drops them
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000, 
  maxSockets: 100, // Handle up to 100 concurrent outgoing connections
  maxFreeSockets: 20,
});

const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

function messagesUrl() {
  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${env.whatsappPhoneNumberId}/messages`;
}

// ✅ Media upload endpoint
function mediaUrl() {
  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${env.whatsappPhoneNumberId}/media`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${env.whatsappToken}`,
    'Content-Type': 'application/json',
  };
}

function safeText(s: unknown, max = 4096) {
  return String(s ?? '')
    .replace(/\u0000/g, '')
    .slice(0, max);
}

function safeFileName(name: unknown, fallback = 'document.pdf') {
  const s = safeText(name, 200)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return s || fallback;
}

// ============================================================
// ✅ SEND: TEXT
// ============================================================
export async function sendWhatsAppText(to: string, message: string) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: safeText(message, 4096) },
  };

  const res = await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
    httpsAgent,
  });

  return res.data?.messages?.[0]?.id;
}

// ============================================================
// ✅ SEND: INTERACTIVE BUTTONS (max 3)
// ============================================================
export async function sendWhatsAppButtons(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  const safeButtons = (buttons || [])
    .slice(0, 3)
    .map((b) => ({
      id: safeText(b?.id, 256),
      title: safeText(b?.title, 20),
    }))
    .filter((b) => b.id && b.title);

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: safeText(bodyText, 1024) },
      action: {
        buttons: safeButtons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  };

  const res = await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
    httpsAgent,
  });
  
  return res.data?.messages?.[0]?.id;
}

// ============================================================
// ✅ SEND: LIST MESSAGE (max 10 rows)
// ============================================================
export async function sendWhatsAppList(
  to: string,
  bodyText: string,
  buttonText: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
) {
  const safeSections = sections.map((s) => ({
    title: safeText(s.title, 24),
    rows: s.rows.map((r) => ({
      id: safeText(r.id, 200),
      title: safeText(r.title, 24),
      description: r.description ? safeText(r.description, 72) : undefined,
    })),
  }));

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: safeText(bodyText, 1024) },
      action: {
        button: safeText(buttonText, 20),
        sections: safeSections,
      },
    },
  };

  const res = await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
    httpsAgent,
  });

  return res.data?.messages?.[0]?.id;
}

// ============================================================
// ✅ SEND: FLOW (NATIVE FORM)
// ============================================================
export async function sendWhatsAppFlow(
  to: string,
  headerText: string,
  bodyText: string,
  footerText: string,
  flowId: string,
  flowCta: string,
  screenId: string,
  flowToken: string = 'unused_token'
) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: safeText(headerText, 60) },
      body: { text: safeText(bodyText, 1024) },
      footer: { text: safeText(footerText, 60) },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: flowId,
          flow_cta: flowCta,
          flow_action: 'navigate',
          flow_action_payload: {
            screen: screenId,
          },
        },
      },
    },
  };

  const res = await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
    httpsAgent,
  });

  return res.data?.messages?.[0]?.id;
}

// ============================================================
// ✅ SEND: MEDIA (image/audio/document/video) by MEDIA ID
// ============================================================
export async function sendWhatsAppMediaById(opts: {
  to: string;
  mediaId: string;
  type: 'image' | 'audio' | 'document' | 'video';
  caption?: string;
  filename?: string;
}) {
  const { to, mediaId, type, caption, filename } = opts;

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type,
    [type]: { id: mediaId },
  };

  if (caption && (type === 'image' || type === 'document' || type === 'video')) {
    (payload[type] as Record<string, unknown>).caption = safeText(caption, 1024);
  }

  if (filename && type === 'document') {
    (payload.document as Record<string, unknown>).filename = safeText(filename, 200);
  }

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
    httpsAgent,
  });
}

// ============================================================
// ✅ OPTIONAL: MARK AS READ
// ============================================================
export async function markWhatsAppMessageRead(messageId: string) {
  if (!messageId) return;

  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
    httpsAgent,
  });
}

// ============================================================
// ✅ SEND: TYPING INDICATOR
// ============================================================
export async function sendTypingIndicator(messageId: string) {
  if (!messageId) return;

  // Payload structure based on "mark as read + typing" pattern or similar
  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: {
      type: 'text' // This signals "typing..."
    }
  };

  try {
      await axios.post(messagesUrl(), payload, {
        headers: authHeaders(),
        timeout: 20_000,
        httpsAgent,
      });
  } catch (e) {
      // Ignore typing errors (non-critical)
      // console.error('Typing indicator failed', e);
  }
}

// ============================================================
// ✅ OPTIONAL: HEALTH CHECK
// ============================================================
export async function whatsappHealthCheck() {
  return {
    apiVersion: WHATSAPP_API_VERSION,
    phoneNumberId: env.whatsappPhoneNumberId,
    tokenPresent: Boolean(env.whatsappToken),
  };
}

// ============================================================
// ✅ SEND: TEMPLATE
// ============================================================
export async function sendWhatsAppTemplate(opts: {
  to: string;
  name: string;
  languageCode?: string;
  components?: Record<string, unknown>[];
}) {
  const { to, name, languageCode = 'en_US', components = [] } = opts;

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name,
      language: { code: languageCode },
    },
  };

  if (components?.length) (payload.template as Record<string, unknown>).components = components;

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
    httpsAgent,
  });
}

// ============================================================
// ✅ UPLOAD: MEDIA FROM BUFFER -> returns mediaId
// Use this for PDF receipts, images, etc.
// ============================================================
export async function uploadWhatsAppMediaBuffer(opts: {
  buffer: Buffer;
  mimeType: string; // e.g. application/pdf
  filename: string;
}) {
  const safeName = safeFileName(opts.filename, 'document.pdf');

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', opts.buffer, { filename: safeName, contentType: opts.mimeType });

  const res = await axios.post(mediaUrl(), form, {
    headers: {
      Authorization: `Bearer ${env.whatsappToken}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60_000,
    httpsAgent,
  });

  const mediaId = res?.data?.id;
  if (!mediaId) throw new Error('WhatsApp media upload failed (no media id).');
  return String(mediaId);
}

// ============================================================
// ✅ SEND: PDF DOCUMENT FROM BUFFER (receipt)
// This is the ONE function your worker should call.
// ============================================================
export async function sendWhatsAppDocumentBuffer(opts: {
  to: string;
  buffer: Buffer;
  filename: string;
  caption?: string;
  mimeType?: string; // default application/pdf
}) {
  const mimeType = opts.mimeType || 'application/pdf';
  const safeName = safeFileName(opts.filename, 'document.pdf');

  const mediaId = await uploadWhatsAppMediaBuffer({
    buffer: opts.buffer,
    mimeType,
    filename: safeName,
  });

  await sendWhatsAppMediaById({
    to: opts.to,
    mediaId,
    type: 'document',
    filename: safeName,
    caption: opts.caption,
  });

  return { mediaId };
}

// ============================================================
// ✅ SEND: CTA URL BUTTON (single button that opens a URL)
// ============================================================
export async function sendWhatsAppCtaUrl(
  to: string,
  bodyText: string,
  buttons: { displayText: string; url: string }[]
) {
  // WhatsApp only allows 1 CTA URL button per message. Send extra buttons as separate messages.
  const [first, ...rest] = buttons;

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: safeText(bodyText, 1024) },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: safeText(first.displayText, 20),
          url: first.url,
        },
      },
    },
  };

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
    httpsAgent,
  });

  // Send remaining buttons as separate CTA messages
  for (const btn of rest) {
    const extra = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: ' ' },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: safeText(btn.displayText, 20),
            url: btn.url,
          },
        },
      },
    };
    await axios.post(messagesUrl(), extra, {
      headers: authHeaders(),
      timeout: 20_000,
      httpsAgent,
    });
  }
}

