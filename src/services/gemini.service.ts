import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

const genAI = new GoogleGenerativeAI(env.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: env.geminiModel,
  generationConfig: { responseMimeType: 'application/json' },
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
  category?: string | null;
}

export interface ParsedResult {
  intent: ParsedIntent;
  is_credit: boolean;
  customer_name?: string;
  staffPhoneNumber?: string;
  items: ParsedItem[];
  total_money: number | null;
  discount_amount?: number | null;
  confidence_score?: number;
  needs_clarification?: boolean;
  report_params: {
    start_date: string | null;
    end_date: string | null;
    category_filter?: string | null;

    // ✅ NEW
    include_undone?: boolean; // default false unless user asks
  };
  settings_update: { key: string | null; value: string | boolean | null };
  reply_text: string;
}

const SAFE_MAX = 1000;

// ==========================================
// 🧾 STRIP WHATSAPP EXPORT LINE
// ==========================================
const stripWhatsAppExportLine = (input: string): string => {
  if (!input) return '';

  let s = input.trim();

  s = s.replace(/^\[\[([^\]]+)\]\]\s*/, '[$1] ');
  s = s.replace(/^\[\s*\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]\s*/i, '');
  s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*-\s*/i, '');
  s = s.replace(/^~?[a-z0-9 _.-]{1,40}:\s*/i, '');

  return s.trim();
};

// ==========================================
// 🧼 SANITIZE
// ==========================================
const sanitizeInput = (input: string): string => {
  if (!input) return '';
  let s = input.slice(0, SAFE_MAX);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/<\/?[^>]+>/g, ' ');
  s = s.replace(/\b(system prompt|ignore previous|developer mode)\b/gi, ' ');
  return s.replace(/\s+/g, ' ').trim();
};

// ==========================================
// 🧩 JSON EXTRACTOR (survives extra text)
// ==========================================
const extractJsonObject = (text: string): string => {
  const t = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return t;
  return t.slice(first, last + 1);
};

// ==========================================
// 📱 PHONE NORMALIZER
// ==========================================
const normalizePhone = (raw: any): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const s = sanitizeInput(raw);
  const cleaned = s.replace(/[^\d+]/g, '');
  return cleaned || undefined;
};

// ==========================================
// 💱 CURRENCY SYMBOL DETECTOR (for reply_text only)
// If user typed a symbol, we echo it back.
// If none, return '' so reply_text does NOT force ₦ (prevents mismatch with USD reports).
// ==========================================
const detectMoneySymbol = (raw: any): string => {
  const s = String(raw || '');
  if (s.includes('$')) return '$';
  if (s.includes('£')) return '£';
  if (s.includes('€')) return '€';
  if (s.includes('₵')) return '₵';
  if (s.includes('₦')) return '₦';
  return '';
};

// ==========================================
// 💰 MONEY PARSER (number only)
// Supports 100k, 1.5m, ₦20,000, $50 etc.
// ==========================================
const parseMoney = (raw: any): number | null => {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;

  const s0 = String(raw).toLowerCase().trim();
  if (!s0) return null;

  const s = s0.replace(/\s+/g, '').replace(/,/g, '');
  const mult = s.includes('m') ? 1_000_000 : s.includes('k') ? 1_000 : 1;
  const num = parseFloat(s.replace(/[^\d.]/g, ''));

  if (Number.isNaN(num)) return null;
  const v = num * mult;
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
};

// ==========================================
// 📦 ITEM NORMALIZATION
// ==========================================
const normalizeItemName = (name: string): string => {
  if (!name) return 'unknown_item';
  let n = sanitizeInput(name).toLowerCase();

  n = n.replace(/\b(of|the|a|an|my|your|pls|please|abeg)\b/g, ' ');
  n = n.replace(/\b(bags?|pcs?|pieces?|cartons?|packs?|sachets?|bottles?|rolls?)\b/g, ' ');
  n = n.replace(/\b(liters?|ltrs?|kg|gms?|grams?)\b/g, ' ');

  n = n.replace(/\s+/g, ' ').trim();

  if (n.endsWith('s') && !n.endsWith('ss') && n.length > 3) {
    const protectedWords = ['rice', 'beans', 'gas', 'flour', 'semovita', 'wheat', 'indomie', 'coke'];
    if (!protectedWords.includes(n)) n = n.slice(0, -1);
  }

  return n || 'unknown_item';
};

// ==========================================
// ✅ TOTAL COMPUTE (qty * unit_price)
// ==========================================
const computeTotalFromItems = (items: ParsedItem[]): number | null => {
  const sum = items.reduce((acc, it) => {
    const qty = Number(it?.qty || 0);
    const unit = Number(it?.unit_price ?? 0);

    if (!Number.isFinite(qty) || qty <= 0) return acc;
    if (!Number.isFinite(unit) || unit <= 0) return acc;

    return acc + qty * unit;
  }, 0);

  return sum > 0 ? Math.round(sum) : null;
};

// ==========================================
// ✅ SAFE RESULT NORMALIZER
// - FIXES: "each/per" cases by enforcing computed totals when unit_price exists
// ==========================================
function safeParsedResult(p: any): ParsedResult {
  const allowedIntents: ParsedIntent[] = [
    'SALE',
    'RESTOCK',
    'SET_STOCK',
    'DELETED_STOCK',
    'DEFINE_PRICE',
    'PRICE_CHECK',
    'REPORT_SALES',
    'REPORT_STOCK',
    'REPORT_FULL',
    'SETTINGS',
    'CHANGE_LANGUAGE',
    'DEBT_PAYMENT',
    'CLOSE_BOOK',
    'ADD_STAFF',
    'DOWNLOAD_REPORT',
    'UNDO_LAST_SALE',
    'REPORT_DEBTS',
    'REPORT_RECENT',
    'HELP',
    'UNKNOWN',
  ];

  const intent: ParsedIntent = allowedIntents.includes(p?.intent) ? p.intent : 'UNKNOWN';

  const items = Array.isArray(p?.items) ? p.items : [];
  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: any) => ({
    name: typeof it?.name === 'string' ? normalizeItemName(it.name) : 'unknown_item',
    qty: Number.isFinite(Number(it?.qty)) ? Math.max(0, Number(it.qty)) : 0,
    unit_price: parseMoney(it?.unit_price),
    unit: typeof it?.unit === 'string' ? sanitizeInput(it.unit).toLowerCase() : '',
    category: typeof it?.category === 'string' ? sanitizeInput(it.category) : null,
  }));

  let needsClarification = Boolean(p?.needs_clarification);
  if (intent === 'SALE') {
    const hasRealItem = normalizedItems.some(
      (i) => i.qty > 0 && i.name && i.name !== 'unknown_item' && i.name !== 'item'
    );
    if (!hasRealItem) needsClarification = true;
  }

  // ✅ include_undone safe normalization:
  const includeUndoneRaw = p?.report_params?.include_undone;
  const include_undone = typeof includeUndoneRaw === 'boolean' ? includeUndoneRaw : false;

  // ✅ FIX: compute correct totals when unit_price exists
  const parsedTotal = parseMoney(p?.total_money);
  const computedTotal = computeTotalFromItems(normalizedItems);

  let finalTotal = parsedTotal;
  if (computedTotal != null) {
    // Use computed if total is missing OR total looks like the unit price
    if (finalTotal == null || finalTotal < computedTotal) {
      finalTotal = computedTotal;
    }
  }

  const discount = parseMoney(p?.discount_amount);
  if (finalTotal != null && discount != null && discount > 0) {
    finalTotal = Math.max(0, finalTotal - discount);
  }

  // fallback reply
  let fallback = 'Noted.';
  if (intent === 'SALE') {
    const i = normalizedItems[0];
    fallback = i ? `✅ Recorded. Sold ${i.qty} ${i.name}.` : '✅ Sale recorded.';
    if (finalTotal != null) fallback += ` Total: ${finalTotal.toLocaleString()}`;
    if (needsClarification) fallback = 'I got the quantity, but what exactly did you sell? (e.g., "rice", "indomie")';
  }

  return {
    intent,
    is_credit: Boolean(p?.is_credit),
    customer_name: typeof p?.customer_name === 'string' ? sanitizeInput(p.customer_name) : undefined,
    staffPhoneNumber: normalizePhone(p?.staffPhoneNumber),
    items: normalizedItems,
    total_money: finalTotal,
    discount_amount: discount,
    confidence_score: typeof p?.confidence_score === 'number' ? p.confidence_score : 1,
    needs_clarification: needsClarification,
    report_params: {
      start_date: p?.report_params?.start_date || null,
      end_date: p?.report_params?.end_date || null,
      category_filter: p?.report_params?.category_filter || null,
      include_undone,
    },
    settings_update: {
      key: p?.settings_update?.key || null,
      value: p?.settings_update?.value ?? null,
    },
    reply_text: typeof p?.reply_text === 'string' && p.reply_text.length > 2 ? p.reply_text.trim() : fallback,
  };
}

// ==========================================
// ⚡ REFINED LOCAL PARSER (SMARTER REGEX)
// NOTE: Used when Gemini is slow.
// FIXED: supports "each/per" and computes total_money = qty * unit_price
// ==========================================
function fallbackParse(message: string): ParsedResult | null {
  const raw = sanitizeInput(stripWhatsAppExportLine(message));
  if (/^\d+$/.test(raw)) return null;

  const m = raw.toLowerCase();

  if (/\b(help|menu|commands|guide|options)\b/i.test(m)) {
    return safeParsedResult({
      intent: 'HELP',
      reply_text:
        '🤖 *TallyPadi Menu*\n1. Sales: "Sold 2 rice 5k"\n2. Stock: "Add 10 sugar"\n3. Reports: "Sales today"',
    });
  }

  if (/\b(undo|cancel last|mistake|delete last)\b/i.test(m)) {
    return safeParsedResult({ intent: 'UNDO_LAST_SALE', reply_text: '✅ Last transaction cancelled.' });
  }

  if (/\b(download|pdf|export|send report)\b/i.test(m)) {
    return safeParsedResult({ intent: 'DOWNLOAD_REPORT', reply_text: '📄 Generating PDF report...' });
  }

  if (/\b(debtors?|owing|who owes|credit list)\b/i.test(m) && !/\b(paid|pay)\b/i.test(m)) {
    return safeParsedResult({ intent: 'REPORT_DEBTS', reply_text: 'Fetching debtors list...' });
  }

  // Handles:
  // "Sold 3 bags rice for 100k"
  // "Sold 5 pack water for $1 each"
  // "Sold 2 coke at ₦500 per"
  // "Sold 4 bread for 2000 total"
  const saleRegex =
    /(?:i|we)?\s*\b(?:sold|sell)\b\s+(\d+(?:\.\d+)?)\s*(bags?|pcs?|pieces?|cartons?|packs?|sachets?|bottles?|rolls?|liters?|ltrs?|kg)?\s*(?:of)?\s+(.+?)\s+(?:for|at|price)\s+([₦$€£₵]?\s*[\d,]+(?:k|m)?)\s*(each|per|\/each|\/per|total)?\b/i;

  const match = raw.match(saleRegex);

  if (match) {
    const qty = parseFloat(match[1]);
    const unitRaw = match[2] || 'pcs';
    const name = normalizeItemName(match[3]);
    const moneyRaw = match[4];
    const qualifier = String(match[5] || '').toLowerCase(); // each/per/total...
    const price = parseMoney(moneyRaw);
    const sym = detectMoneySymbol(moneyRaw);

    const unit =
      unitRaw.toLowerCase().startsWith('bag')
        ? 'bag'
        : unitRaw.toLowerCase().startsWith('carton')
          ? 'carton'
          : unitRaw.toLowerCase().startsWith('pack')
            ? 'pack'
            : unitRaw.toLowerCase().startsWith('bottle')
              ? 'bottle'
              : unitRaw.toLowerCase().startsWith('liter') || unitRaw.toLowerCase().startsWith('ltr')
                ? 'liter'
                : unitRaw.toLowerCase().startsWith('kg')
                  ? 'kg'
                  : unitRaw.toLowerCase().startsWith('pc') || unitRaw.toLowerCase().startsWith('piece')
                    ? 'pcs'
                    : unitRaw.toLowerCase();

    if (name && name !== 'unknown_item' && qty > 0) {
      const isUnit =
        qualifier === 'each' || qualifier === 'per' || qualifier === '/each' || qualifier === '/per';

      const unitPrice = isUnit ? price : null;
      const totalMoney = price == null ? null : isUnit ? Math.round(qty * price) : price;

      return safeParsedResult({
        intent: 'SALE',
        is_credit: false,
        items: [
          {
            name,
            qty,
            unit,
            unit_price: unitPrice,
            category: null,
          },
        ],
        total_money: totalMoney,
        reply_text:
          totalMoney != null
            ? `✅ Recorded. Sold ${qty} ${unit} of ${name} for ${sym}${totalMoney.toLocaleString()}`.trim()
            : `✅ Recorded. Sold ${qty} ${unit} of ${name}.`,
      });
    }
  }

  return null;
}

// ==========================================
// 🧠 TALLYPADI SYSTEM PROMPT
// (UPDATED: explicit rule to compute total_money when unit_price exists)
// ==========================================
const getSystemPrompt = (userLanguage: string, currentDate: string, history: string[]) => `
You are **TallyPadi**, an intelligent business assistant specializing in small retail/shop management.
Current Date: ${currentDate}
User Language: ${userLanguage.toUpperCase()}

*** STRICT LANGUAGE RULES ***
1. If User Language is "ENGLISH": Always respond in clear, professional Standard English.
   - Avoid slang, pidgin, or informal expressions like "abeg", "wetin", "my guy".
   - Use polite, precise phrasing (e.g., "Recorded", "Please provide more details").
2. If User Language is "PIDGIN": Respond entirely in natural Nigerian Pidgin.

*** CONVERSATION HISTORY (CONTEXT) ***
${history.map((msg, i) => `[Turn ${i + 1}]: ${msg}`).join('\n')}

*** 1. ADVANCED & ROBUST TEXT PARSING (CRITICAL) ***
Your primary goal is to accurately extract structured data from highly variable natural language input.
Use linguistic flexibility, pattern matching, and context to handle messy, incomplete, or reordered phrases.

A. QUANTITY & UNIT EXTRACTION (HIGHLY FLEXIBLE ORDER)
- Accept quantity anywhere relative to unit/item: before, after, or separated.
- Examples:
  - "5 packs of pure water" → qty: 5, unit: "pack"
  - "pure water 5 packs" → qty: 5, unit: "pack"
  - "2 carton indomie" → qty: 2, unit: "carton"
  - "indomie 3 cartons" → qty: 3, unit: "carton"
  - "10 eggs" or "10 pieces egg" → qty: 10, unit: "pcs" (default for countable items)
  - "5kg rice" or "rice 5 kg" or "5 kilos of rice" → qty: 5, unit: "kg"
  - "half bag garri" → qty: 0.5, unit: "bag"
  - "two and half bags rice" → qty: 2.5, unit: "bag"
- Support written numbers: "one", "two", "three", ..., "twenty" → convert to numeric.
- Default unit: "pcs" for items without explicit unit (e.g., "sold 5 coke").

B. ITEM NAME EXTRACTION & NORMALIZATION (ROBUST CLEANING)
- Extract the core generic product name; aggressively remove noise.
- Remove brand names unless they define the product.
- Rules:
  - "Aquarite table water", "Eva water", "CWAY water" → "table water"
  - "Coca-Cola", "coke", "cocacola", "big coke" → "coke"
  - "Indomie noodles", "indomie hungryman" → "noodles"
- Normalize plurals to singular.

C. PRICE/MONEY EXTRACTION (POSITION-INDEPENDENT & SMART SCALING)
- Money can appear anywhere in the sentence.
- Smart scaling: "100k"→100000, "1.5m"→1500000.
- Distinguish unit_price vs total_money:
  - If "each/per/a piece/per bag" is present → set unit_price
  - ✅ CRITICAL: If you set unit_price, you MUST set total_money = sum(qty * unit_price) across items (minus discount if any). Do NOT set total_money to the unit price.

*** 4. REPORT & DATE HANDLING ***
- include_undone: default false; set true only if explicitly requested.

*** 6. JSON OUTPUT RULES ***
- ALWAYS output strict valid JSON only.

*** 7. OUTPUT SCHEMA ***
{
  "intent": "SALE|RESTOCK|SET_STOCK|DELETED_STOCK|DEFINE_PRICE|PRICE_CHECK|REPORT_SALES|REPORT_STOCK|REPORT_FULL|REPORT_DEBTS|REPORT_RECENT|DEBT_PAYMENT|CLOSE_BOOK|ADD_STAFF|DOWNLOAD_REPORT|UNDO_LAST_SALE|SETTINGS|CHANGE_LANGUAGE|HELP|UNKNOWN",
  "is_credit": boolean,
  "customer_name": string | null,
  "staffPhoneNumber": string | null,
  "items": [
    {
      "name": string,
      "qty": number,
      "unit": string,
      "unit_price": number | null,
      "currency": "NGN|USD|GBP|EUR|GHS|null",
      "category": string | null
    }
  ],
  "total_money": number | null,
  "total_currency": "NGN|USD|GBP|EUR|GHS|null",
  "discount_amount": number | null,
  "confidence_score": number,
  "needs_clarification": boolean,
  "report_params": {
    "start_date": string | null,
    "end_date": string | null,
    "category_filter": string | null,
    "include_undone": boolean
  },
  "settings_update": { "key": string | null, "value": any | null },
  "reply_text": string
}
`;

export default getSystemPrompt;

// ==========================================
// ⏱️ TIMEOUT UTILS
// ==========================================
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function generateWithRetry(parts: any[], retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await withTimeout(model.generateContent(parts), 15000);
      return result;
    } catch (err: any) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('Gemini retries failed');
}

// ==========================================
// 🚀 MAIN EXPORT
// ==========================================
export const parseMessageWithGemini = async (
  message: string,
  userLanguage: string = 'English',
  history: string[] = [],
  imageBuffer?: string,
  imageMimeType?: string
): Promise<ParsedResult> => {
  const stripped = stripWhatsAppExportLine(message);
  const safeMessage = sanitizeInput(stripped);

  // 1️⃣ FAST PATH (Skip for short numbers needing context)
  const isShortNumber = /^\d+$/.test(safeMessage.trim());
  if (!isShortNumber) {
    const localResult = fallbackParse(safeMessage);
    if (localResult) {
      console.log(`⚡ Handled locally: ${localResult.intent}`);
      return localResult;
    }
  }

  // 2️⃣ GEMINI PARSE (With History)
  const recentHistory = history.slice(-5);
  const prompt = getSystemPrompt(userLanguage, new Date().toISOString(), recentHistory);

  const parts: any[] = [`${prompt}\n\nUSER MESSAGE: "${safeMessage}"\n\nReturn JSON only.`];

  if (imageBuffer && imageMimeType) {
    parts.push({ inlineData: { data: imageBuffer, mimeType: imageMimeType } });
  }

  try {
    const result = await generateWithRetry(parts);
    const text = result.response.text();

    const cleanJson = extractJsonObject(text);
    return safeParsedResult(JSON.parse(cleanJson));
  } catch (error) {
    console.error('❌ Gemini Error:', error);
    return safeParsedResult({
      intent: 'UNKNOWN',
      reply_text: 'Network weak. Please try again or use format: "Sold 2 rice 5000"',
    });
  }
};
