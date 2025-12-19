import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

const genAI = new GoogleGenerativeAI(env.geminiApiKey);

const model = genAI.getGenerativeModel({
  model: env.geminiModel,
  generationConfig: { responseMimeType: 'application/json' },
});

export type ParsedIntent =
  | 'SALE' | 'RESTOCK' | 'SET_STOCK' | 'DELETED_STOCK' | 'DEFINE_PRICE' | 'PRICE_CHECK'
  | 'REPORT_SALES' | 'REPORT_STOCK' | 'REPORT_FULL' | 'SETTINGS' | 'CHANGE_LANGUAGE'
  | 'DEBT_PAYMENT' | 'CLOSE_BOOK' | 'ADD_STAFF' | 'DOWNLOAD_REPORT' | 'UNDO_LAST_SALE'
  | 'REPORT_DEBTS' | 'REPORT_RECENT' | 'HELP' | 'UNKNOWN';

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
  const t = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
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
// ✅ SAFE RESULT NORMALIZER
// ==========================================
function safeParsedResult(p: any): ParsedResult {
  const allowedIntents = [
    'SALE', 'RESTOCK', 'SET_STOCK', 'DELETED_STOCK', 'DEFINE_PRICE', 'PRICE_CHECK',
    'REPORT_SALES', 'REPORT_STOCK', 'REPORT_FULL', 'SETTINGS', 'CHANGE_LANGUAGE',
    'DEBT_PAYMENT', 'CLOSE_BOOK', 'ADD_STAFF', 'DOWNLOAD_REPORT', 'UNDO_LAST_SALE',
    'REPORT_DEBTS', 'REPORT_RECENT', 'HELP', 'UNKNOWN'
  ];

  const intent: ParsedIntent = allowedIntents.includes(p?.intent) ? p.intent : 'UNKNOWN';

  const items = Array.isArray(p?.items) ? p.items : [];
  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: any) => ({
    name: typeof it?.name === 'string' ? normalizeItemName(it.name) : 'unknown_item',
    qty: Number.isFinite(Number(it?.qty)) ? Math.max(0, Number(it.qty)) : 0,
    unit_price: parseMoney(it?.unit_price),
    unit: typeof it?.unit === 'string' ? sanitizeInput(it.unit).toLowerCase() : '',
    category: typeof it?.category === 'string' ? sanitizeInput(it.category) : null
  }));

  let needsClarification = Boolean(p?.needs_clarification);
  if (intent === 'SALE') {
    const hasRealItem = normalizedItems.some(i => i.qty > 0 && i.name && i.name !== 'unknown_item' && i.name !== 'item');
    if (!hasRealItem) needsClarification = true;
  }

  let fallback = 'Noted.';
  if (intent === 'SALE') {
    const total = parseMoney(p?.total_money);
    const i = normalizedItems[0];
    fallback = i ? `✅ Recorded. Sold ${i.qty} ${i.name}.` : '✅ Sale recorded.';
    if (total != null) fallback += ` Total: ${total.toLocaleString()}`;
    if (needsClarification) fallback = 'I got the quantity, but what exactly did you sell? (e.g., "rice", "indomie")';
  }

  // ✅ include_undone safe normalization:
  const includeUndoneRaw = p?.report_params?.include_undone;
  const include_undone = typeof includeUndoneRaw === 'boolean' ? includeUndoneRaw : false;

  return {
    intent,
    is_credit: Boolean(p?.is_credit),
    customer_name: typeof p?.customer_name === 'string' ? sanitizeInput(p.customer_name) : undefined,
    staffPhoneNumber: normalizePhone(p?.staffPhoneNumber),
    items: normalizedItems,
    total_money: parseMoney(p?.total_money),
    discount_amount: parseMoney(p?.discount_amount),
    confidence_score: typeof p?.confidence_score === 'number' ? p.confidence_score : 1,
    needs_clarification: needsClarification,
    report_params: {
      start_date: p?.report_params?.start_date || null,
      end_date: p?.report_params?.end_date || null,
      category_filter: p?.report_params?.category_filter || null,
      include_undone, // ✅ NEW (defaults false)
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
// NOTE: This is still used when Gemini is slow.
// We also fixed it to NOT force ₦.
// ==========================================
function fallbackParse(message: string): ParsedResult | null {
  const raw = sanitizeInput(stripWhatsAppExportLine(message));

  if (/^\d+$/.test(raw)) return null;

  const m = raw.toLowerCase();

  if (/\b(help|menu|commands|guide|options)\b/i.test(m)) {
    return safeParsedResult({
      intent: 'HELP',
      reply_text: '🤖 *TallyPadi Menu*\n1. Sales: "Sold 2 rice 5k"\n2. Stock: "Add 10 sugar"\n3. Reports: "Sales today"'
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

  // Handles: "I sold 3 bags of rice for 100k" OR "Sold 3 rice $50"
  const saleRegex =
    /(?:i|we)?\s*\b(?:sold|sell)\b\s+(\d+(?:\.\d+)?)\s*(bags?|pcs?|cartons?|liters?|kg)?\s*(?:of)?\s+([a-z0-9\s]+?)\s+(?:for|at|price)\s+([₦$€£₵]?\s*[\d,]+(?:k|m)?)\b/i;

  const match = raw.match(saleRegex);

  if (match) {
    const qty = parseFloat(match[1]);
    const unitRaw = match[2] || 'pcs';
    const name = normalizeItemName(match[3]);
    const priceRaw = match[4];
    const price = parseMoney(priceRaw);
    const sym = detectMoneySymbol(priceRaw);

    const unit =
      unitRaw.toLowerCase().startsWith('bag') ? 'bag' :
      unitRaw.toLowerCase().startsWith('carton') ? 'carton' :
      unitRaw.toLowerCase().startsWith('liter') ? 'liter' :
      unitRaw.toLowerCase().startsWith('kg') ? 'kg' :
      unitRaw.toLowerCase().startsWith('pc') ? 'pcs' : unitRaw.toLowerCase();

    if (name && name !== 'unknown_item' && qty > 0) {
      return safeParsedResult({
        intent: 'SALE',
        is_credit: false,
        items: [{
          name,
          qty,
          unit,
          unit_price: null,
          category: null
        }],
        total_money: price,
        reply_text: price != null
          ? `✅ Recorded. Sold ${qty} ${unit} of ${name} for ${sym}${price.toLocaleString()}`.trim()
          : `✅ Recorded. Sold ${qty} ${unit} of ${name}.`
      });
    }
  }

  return null;
}

// ==========================================
// 🧠 SYSTEM PROMPT (UPDATED FOR MULTI-CURRENCY)
// ==========================================
const getSystemPrompt = (userLanguage: string, currentDate: string, history: string[]) => `
You are **TallyPadi**, an intelligent business assistant.
Current Date: ${currentDate}
User Language: ${userLanguage.toUpperCase()}

*** STRICT LANGUAGE RULES ***
1. If User Language is "ENGLISH": Use professional, standard English.
   - ❌ Avoid slang: "My guy", "Abeg", "Wetin".
   - ✅ Use: "Recorded", "Please clarify".
2. If User Language is "PIDGIN": Use Nigerian Pidgin.

*** CONVERSATION HISTORY (CONTEXT) ***
${history.map((msg, i) => `[User Turn ${i + 1}]: ${msg}`).join('\n')}

*** 1. PARSING INTELLIGENCE (CRITICAL) ***
Extract the **Exact Item Name**, **Quantity**, **Unit**, and **Money**.

Examples:
- "I sold 3 bags of rice for 100k"
  ✅ name: "rice", qty: 3, unit: "bag", total_money: 100000

- "Sold 5 cartons of indomie"
  ✅ name: "indomie", qty: 5, unit: "carton"

*** 2. CONTEXT AWARENESS ***
- If history shows the bot asked for quantity and user replies "1", treat it as completing the previous SALE.
- If history shows the bot asked "what item?" and user replies "rice", treat it as completing the previous SALE.

*** 3. MONEY + MULTI-CURRENCY RULES (VERY IMPORTANT) ***
You must understand these currencies/symbols:
- ₦ or NGN = Nigerian Naira
- $ or USD = US Dollar
- £ or GBP = British Pound
- € or EUR = Euro
- ₵ or GHS = Ghana Cedi

If user includes a currency symbol (₦ $ £ € ₵), treat the amount as that currency **but still output total_money as a NUMBER**.
If user does NOT include a currency symbol/code, still output total_money as a NUMBER.

Slang:
- "100k" = 100,000
- "1.5m" = 1,500,000

*** 4. CREDIT / DEBT RULES ***
- Credit: "on credit", "pay later", "gbese" → is_credit: true, intent usually SALE.
- Debt payment: "Emeka paid 20k", "Paid my debt", "Clear debt" → intent: DEBT_PAYMENT, customer_name required.

*** 5. REPORTS (IMPORTANT) ***
When the user asks for any report:
- Use intent: REPORT_SALES, REPORT_FULL, REPORT_STOCK, REPORT_RECENT, REPORT_DEBTS, DOWNLOAD_REPORT, CLOSE_BOOK.
- Put dates (if any) inside report_params.start_date and report_params.end_date (ISO date/time strings or ISO dates).
- If the user does NOT specify a date, keep both null.
- If the user message is exactly "sales" or "sale", set intent = REPORT_SALES and keep report_params.start_date/end_date as null (meaning today).


✅ **UNDONE / REVERSED / VOIDED SALES IN REPORTS**
Some sales can be "undone" (reversed/voided/cancelled). By default, reports should EXCLUDE undone sales.

Set:
  report_params.include_undone = false
unless the user clearly asks to include them.

Set:
  report_params.include_undone = true
ONLY if the user asks things like:
- "show undone history"
- "include undone sales"
- "include reversed transactions"
- "with cancelled/voided sales"
- "show me undone reports"
- "show full history including undone"

If the user says:
- "exclude undone"
- "without undone"
then include_undone MUST be false.

if the user says nothing about undone sales, include_undone MUST be false.


*** 6. REPLY TEXT RULE (IMPORTANT) ***
In reply_text:
- If the user typed a currency symbol, you may repeat that same symbol.
- If the user did NOT type a currency symbol, do NOT force ₦. You can say "Total: 50,000" without any symbol.

*** 7. JSON OUTPUT SCHEMA (STRICT) ***
Return ONLY this JSON object. No markdown. No extra keys.

{
  "intent": "SALE|RESTOCK|SET_STOCK|DELETED_STOCK|DEFINE_PRICE|PRICE_CHECK|REPORT_SALES|REPORT_STOCK|REPORT_FULL|REPORT_DEBTS|REPORT_RECENT|DEBT_PAYMENT|CLOSE_BOOK|ADD_STAFF|DOWNLOAD_REPORT|UNDO_LAST_SALE|SETTINGS|CHANGE_LANGUAGE|HELP|UNKNOWN",
  "is_credit": boolean,
  "customer_name": "string | null",
  "staffPhoneNumber": "string | null",
  "items": [
    {
      "name": "string (normalized, e.g., 'rice')",
      "qty": number,
      "unit": "string (e.g., 'bag', 'pcs', 'kg')",
      "unit_price": number | null,
      "category": "string | null"
    }
  ],
  "total_money": number | null,
  "discount_amount": number | null,
  "confidence_score": number,
  "needs_clarification": boolean,
  "report_params": {
    "start_date": "string | null",
    "end_date": "string | null",
    "category_filter": "string | null",
    "include_undone": boolean
  },
  "settings_update": { "key": "string | null", "value": "string | boolean | null" },
  "reply_text": "string"
}
`;


// ==========================================
// ⏱️ TIMEOUT UTILS
// ==========================================
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

async function generateWithRetry(parts: any[], retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await withTimeout(model.generateContent(parts), 15000);
      return result;
    } catch (err: any) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000));
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

  const parts: any[] = [
    `${prompt}\n\nUSER MESSAGE: "${safeMessage}"\n\nReturn JSON only.`
  ];

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
      reply_text: 'Network weak. Please try again or use format: "Sold 2 rice 5000"'
    });
  }
};
