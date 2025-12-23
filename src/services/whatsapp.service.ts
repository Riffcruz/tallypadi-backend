// src/services/whatsapp.service.ts
import axios from 'axios';
import FormData from 'form-data';
import { env } from '../config/env';

/**
 * WhatsApp Cloud API helpers
 * - All sending should happen from workers (queued)
 * - These functions ONLY talk to Meta API
 */

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

function safeText(s: any, max = 4096) {
  return String(s ?? '')
    .replace(/\u0000/g, '')
    .slice(0, max);
}

function safeFileName(name: any, fallback = 'document.pdf') {
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

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
  });
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

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
  });
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

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type,
    [type]: { id: mediaId },
  };

  if (caption && (type === 'image' || type === 'document' || type === 'video')) {
    payload[type].caption = safeText(caption, 1024);
  }

  if (filename && type === 'document') {
    payload.document.filename = safeText(filename, 200);
  }

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
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
  });
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
  components?: any[];
}) {
  const { to, name, languageCode = 'en_US', components = [] } = opts;

  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name,
      language: { code: languageCode },
    },
  };

  if (components?.length) payload.template.components = components;

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
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
