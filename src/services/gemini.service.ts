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

// ==========================================
// 🛠️ HELPERS & SANITIZATION
// ==========================================

/** ✅ Sanitize input: Removes invisible characters and strips HTML */
const sanitizeInput = (input: string): string => {
  if (!input) return '';
  let s = input.slice(0, SAFE_MAX);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ');
  s = s.replace(/<\/?[^>]+>/g, ' ');
  // Unicode-safe allow letters/numbers across languages + currency symbols
  s = s.replace(/[^\p{L}\p{N}\s₦$€£₵.,\-\/+()%@'_km]/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
};

/** ✅ Standardized Money Parser: Handles "20k", "₦20,000", "1.5m" -> numbers */
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

/** ✅ Normalize product name: Handles plural rules and removes units */
const normalizeItemName = (name: string): string => {
  if (!name) return 'unknown_item';
  let n = sanitizeInput(name).toLowerCase();

  // remove filler/units words
  n = n.replace(
    /\b(bags?|pcs?|pieces?|cartons?|packs?|sachets?|rolls?|bottles?|liters?|litres?|ltrs?|ltr|l|kg|kgs|grams?|of|the|a|an)\b/g,
    ' '
  );
  n = n.replace(/\s+/g, ' ').trim();

  // safer plural rules
  if (n.endsWith('ies') && n.length > 4) n = n.slice(0, -3) + 'y';
  else if (/(xes|ses|zes|ches|shes)$/.test(n) && n.length > 4) {
    const singularEnds = ['gas', 'dress', 'glass', 'bus'];
    if (!singularEnds.includes(n)) n = n.slice(0, -2);
  } else if (n.endsWith('s') && n.length > 3 && !n.endsWith('ss')) {
    const noTouch = new Set(['gas', 'rice', 'beans', 'couscous']);
    if (!noTouch.has(n)) n = n.slice(0, -1);
  }
  return n || 'item';
};

/** ✅ Parse "200 liters kerosene" -> qty=200, unit="liters", name="kerosene" */
const parseQtyUnitItem = (text: string): { qty: number; unit: string; name: string } | null => {
  const t = sanitizeInput(text).trim();

  // supports: 200 liters kerosene, 5 bags rice, 2 kg beans
  const m = t.match(
    /^(\d+(?:\.\d+)?)\s*(liters?|litres?|ltrs?|ltr|l|kg|kgs?|g|grams?|bags?|pcs?|pieces?|cartons?|packs?|bottles?|rolls?|sachets?)?\s+(.+)$/i
  );
  if (!m) return null;

  const qty = Number(m[1]);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const unit = m[2] ? sanitizeInput(m[2]).toLowerCase() : '';
  const name = normalizeItemName(m[3]);

  return { qty, unit, name };
};

// ==========================================
// 🧠 RESULT NORMALIZATION
// ==========================================

const allowedIntents: ParsedIntent[] = [
  'SALE',
  'RESTOCK',
  'SET_STOCK',
  'DELETED_STOCK',
  'DEFINE_PRICE',
  'PRICE_CHECK',
  'REPORT_SALES',
  'REPORT_DEBTS',
  'REPORT_STOCK',
  'REPORT_FULL',
  'CLOSE_BOOK',
  'SETTINGS',
  'CHANGE_LANGUAGE',
  'DEBT_PAYMENT',
  'ADD_STAFF',
  'DOWNLOAD_REPORT',
  'UNDO_LAST_SALE',
  'REPORT_RECENT',
  'HELP',
  'UNKNOWN',
];

function safeParsedResult(p: any): ParsedResult {
  const intent: ParsedIntent = allowedIntents.includes(p?.intent) ? p.intent : 'UNKNOWN';
  const items = Array.isArray(p?.items) ? p.items : [];

  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: any) => ({
    name: typeof it?.name === 'string' ? normalizeItemName(it.name) : 'unknown_item',
    qty: intent === 'DEFINE_PRICE' || intent === 'PRICE_CHECK' ? 0 : Number(it?.qty) > 0 ? Number(it.qty) : 0,
    unit_price: parseMoney(it?.unit_price),
    unit: typeof it?.unit === 'string' ? sanitizeInput(it.unit).toLowerCase() : '',
  }));

  const totalMoney = parseMoney(p?.total_money);

  let fallbackReply = 'Noted.';
  if (normalizedItems.length > 0) {
    const i = normalizedItems[0];
    if (intent === 'SALE') fallbackReply = `Noted. ${i.qty} ${i.name} recorded.`;
    if (intent === 'DEBT_PAYMENT') fallbackReply = `Payment recorded for ${p?.customer_name || 'customer'}.`;
  }

  return {
    intent,
    is_credit: Boolean(p?.is_credit),
    customer_name: typeof p?.customer_name === 'string' ? sanitizeInput(p.customer_name) : undefined,
    staffPhoneNumber: typeof p?.staffPhoneNumber === 'string' ? sanitizeInput(p.staffPhoneNumber) : undefined,
    items: normalizedItems,
    total_money: totalMoney,
    report_params: {
      start_date: typeof p?.report_params?.start_date === 'string' ? p.report_params.start_date : null,
      end_date: typeof p?.report_params?.end_date === 'string' ? p.report_params.end_date : null,
    },
    settings_update: {
      key:
        p?.settings_update?.key && ['closingTime', 'dailySummary', 'language'].includes(p.settings_update.key)
          ? p.settings_update.key
          : null,
      value: p?.settings_update?.value ?? null,
    },
    reply_text: typeof p?.reply_text === 'string' && p.reply_text.length > 3 ? p.reply_text.trim() : fallbackReply,
  };
}

// ==========================================
// ⚡ FALLBACK PARSER (Regex for common phrases)
// ==========================================

/**
 * ✅ Debt request should ONLY trigger when user is asking for list.
 * Not when "credit" appears inside a SALE sentence.
 */
const isDebtListQuery = (m: string) => {
  const s = m.trim().toLowerCase();

  // If message looks like a transaction, don't treat it as debt list query
  if (/\b(sold|sell|comot|add|restock|set\s+price|price\s+of|delete|remove)\b/.test(s)) return false;

  // Only these trigger debt list:
  if (/^(credit|credits)$/.test(s)) return true;
  if (s.includes('credit list') || s.includes('credits list') || s.includes('all credits')) return true;

  if (s.includes('who owes') || s.includes('who dey owe') || s.includes('who is owing')) return true;

  return /\b(debt|debts|debtors|owing|owes|gbese|bashi|ugwo|tab)\b/.test(s);
};

function fallbackParse(message: string): ParsedResult | null {
  const mRaw = sanitizeInput(message);
  const m = mRaw.toLowerCase();

  // ✅ 1) Credit Sale / Normal Sale FIRST (so "on credit" won't route to REPORT_DEBTS)
  // "Sold 200 liters kerosene to john for 20k on credit"
  const soldMatch = mRaw.match(/\b(sold|sell|comot)\b/i);
  if (soldMatch) {
    let rest = mRaw.replace(/\b(sold|sell|comot)\b/i, '').trim();

    // detect credit
    const isCredit = /\b(on\s+credit|credit|owe|owing|later)\b/i.test(rest);

    // extract amount (for|@|at)
    let total_money: number | null = null;
    const moneyMatch = rest.match(/\b(for|@|at)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?\s*(?:k|m)?)\b/i);
    if (moneyMatch) {
      total_money = parseMoney(moneyMatch[2]);
      rest = rest.replace(moneyMatch[0], '').trim();
    }

    // extract customer (to NAME)
    let customer_name: string | undefined = undefined;
    const toMatch = rest.match(/\bto\s+([a-zA-Z][a-zA-Z0-9\s]{0,30})\b/i);
    if (toMatch) {
      customer_name = sanitizeInput(toMatch[1]).trim();
      rest = rest.replace(toMatch[0], '').trim();
    }

    // remove credit words after extraction
    rest = rest.replace(/\b(on\s+credit|credit|owe|owing|later)\b/gi, '').trim();

    // parse qty/unit/item
    const q = parseQtyUnitItem(rest);
    if (q) {
      return safeParsedResult({
        intent: 'SALE',
        is_credit: isCredit,
        customer_name: isCredit ? customer_name : undefined,
        items: [{ name: q.name, qty: q.qty, unit_price: null, unit: q.unit }],
        total_money,
        reply_text: isCredit
          ? `✅ Recorded as credit sale to ${customer_name || 'customer'}${total_money != null ? ` for ₦${total_money}` : ''}.`
          : `✅ Recorded. Sold ${q.qty} ${q.name}${total_money != null ? ` for ₦${total_money}` : ''}.`,
      });
    }
  }

  // ✅ 2) Debt List Request (ONLY when user is asking)
  if (isDebtListQuery(m)) {
    return safeParsedResult({ intent: 'REPORT_DEBTS', reply_text: '📌 Debtors List' });
  }

  // ✅ 3) Debt Payment: "John paid 20k"
  const payMatch = mRaw.match(
    /\b([a-zA-Z][a-zA-Z0-9\s]{0,20})\s+(paid|pay|has\s+paid)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?\s*(?:k|m)?)\b/i
  );
  if (payMatch) {
    const customer = sanitizeInput(payMatch[1]).trim();
    const amt = parseMoney(payMatch[3]);
    if (amt != null) {
      return safeParsedResult({
        intent: 'DEBT_PAYMENT',
        customer_name: customer,
        total_money: amt,
        reply_text: `✅ Payment recorded. ${customer} paid ₦${amt}.`,
      });
    }
  }

  return null;
}

// ==========================================
// 🤖 GEMINI SYSTEM PROMPT
// ==========================================

const getSystemPrompt = (lang: string, date: string) => `
You are Tallypadi, a shop assistant for Nigerian SMEs.
Current Date: ${date}. User Language: ${lang}.

🚨 CRITICAL RULES:
1. "20k" = 20000. "1k" = 1000. DO NOT cut off digits.
2. If message says "on credit", "owing", or "later" INSIDE a sale, intent must be SALE and is_credit: true.
3. If user message is ONLY "credit"/"credits" or contains "credit list", that means REPORT_DEBTS.
4. If user says "Emeka paid 5k", set intent: DEBT_PAYMENT, customer_name: "Emeka", total_money: 5000.
5. "200 liters" -> qty is 200, unit is "liters". "For 20k" -> total_money is 20000.
6. Singularize items: "Rice" remains "rice", "Cements" becomes "cement".

Return JSON only.
`;

// ==========================================
// 🚀 EXPORTS
// ==========================================

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export const parseMessageWithGemini = async (
  message: string,
  userLanguage: string = 'English',
  imageBuffer?: string,
  imageMimeType?: string
): Promise<ParsedResult> => {
  const safeMessage = sanitizeInput(message);

  // ✅ 1) Fast local check first (sale detection now happens before debt list)
  const local = fallbackParse(safeMessage);
  if (local) return local;

  const parts: any[] = [`${getSystemPrompt(userLanguage, new Date().toISOString())}\n\nUser Message: ${safeMessage}`];
  if (imageBuffer && imageMimeType) {
    parts.push({ inlineData: { data: imageBuffer, mimeType: imageMimeType } });
  }

  try {
    const result = await withTimeout(model.generateContent(parts), 25000);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return safeParsedResult(JSON.parse(cleaned));
  } catch (err) {
    console.error('❌ Gemini Parse Error:', err);
    const retry = fallbackParse(safeMessage);
    return retry || safeParsedResult({ intent: 'UNKNOWN', reply_text: 'I no understand that one, abeg type am again.' });
  }
};
