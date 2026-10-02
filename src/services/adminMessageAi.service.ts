import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { extractJsonObject, sanitizeInput } from './gemini.parsers';

export type AdminMessageDraftInput = {
  brief: string;
  channels: Array<'email' | 'whatsapp'>;
  recipientName?: string;
  businessName?: string;
  planType?: string;
  subscriptionStatus?: string;
};

export type AdminMessageDraft = {
  subject: string;
  message: string;
  source: 'AI' | 'FALLBACK';
};

const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('AI generation timed out')), timeoutMs);
  promise
    .then((value) => { clearTimeout(timer); resolve(value); })
    .catch((error) => { clearTimeout(timer); reject(error); });
});

const clean = (value: unknown, maxLength: number) => sanitizeInput(String(value || '')).trim().slice(0, maxLength);

const fallbackDraft = (input: AdminMessageDraftInput): AdminMessageDraft => {
  const recipient = clean(input.recipientName || input.businessName || 'there', 80);
  const brief = clean(input.brief, 4000);
  return {
    subject: 'A message from TallyPadi',
    message: `Hello ${recipient},\n\n${brief}\n\nTallyPadi Team`,
    source: 'FALLBACK',
  };
};

export const generateAdminPersonalMessage = async (input: AdminMessageDraftInput): Promise<AdminMessageDraft> => {
  const fallback = fallbackDraft(input);
  if (!env.geminiApiKey) return fallback;

  const prompt = `
You write one-to-one customer messages for TallyPadi, a WhatsApp and web business-management platform.

Turn the admin's brief into a warm, direct, human message that is ready to edit before sending.
- Use only facts in the brief and recipient context. Never invent offers, dates, account problems, or promises.
- Keep the message concise and natural for a Nigerian small-business owner.
- Avoid generic AI phrases, hype, excessive emojis, Markdown headings, and HTML.
- Include a simple greeting and a clear next step only when the brief calls for one.
- If WhatsApp is selected, keep it easy to scan on a phone.
- The email subject must be specific and under 100 characters.

Return JSON only:
{
  "subject": "",
  "message": ""
}

Recipient name: ${clean(input.recipientName, 80) || 'Not supplied'}
Shop name: ${clean(input.businessName, 120) || 'Not supplied'}
Plan: ${clean(input.planType, 40) || 'Not supplied'}
Subscription status: ${clean(input.subscriptionStatus, 40) || 'Not supplied'}
Delivery channels: ${input.channels.join(', ')}

Admin brief:
${clean(input.brief, 4000)}
`;

  try {
    const result = await withTimeout(ai.interactions.create({
      model: env.geminiModel as any,
      input: prompt,
      store: false,
      stream: false,
    }), 25_000);
    const responseText = (result as any).output_text || '';
    const parsed = JSON.parse(extractJsonObject(responseText));
    const subject = clean(parsed?.subject, 100);
    const message = clean(parsed?.message, 5000);
    if (!message) return fallback;
    return { subject: subject || fallback.subject, message, source: 'AI' };
  } catch (error) {
    console.error('Admin personal message AI generation failed:', error);
    return fallback;
  }
};
