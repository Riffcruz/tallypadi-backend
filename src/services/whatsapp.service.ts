import axios, { AxiosError } from 'axios';
import { env } from '../config/env';

const BASE_URL = 'https://graph.facebook.com/v21.0';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isRetryable = (err: AxiosError) => {
  const status = err.response?.status;

  // network / timeout
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') return true;
  if (!status) return true;

  // WhatsApp/Meta throttling + transient server issues
  if (status === 429) return true;
  if (status >= 500) return true;

  return false;
};

const getRetryDelayMs = (attempt: number, err: AxiosError) => {
  // If Meta returns Retry-After, honor it
  const ra = err.response?.headers?.['retry-after'];
  if (ra) {
    const seconds = Number(ra);
    if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
  }

  // exponential backoff: 1s, 2s, 4s, 8s... capped
  const base = Math.min(30_000, 1000 * Math.pow(2, attempt - 1));
  // add small jitter
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
};

// 1) TEXT MESSAGE
export const sendWhatsAppText = async (to: string, body: string) => {
  const msg = (body || '').trim();
  if (!msg) {
    console.warn('⚠️ Attempted to send empty message. Skipping.');
    return { ok: true, skipped: true };
  }

  const url = `${BASE_URL}/${env.whatsappPhoneNumberId}/messages`;

  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`📤 WhatsApp send (attempt ${attempt}/${maxAttempts}) -> ${to}`);

      const res = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: msg },
        },
        {
          timeout: 20_000, // ✅ don’t hang forever
          headers: {
            Authorization: `Bearer ${env.whatsappToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { ok: true, status: res.status, data: res.data };
    } catch (e: any) {
      const err = e as AxiosError;

      const retryable = isRetryable(err);
      const status = err.response?.status;
      const metaErr = err.response?.data;

      console.error('❌ WhatsApp send error:', { to, status, retryable, metaErr, msg: err.message });

      if (!retryable || attempt === maxAttempts) {
        // ✅ IMPORTANT: throw so BullMQ marks job failed + retries / DLQ
        throw err;
      }

      const delay = getRetryDelayMs(attempt, err);
      await sleep(delay);
    }
  }

  // should never reach
  return { ok: false };
};

// 2) TEMPLATE MESSAGE
export const sendWhatsAppTemplate = async (
  to: string,
  templateName: string,
  components: any[] = [],
  languageCode = 'en_US'
) => {
  const url = `${BASE_URL}/${env.whatsappPhoneNumberId}/messages`;

  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`📨 Template send (attempt ${attempt}/${maxAttempts}) -> ${to} (${templateName})`);

      const res = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        },
        {
          timeout: 20_000,
          headers: {
            Authorization: `Bearer ${env.whatsappToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { ok: true, status: res.status, data: res.data };
    } catch (e: any) {
      const err = e as AxiosError;

      const retryable = isRetryable(err);
      const status = err.response?.status;
      const metaErr = err.response?.data;

      console.error('❌ WhatsApp template error:', { to, templateName, status, retryable, metaErr, msg: err.message });

      if (!retryable || attempt === maxAttempts) throw err;

      const delay = getRetryDelayMs(attempt, err);
      await sleep(delay);
    }
  }

  return { ok: false };
};
