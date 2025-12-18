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
  // (We do this to avoid "bags of rice" becoming name: "bags rice")
  n = n.replace(/\b(bags?|pcs?|pieces?|cartons?|packs?|sachets?|bottles?|rolls?)\b/g, ' ');
  n = n.replace(/\b(liters?|ltrs?|kg|gms?|grams?)\b/g, ' ');

  n = n.replace(/\s+/g, ' ').trim();

  // Simple singularization (avoiding irregulars)
  if (n.endsWith('s') && !n.endsWith('ss') && n.length > 3) {
    const protectedWords = ['rice', 'beans', 'gas', 'flour', 'semovita', 'wheat', 'indomie', 'coke'];
    if (!protectedWords.includes(n)) n = n.slice(0, -1);
  }

  return n || 'item';
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
    category: typeof it?.category === 'string' ? it.category : null
  }));

  // Smart fallback replies based on intent
  let fallback = 'Noted.';
  if (intent === 'SALE') {
    const total = parseMoney(p?.total_money);
    const i = normalizedItems[0];
    fallback = i ? `✅ Recorded: ${i.qty} ${i.name}` : '✅ Sale recorded.';
    if (total) fallback += ` for ₦${total.toLocaleString()}`;
  }
  
  return {
    intent,
    is_credit: Boolean(p?.is_credit),
    customer_name: typeof p?.customer_name === 'string' ? sanitizeInput(p.customer_name) : undefined,
    staffPhoneNumber: typeof p?.staffPhoneNumber === 'string' ? sanitizeInput(p.staffPhoneNumber) : undefined,
    items: normalizedItems,
    total_money: parseMoney(p?.total_money),
    discount_amount: parseMoney(p?.discount_amount),
    confidence_score: typeof p?.confidence_score === 'number' ? p.confidence_score : 1,
    needs_clarification: Boolean(p?.needs_clarification),
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
  const raw = sanitizeInput(message);
  const m = raw.toLowerCase();

  // 1. HELP / MENU
  if (/\b(help|menu|commands|guide|options)\b/i.test(m)) {
    return safeParsedResult({ intent: 'HELP', reply_text: '🤖 *TallyPadi Menu*\n1. Sales: "Sold 2 rice 5k"\n2. Stock: "Add 10 sugar"\n3. Reports: "Sales today"' });
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
  // Group 1: Qty (digits only to be safe for local)
  // Group 2: Unit (optional)
  // Group 3: Item Name
  // Group 4: Price
  const saleRegex = /(?:i|we)?\s*\b(?:sold|sell)\b\s+(\d+(?:\.\d+)?)\s*(bags?|pcs?|cartons?|liters?|kg)?\s*(?:of)?\s+([a-z0-9\s]+?)\s+(?:for|at|price)\s+([₦$€£₵]?\s*[\d,]+(?:k|m)?)\b/i;
  
  const match = raw.match(saleRegex);
  
  if (match) {
    const qty = parseFloat(match[1]);
    const unit = match[2] || 'pcs'; // e.g. "bags"
    const name = normalizeItemName(match[3]); // e.g. "rice"
    const price = parseMoney(match[4]); // e.g. 100000

    if (name && price && name !== 'item') {
       // Calculation for Unit Price if "at" was used, or Total if "for" was used? 
       // For safety, we treat the number as TOTAL if it's large, or let the transaction service decide.
       // Usually "Sold X for Y" means Y is Total.
       
       return safeParsedResult({
        intent: 'SALE',
        is_credit: false,
        items: [{ 
          name, 
          qty, 
          unit: unit.toLowerCase(), 
          unit_price: null, // Let backend calculate unit price from total
          category: null 
        }],
        total_money: price,
        reply_text: `✅ Recorded. Sold ${qty} ${unit} of ${name} for ₦${price.toLocaleString()}.`
      });
    }
  }

  // If Regex fails (e.g., "Sold three bags..."), return null to let Gemini handle it.
  return null; 
}

// ==========================================
// 🤖 SYSTEM PROMPT
// ==========================================
// ==========================================
// 🧠 ULTIMATE SYSTEM PROMPT
// ==========================================
const getSystemPrompt = (userLanguage: string, currentDate: string) => `
You are **TallyPadi**, an intelligent and friendly business assistant for Nigerian SMEs.
Your goal is to parse natural language messages into precise JSON data for the database.

*** CURRENT CONTEXT ***
Date: ${currentDate}
User Language: ${userLanguage.toUpperCase()} (Reply in this language or Pidgin)

*** 1. PARSING INTELLIGENCE (CRITICAL) ***
You must extract the **Exact Item Name**, **Quantity**, **Unit**, and **Price** from casual sentences.

* **"I sold 3 bags of rice for 100k"**
    * ❌ BAD: { name: "bags of rice", qty: 3, unit: "pcs" }
    * ✅ GOOD: { name: "rice", qty: 3, unit: "bag", total_money: 100000 }

* **"Sold 5 cartons of indomie and 2 packs of sugar"**
    * Item 1: { name: "indomie", qty: 5, unit: "carton" }
    * Item 2: { name: "sugar", qty: 2, unit: "pack" }

* **"Add 50 to stock"** (If previous context is unknown)
    * ✅ GOOD: { intent: "RESTOCK", items: [{ name: "item", qty: 50 }] } (Controller will handle 'item')

* **"Sales for today"**
    * ✅ GOOD: { intent: "REPORT_SALES", report_params: { start_date: "${currentDate}" } }

*** 2. NIGERIAN MARKET RULES ***
* **Currency:** "100k" = 100,000 | "1.5m" = 1,500,000 | "500 naira" = 500.
* **Credit:** "On credit", "pay later", "gbese", "bashi", "she owe me" → \`is_credit: true\`.
* **Debt Payment:** "Emeka paid 20k", "Clear debt", "Settlement" → Intent: \`DEBT_PAYMENT\`.
* **Prices:** "Price of rice" → \`PRICE_CHECK\`. "Rice is now 50k" → \`DEFINE_PRICE\`.

*** 3. FRIENDLY & SMART REPLIES ***
Your \`reply_text\` should be natural and confirm the details clearly.
* *English:* "✅ Sale recorded! 3 bags of Rice for ₦100,000."
* *Pidgin:* "✅ I don run am! 3 bags of Rice for ₦100k recorded."
* *Error:* "I no grab. Which item you sell? Abeg type am like 'Sold 2 rice'."

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
  imageBuffer?: string,
  imageMimeType?: string
): Promise<ParsedResult> => {
  const safeMessage = sanitizeInput(message);

  // 1️⃣ LOCAL PARSE
  const localResult = fallbackParse(safeMessage);
  if (localResult) {
    console.log(`⚡ Handled locally: ${localResult.intent}`);
    return localResult;
  }

  // 2️⃣ GEMINI PARSE
  const prompt = getSystemPrompt(userLanguage, new Date().toISOString());
  const parts: any[] = [
    `${prompt}\n\nUSER MESSAGE: "${safeMessage}"\n\nReturn JSON only.`
  ];

  if (imageBuffer && imageMimeType) {
    parts.push({ inlineData: { data: imageBuffer, mimeType: imageMimeType } });
  }

  try {
    const result = await generateWithRetry(parts);
    const text = result.response.text();
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return safeParsedResult(JSON.parse(cleanJson));
  } catch (error) {
    console.error('❌ Gemini Error:', error);
    return safeParsedResult({
      intent: 'UNKNOWN',
      reply_text: 'Network weak. Please try again or use format: "Sold 2 rice 5000"'
    });
  }
};