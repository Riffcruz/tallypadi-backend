// src/services/whatsapp.service.ts
import axios from 'axios';
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
// Job name in queue: 'send-buttons'
// ============================================================
export async function sendWhatsAppButtons(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  const safeButtons = (buttons || [])
    .slice(0, 3)
    .map((b) => ({
      id: safeText(b?.id, 256), // safe
      title: safeText(b?.title, 20), // WhatsApp UI is strict
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
// ✅ SEND: MEDIA (image/audio/doc) by MEDIA ID (already uploaded to WhatsApp)
// Useful if later you queue media responses.
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
    [type]: {
      id: mediaId,
    },
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
// ✅ OPTIONAL: MARK AS READ (useful if you want worker to mark messages read)
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
  // A lightweight call to validate token & phone ID.
  // Meta doesn't have a perfect "ping", so we just return config sanity.
  return {
    apiVersion: WHATSAPP_API_VERSION,
    phoneNumberId: env.whatsappPhoneNumberId,
    tokenPresent: Boolean(env.whatsappToken),
  };
}


export async function sendWhatsAppTemplate(opts: {
  to: string;
  name: string; // template name in Meta dashboard
  languageCode?: string; // e.g. "en_US"
  components?: any[]; // template components (body params, buttons, etc.)
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

  if (components?.length) {
    payload.template.components = components;
  }

  await axios.post(messagesUrl(), payload, {
    headers: authHeaders(),
    timeout: 20_000,
  });
}
