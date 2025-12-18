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
  };
  settings_update: { key: string | null; value: string | boolean | null };
  reply_text: string;
}

const SAFE_MAX = 1000;

// ==========================================
// 🧾 STRIP WHATSAPP EXPORT LINE
// Fixes things like:
// [[18/12/2025, 22:54:44]] SnowTech: I sold 2 bags of rice for 100k
// [18/12/2025, 22:54:44] SnowTech: ...
// 18/12/2025, 22:54 - SnowTech: ...
// ==========================================
const stripWhatsAppExportLine = (input: string): string => {
  if (!input) return '';

  let s = input.trim();

  // [[...]] -> [...]
  s = s.replace(/^\[\[([^\]]+)\]\]\s*/, '[$1] ');

  // remove leading timestamp blocks like: [dd/mm/yyyy, hh:mm(:ss)] ...
  s = s.replace(/^\[\s*\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]\s*/i, '');

  // remove leading export style: dd/mm/yyyy, hh:mm - ...
  s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*-\s*/i, '');

  // remove leading "Name:" (including "~H:")
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
  // Remove injection attempts but keep natural language
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
// 💰 MONEY PARSER
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

  // Strip filler words "of", "the", "please"
  n = n.replace(/\b(of|the|a|an|my|your|pls|please|abeg)\b/g, ' ');

  // Strip container/unit words IF they appear in the name field
  n = n.replace(/\b(bags?|pcs?|pieces?|cartons?|packs?|sachets?|bottles?|rolls?)\b/g, ' ');
  n = n.replace(/\b(liters?|ltrs?|kg|gms?|grams?)\b/g, ' ');

  n = n.replace(/\s+/g, ' ').trim();

  // Simple singularization (avoiding irregulars)
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

  // Force clarification if SALE but item missing/unknown
  let needsClarification = Boolean(p?.needs_clarification);
  if (intent === 'SALE') {
    const hasRealItem = normalizedItems.some(i => i.qty > 0 && i.name && i.name !== 'unknown_item' && i.name !== 'item');
    if (!hasRealItem) needsClarification = true;
  }

  // Smart fallback replies based on intent
  let fallback = 'Noted.';
  if (intent === 'SALE') {
    const total = parseMoney(p?.total_money);
    const i = normalizedItems[0];
    fallback = i ? `✅ Recorded: ${i.qty} ${i.name}` : '✅ Sale recorded.';
    if (total != null) fallback += ` for ₦${total.toLocaleString()}`;
    if (needsClarification) fallback = 'I got the quantity, but what exactly did you sell? (e.g., "rice", "indomie")';
  }

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
// ==========================================
function fallbackParse(message: string): ParsedResult | null {
  const raw = sanitizeInput(stripWhatsAppExportLine(message));

  // 1️⃣ Skip if it's just a number (we need Gemini to use History for context)
  if (/^\d+$/.test(raw)) return null;

  const m = raw.toLowerCase();

  // 1. HELP / MENU
  if (/\b(help|menu|commands|guide|options)\b/i.test(m)) {
    return safeParsedResult({
      intent: 'HELP',
      reply_text: '🤖 *TallyPadi Menu*\n1. Sales: "Sold 2 rice 5k"\n2. Stock: "Add 10 sugar"\n3. Reports: "Sales today"'
    });
  }

  // 2. UNDO
  if (/\b(undo|cancel last|mistake|delete last)\b/i.test(m)) {
    return safeParsedResult({ intent: 'UNDO_LAST_SALE', reply_text: '✅ Last transaction cancelled.' });
  }

  // 3. DOWNLOAD
  if (/\b(download|pdf|export|send report)\b/i.test(m)) {
    return safeParsedResult({ intent: 'DOWNLOAD_REPORT', reply_text: '📄 Generating PDF report...' });
  }

  // 4. DEBTS
  if (/\b(debtors?|owing|who owes|credit list)\b/i.test(m) && !/\b(paid|pay)\b/i.test(m)) {
    return safeParsedResult({ intent: 'REPORT_DEBTS', reply_text: 'Fetching debtors list...' });
  }

  // 5. SMARTER SALE REGEX
  // Handles: "I sold 3 bags of rice for 100k" OR "Sold 3 rice 100k"
  const saleRegex =
    /(?:i|we)?\s*\b(?:sold|sell)\b\s+(\d+(?:\.\d+)?)\s*(bags?|pcs?|cartons?|liters?|kg)?\s*(?:of)?\s+([a-z0-9\s]+?)\s+(?:for|at|price)\s+([₦$€£₵]?\s*[\d,]+(?:k|m)?)\b/i;

  const match = raw.match(saleRegex);

  if (match) {
    const qty = parseFloat(match[1]);
    const unitRaw = match[2] || 'pcs';
    const name = normalizeItemName(match[3]);
    const price = parseMoney(match[4]);

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
          ? `✅ Recorded. Sold ${qty} ${unit} of ${name} for ₦${price.toLocaleString()}.`
          : `✅ Recorded. Sold ${qty} ${unit} of ${name}.`
      });
    }
  }

  return null;
}

// ==========================================
// 🧠 ULTIMATE SYSTEM PROMPT (COMBINED)
// ==========================================
const getSystemPrompt = (userLanguage: string, currentDate: string, history: string[]) => `
You are **TallyPadi**, an intelligent business assistant.
Current Date: ${currentDate}
User Language: ${userLanguage.toUpperCase()}

*** STRICT LANGUAGE RULES ***
1. If User Language is "ENGLISH": Use professional, standard English.
   - ❌ Avoid: "My guy", "Abeg", "Wetin".
   - ✅ Use: "Recorded", "Please clarify".
2. If User Language is "PIDGIN" or user speaks Pidgin: Use Nigerian Pidgin.

*** CONVERSATION HISTORY (CONTEXT) ***
${history.map((msg, i) => `[User Turn ${i + 1}]: ${msg}`).join('\n')}

*** 1. PARSING INTELLIGENCE (CRITICAL) ***
You must extract the **Exact Item Name**, **Quantity**, **Unit**, and **Price**.

* "I sold 3 bags of rice for 100k"
    * ❌ BAD: { name: "bags of rice", qty: 3, unit: "pcs" }
    * ✅ GOOD: { name: "rice", qty: 3, unit: "bag", total_money: 100000 }

* "Sold 5 cartons of indomie"
    * ✅ GOOD: { name: "indomie", qty: 5, unit: "carton" }

*** 2. CONTEXT AWARENESS ***
* Clarification: If history shows "Sold rice" -> "How many?", and current input is "1", then Intent = SALE, Qty = 1.
* Correction: If history shows "Sold 2 beans", and input is "No, it was rice", then update Item Name.

*** 3. NIGERIAN MARKET RULES ***
* Currency: "100k" = 100,000 | "1.5m" = 1,500,000 | "500 naira" = 500.
* Credit: "On credit", "pay later", "gbese" → is_credit: true.
* Debt Payment: "Emeka paid 20k", "Clear debt" → Intent: DEBT_PAYMENT.

*** 4. JSON OUTPUT SCHEMA (STRICT) ***
Return ONLY this JSON object. No markdown.

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
  // ✅ strip WhatsApp export noise FIRST, then sanitize
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

    // ✅ robust JSON extraction
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
