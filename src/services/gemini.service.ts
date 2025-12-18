import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

const genAI = new GoogleGenerativeAI(env.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: env.geminiModel,
  generationConfig: { responseMimeType: 'application/json' as any },
});

export type ParsedIntent =
  | 'SALE'
  | 'RESTOCK'
  | 'SET_STOCK'
  | 'DELETED_STOCK'
  | 'DEFINE_PRICE'
  | 'PRICE_CHECK'
  | 'REPORT_SALES'
  | 'REPORT_STOCK'
  | 'REPORT_FULL'
  | 'SETTINGS'
  | 'CHANGE_LANGUAGE'
  | 'DEBT_PAYMENT'
  | 'CLOSE_BOOK'
  | 'ADD_STAFF'
  | 'DOWNLOAD_REPORT'
  | 'UNDO_LAST_SALE'
  | 'REPORT_DEBTS'
  | 'REPORT_RECENT'
  | 'HELP'
  | 'UNKNOWN';

export interface ParsedItem {
  name: string;
  qty: number;
  unit_price: number | null;
  unit?: string;
}

export interface ParsedResult {
  intent: ParsedIntent;
  is_credit: boolean;
  customer_name?: string;
  staffPhoneNumber?: string;
  items: ParsedItem[];
  total_money: number | null;
  report_params: { start_date: string | null; end_date: string | null };
  settings_update: { key: 'closingTime' | 'dailySummary' | 'language' | null; value: string | boolean | null };
  reply_text: string;
}

const SAFE_MAX = 900;

const sanitizeInput = (input: string): string => {
  if (!input) return '';
  let s = input.slice(0, SAFE_MAX);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/[^\p{L}\p{N}\s₦$€£₵.,\-\/+()%@'_]/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
};

/** ✅ Centralized Money Parser: Handles 20k, 1.5m, ₦20,000 */
const parseMoney = (raw: any): number | null => {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;

  const s = String(raw).toLowerCase().replace(/\s+/g, '').replace(/,/g, '');
  const mult = s.includes('m') ? 1_000_000 : s.includes('k') ? 1_000 : 1;
  const num = parseFloat(s.replace(/[^\d.]/g, ''));

  if (Number.isNaN(num)) return null;
  const v = num * mult;
  return Number.isFinite(v) && v >= 0 ? v : null;
};

/** ✅ Safe Name Normalization */
const normalizeItemName = (name: string): string => {
  if (!name) return 'unknown_item';
  let n = sanitizeInput(name).toLowerCase();
  n = n.replace(/\b(bags?|pcs?|pieces?|cartons?|packs?|sachets?|rolls?|bottles?|liters?|litres?|ltrs?|ltr|of|the|a|an)\b/g, ' ').trim();
  n = n.replace(/\s+/g, ' ');

  if (n.endsWith('ies') && n.length > 4) n = n.slice(0, -3) + 'y';
  else if (/(xes|ses|zes|ches|shes)$/.test(n) && n.length > 4) n = n.slice(0, -2);
  else if (n.endsWith('s') && n.length > 3 && !n.endsWith('ss')) {
    const noTouch = new Set(['gas', 'rice', 'beans', 'couscous']);
    if (!noTouch.has(n)) n = n.slice(0, -1);
  }
  return n || 'item';
};

const allowedIntents: ParsedIntent[] = [
  'SALE', 'RESTOCK', 'SET_STOCK', 'DELETED_STOCK', 'DEFINE_PRICE', 'PRICE_CHECK',
  'REPORT_SALES', 'REPORT_DEBTS', 'REPORT_STOCK', 'REPORT_FULL', 'CLOSE_BOOK',
  'SETTINGS', 'CHANGE_LANGUAGE', 'DEBT_PAYMENT', 'ADD_STAFF', 'DOWNLOAD_REPORT',
  'UNDO_LAST_SALE', 'REPORT_RECENT', 'HELP', 'UNKNOWN',
];

function safeParsedResult(p: any): ParsedResult {
  const intent: ParsedIntent = allowedIntents.includes(p?.intent) ? p.intent : 'UNKNOWN';
  const items = Array.isArray(p?.items) ? p.items : [];

  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: any) => ({
    name: normalizeItemName(it.name),
    qty: (intent === 'DEFINE_PRICE' || intent === 'PRICE_CHECK') ? 0 : (Number(it?.qty) || 0),
    unit_price: parseMoney(it?.unit_price),
    unit: typeof it?.unit === 'string' ? sanitizeInput(it.unit).toLowerCase() : '',
  }));

  const totalMoney = parseMoney(p?.total_money);

  return {
    intent,
    is_credit: Boolean(p?.is_credit),
    customer_name: p?.customer_name ? sanitizeInput(p.customer_name) : undefined,
    staffPhoneNumber: p?.staffPhoneNumber ? sanitizeInput(p.staffPhoneNumber) : undefined,
    items: normalizedItems,
    total_money: totalMoney,
    report_params: {
      start_date: typeof p?.report_params?.start_date === 'string' ? p.report_params.start_date : null,
      end_date: typeof p?.report_params?.end_date === 'string' ? p.report_params.end_date : null,
    },
    settings_update: {
      key: p?.settings_update?.key || null,
      value: p?.settings_update?.value ?? null,
    },
    reply_text: p?.reply_text || 'Done.',
  };
}

// ==========================================
// ⚡ REFINED FALLBACK PARSER
// ==========================================
function fallbackParse(message: string): ParsedResult | null {
  const mRaw = sanitizeInput(message);
  const m = mRaw.toLowerCase();

  // 1. HELP / DEBTS / UNDO / RECENT
  if (/\b(help|menu|commands|options)\b/.test(m)) return safeParsedResult({ intent: 'HELP' });
  if (/\b(undo|cancel|reverse)\b.*\blast\b/.test(m)) return safeParsedResult({ intent: 'UNDO_LAST_SALE' });
  if (/\b(debt|debts|debtor|owing|owes|gbese|credit|credits)\b/.test(m)) return safeParsedResult({ intent: 'REPORT_DEBTS' });
  if (/\b(last|recent)\s+\d+\s+sales\b/.test(m)) return safeParsedResult({ intent: 'REPORT_RECENT' });

  // 2. DEBT PAYMENT: "John paid 20k"
  const debtPay = mRaw.match(/\b([a-z0-9\s]{1,20})\s+(paid|pay)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?(?:k|m)?)\b/i);
  if (debtPay) {
    const customer = debtPay[1].trim();
    const amt = parseMoney(debtPay[3]);
    if (amt) return safeParsedResult({ intent: 'DEBT_PAYMENT', customer_name: customer, total_money: amt, reply_text: `✅ Noted. ${customer} paid ${amt}.` });
  }

  // 3. CREDIT SALE: "Sold 200 liters kerosene to john for 20k on credit"
  // This Regex is now much more specific to capture the full flow
  const creditSale = mRaw.match(/\b(sold|sell|comot)\s+(.+?)\s+to\s+([a-z0-9]+)\s+for\s+([₦$€£₵]?\s*[\d,]+k?)\s+on\s+credit/i);
  if (creditSale) {
    const itemInfo = creditSale[2];
    const customer = creditSale[3];
    const amt = parseMoney(creditSale[4]);
    return safeParsedResult({
      intent: 'SALE',
      is_credit: true,
      customer_name: customer,
      items: [{ name: normalizeItemName(itemInfo), qty: 1 }],
      total_money: amt,
      reply_text: `✅ Recorded as credit sale to ${customer} for ${amt}.`
    });
  }

  return null;
}

const getSystemPrompt = (userLanguage: string, currentDate: string) => `
You are "Tallypadi", a smart Nigerian Business Assistant.
Current Date: ${currentDate}. Language: ${userLanguage}.

🚨 CRITICAL MONEY RULES:
- "20k" = 20000. "2k" = 2000. DO NOT cut off zeros.
- If a user says "Sold to John for 20k on credit", set is_credit: true, customer_name: "John", total_money: 20000.
- If a user says "John paid 20k", intent is DEBT_PAYMENT, customer_name: "John", total_money: 20000.
- Name Normalization: convert plural to singular ("Cements" -> "cement").
- Large numbers (5000, 20k) are almost always total_money, NOT quantity.

Return ONLY JSON.
`;

// ... (withTimeout and geminiWithRetry remain the same) ...

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function geminiWithRetry(parts: any[]) {
  try { return await withTimeout(model.generateContent(parts), 25000); }
  catch (e: any) {
    const msg = String(e?.message || '');
    if (e?.status === 429 || msg.includes('429')) throw e;
    return await withTimeout(model.generateContent(parts), 25000);
  }
}

export const parseMessageWithGemini = async (
  message: string,
  userLanguage: string = 'English',
  imageBuffer?: string,
  imageMimeType?: string
): Promise<ParsedResult> => {
  const safeMessage = sanitizeInput(message);
  const fb = fallbackParse(safeMessage);
  if (fb) return fb;

  const parts: any[] = [`${getSystemPrompt(userLanguage, new Date().toISOString())}\n\nUser: ${safeMessage}`];
  if (imageBuffer && imageMimeType) parts.push({ inlineData: { data: imageBuffer, mimeType: imageMimeType } });

  try {
    const result = await geminiWithRetry(parts);
    const cleaned = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
    return safeParsedResult(JSON.parse(cleaned));
  } catch (err) {
    console.error('❌ Gemini Error:', err);
    return safeParsedResult({ intent: 'UNKNOWN', reply_text: 'Network error. Try again.' });
  }
};