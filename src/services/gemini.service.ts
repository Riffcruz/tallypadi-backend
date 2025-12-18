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

// ✅ NEW: Helper to normalize names (handles "Cements" vs "Cement")
const normalizeItemName = (name: string): string => {
  if (!name) return 'unknown_item';
  let n = sanitizeInput(name).toLowerCase();
  
  // Remove common filler words
  n = n.replace(/\b(bags?|pcs?|cartons?|packs?|of)\b/g, '').trim();

  // Basic Singularization
  if (n.length > 3 && n.endsWith('s') && !n.endsWith('ss')) {
    n = n.slice(0, -1);
  }
  return n || 'item';
};

const sanitizeInput = (input: string): string => {
  if (!input) return '';
  let s = input.slice(0, SAFE_MAX);

  // Remove control chars
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');

  // Remove bidi/invisible
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ');

  // HTML entities
  s = s.replace(/<\/?[^>]+>/g, ' ');

  // ✅ Unicode-safe allow letters/numbers across languages + currency symbols
  s = s.replace(/[^\p{L}\p{N}\s₦$€£₵.,\-\/+()%@'_km]/gu, ' ');

  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

const allowedIntents: ParsedIntent[] = [
  'SALE', 'RESTOCK', 'SET_STOCK', 'DELETED_STOCK', 'DEFINE_PRICE',
  'PRICE_CHECK', 'REPORT_SALES', 'REPORT_DEBTS', 'REPORT_STOCK',
  'REPORT_FULL', 'CLOSE_BOOK', 'SETTINGS', 'CHANGE_LANGUAGE',
  'DEBT_PAYMENT', 'ADD_STAFF', 'DOWNLOAD_REPORT', 'UNDO_LAST_SALE',
  'REPORT_RECENT', 
  'HELP',          
  'UNKNOWN',
];

function safeParsedResult(p: any): ParsedResult {
  const intent: ParsedIntent = allowedIntents.includes(p?.intent) ? p.intent : 'UNKNOWN';

  const items = Array.isArray(p?.items) ? p.items : [];
  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: any) => {
    let price = it?.unit_price;
    
    // SAFETY: Handle "5k" string from AI
    if (typeof price === 'string') {
        const lowerPrice = price.toLowerCase();
        const multiplier = lowerPrice.includes('k') ? 1000 : lowerPrice.includes('m') ? 1000000 : 1;
        const num = parseFloat(lowerPrice.replace(/[^\d.]/g, ''));
        if (!isNaN(num)) price = num * multiplier;
    }

    const cleanName = typeof it?.name === 'string' ? normalizeItemName(it.name) : 'unknown_item';

    return {
      name: cleanName,
      // SAFETY: If intent is DEFINE_PRICE, force QTY to 0 to prevent stock deduction
      qty: intent === 'DEFINE_PRICE' ? 0 : (Number(it?.qty) > 0 ? Number(it.qty) : 0),
      unit_price: typeof price === 'number' && !isNaN(price) && price >= 0 ? price : null,
      unit: typeof it?.unit === 'string' ? sanitizeInput(it.unit).toLowerCase() : '',
    };
  });

  // Generate a fallback reply if AI didn't provide a good one
  let fallbackReply = 'Noted.';
  if (normalizedItems.length > 0) {
    const i = normalizedItems[0];
    if (intent === 'SALE') fallbackReply = `Noted. ${i.qty} ${i.name} recorded.`;
    if (intent === 'RESTOCK') fallbackReply = `Done. Added ${i.qty} ${i.name} to stock.`;
    if (intent === 'DEFINE_PRICE') fallbackReply = `Price updated for ${i.name}.`;
    if (intent === 'DELETED_STOCK') fallbackReply = `Deleted ${i.name} from stock.`;
  }

  return {
    intent,
    is_credit: Boolean(p?.is_credit),
    customer_name: typeof p?.customer_name === 'string' ? sanitizeInput(p.customer_name) : undefined,
    staffPhoneNumber: typeof p?.staffPhoneNumber === 'string' ? sanitizeInput(p.staffPhoneNumber) : undefined,
    items: normalizedItems,
    total_money: p?.total_money == null || Number(p.total_money) < 0 ? null : Number(p.total_money),
    report_params: {
      start_date: typeof p?.report_params?.start_date === 'string' ? p.report_params.start_date : null,
      end_date: typeof p?.report_params?.end_date === 'string' ? p.report_params.end_date : null,
    },
    settings_update: {
      key: p?.settings_update?.key && ['closingTime', 'dailySummary', 'language'].includes(p.settings_update.key) ? p.settings_update.key : null,
      value: p?.settings_update?.value ?? null,
    },
    // Use AI reply if reasonable length, else smart fallback
    reply_text: typeof p?.reply_text === 'string' && p.reply_text.length > 5 ? p.reply_text.trim() : fallbackReply,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function geminiWithRetry(parts: any[]) {
  try {
    return await withTimeout(model.generateContent(parts), 25000);
  } catch (e: any) {
    const msg = String(e?.message || '');
    const status = e?.status;
    if (status === 429 || msg.includes('429')) throw e;

    const transient =
      msg.includes('timeout') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ENOTFOUND') ||
      (status >= 500 && status < 600);

    if (!transient) throw e;
    return await withTimeout(model.generateContent(parts), 25000);
  }
}

// ✅ Undo detection (Your original logic)
function looksLikeUndo(message: string): boolean {
  const m = sanitizeInput(message).toLowerCase();
  const patterns: RegExp[] = [
    /\bundo\b/, /\bundoo+\b/, /\b(undo|cancel|reverse|revert|rollback|roll\s?back)\b/,
    /\b(delete|remove)\s+(the\s+)?last\b/, /\b(last|previous)\s+(sale|transaction|record)\b/,
    /\b(cancel|reverse|undo)\s+(the\s+)?last\s+(sale|transaction|record)\b/,
    /\b(abeg\s+)?reverse\b/, /\bcommot\s+last\b/, /\bno\s+count\s+that\s+one\b/,
    /\bpada\b/, /\bda\s+pada\b/, /\bfi\s+se\s+yin\b/,
    /\bsoke\b/, /\bsoke\s+na\s+karshe\b/,
    /\bweghachi\b/, /\bkpochapu\b/,
  ];
  return patterns.some((re) => re.test(m));
}

function looksLikeDebtRequest(message: string): boolean {
  const m = sanitizeInput(message).toLowerCase();
  if (m.includes('dey owe') || m.includes('who dey owe') || m.includes('who is owing') || m.includes('who owes')) return true;
  return /\b(debt|debts|debtor|debtors|owing|owes|gbese|bashi|ugwo)\b/.test(m);
}

// ✅ ENHANCED FALLBACK: Includes your original logic + MY MATH FIXES
function fallbackParse(message: string): ParsedResult | null {
  const m = sanitizeInput(message).toLowerCase();

  // 1. Check HELP
  if (['help', 'menu', 'commands', 'options', 'how to use'].includes(m)) {
    return safeParsedResult({ intent: 'HELP' });
  }

  // 2. Check Undo
  if (looksLikeUndo(m)) {
    return safeParsedResult({ intent: 'UNDO_LAST_SALE', reply_text: 'Okay ✅ I will undo your last sale.' });
  }

  // 3. Check Debt List
  if (looksLikeDebtRequest(m)) {
    return safeParsedResult({ intent: 'REPORT_DEBTS', reply_text: '📌 Debt summary' });
  }

  // ✅ 4. MATH FIX: Price Update Check (Must come before sales check!)
  // "Rice is 5k" or "Price of beans 2000"
  const priceRegex = /(?:price\s+of\s+|set\s+price\s+for\s+|update\s+)?([a-z0-9\s]+?)\s+(?:is|to|now|at)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?(?:k|m)?)\s*(?:naira)?/i;
  const priceMatch = m.match(priceRegex);
  
  if (priceMatch && !m.includes('sold') && !m.includes('sell') && !m.includes('buy')) {
    const itemName = normalizeItemName(priceMatch[1]);
    const rawPrice = priceMatch[2].replace(/[^\d.km]/g, '');
    let price = parseFloat(rawPrice);
    if (rawPrice.includes('k')) price *= 1000;
    if (rawPrice.includes('m')) price *= 1000000;

    if (!isNaN(price)) {
      return safeParsedResult({
        intent: 'DEFINE_PRICE',
        items: [{ name: itemName, qty: 0, unit_price: price, unit: '' }],
        reply_text: `Updated price of ${itemName} to ${price}.`
      });
    }
  }

  // ✅ 5. DELETE ITEM Fix
  const deleteRegex = /\b(delete|remove|clear)\s+([a-z0-9\s]+)/i;
  const deleteMatch = m.match(deleteRegex);
  if (deleteMatch && !m.includes('sale') && !m.includes('sold')) {
      const itemName = normalizeItemName(deleteMatch[2]);
      return safeParsedResult({
          intent: 'DELETED_STOCK',
          items: [{ name: itemName, qty: 0, unit_price: null, unit: '' }],
          reply_text: `Deleting ${itemName}.`
      });
  }

  // 6. Original Sales Logic (Restored)
  const isCredit = m.includes('credit') || m.includes('owe') || m.includes('later') || m.includes('pay small small');
  let customerName = 'Customer';
  const toMatch = m.match(/\bto\s+([a-z0-9]+)\b/i);
  if (toMatch) customerName = toMatch[1];

  // sold 2 rice for 50k / ₦5000 / 5000
  const sold = m.match(/\b(sold|sell|comot)\s+(\d+)\s+(.+?)(?:\s+(?:for|@|at)\s+([₦$€£₵]?\s*\d+(?:k)?))?\b/i);
  if (sold) {
    const qty = Number(sold[2]);
    const name = normalizeItemName(sold[3].replace(/\b(on|credit|to|for)\b.*/, '').trim()); 
    const moneyRaw = (sold[4] || '').replace(/\s+/g, '');
    let total: number | null = null;

    if (moneyRaw) {
      const num = Number(moneyRaw.replace(/[^\d]/g, ''));
      total = moneyRaw.toLowerCase().includes('k') ? num * 1000 : num;
    }

    return safeParsedResult({
      intent: 'SALE',
      is_credit: isCredit,
      customer_name: isCredit ? customerName : null,
      items: [{ name, qty, unit_price: null, unit: '' }],
      total_money: total,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: isCredit ? `✅ Recorded as credit sale to ${customerName}.` : `✅ Recorded. Sold ${qty} ${name}.`,
    });
  }

  // 7. Original Add/Restock Logic (Restored)
  const add = m.match(/\b(add|restock)\s+(\d+)\s+(.+)\b/i);
  if (add) {
    const name = normalizeItemName(add[3].trim());
    return safeParsedResult({
      intent: 'RESTOCK',
      is_credit: false,
      items: [{ name, qty: Number(add[2]), unit_price: null, unit: '' }],
      total_money: null,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: `✅ Stock updated. Added ${Number(add[2])} ${name}.`,
    });
  }

  return null;
}

const getSystemPrompt = (userLanguage: string, currentDate: string) => `
You are "Tallypadi", a smart Nigerian Business Assistant.
Your goal is to extract business data from natural language (and images).

Current Date & Time: ${currentDate}

STRICT LANGUAGE:
User language is ${userLanguage}. Reply ONLY in ${userLanguage}.

🚨 CRITICAL RULES FOR NUMBERS & MONEY:
1. **"5k" ALWAYS means 5000**. "1m" ALWAYS means 1,000,000.
2. If user mentions "naira", "$", or a large number (e.g., 5000), it is a **PRICE**, NOT a quantity.
3. NEVER assume a large number like 5000 is a quantity.
4. **Name Normalization**: Always convert plural items to SINGULAR (e.g., "Cements" -> "cement").

INTENTS:
- SALE: "Sold 5 rice", "Comot 2", "I sold on credit to Emeka"
- RESTOCK: "Add 5", "Restock 10"
- SET_STOCK: "Set rice to 50", "Rice is now 20"
- DEFINE_PRICE: "Rice is 20k", "Set price of rice 5000" (qty must be 0)
- DELETED_STOCK: "Delete rice" (qty must be 0)
- PRICE_CHECK: "Price of rice?"
- REPORT_SALES, REPORT_STOCK, REPORT_FULL
- DEBT_PAYMENT: "Emeka paid 20k" (customer_name required if present)
- ADD_STAFF: "Add 080... as staff"
- DOWNLOAD_REPORT: "Send pdf"
- CLOSE_BOOK: "Close the book"
- UNDO_LAST_SALE: "Undo last sale", "reverse last one"
- REPORT_RECENT: "last 5 sales", "recent transactions"
- HELP: "help", "how to use"
- UNKNOWN: If input is noise or unrelated.

- REPORT_DEBTS: "debt", "debts", "debt summary", "debtors", "who owes me"

Return ONLY JSON.

<schema>
{
  "intent": "SALE|RESTOCK|SET_STOCK|DELETED_STOCK|DEFINE_PRICE|PRICE_CHECK|REPORT_SALES|REPORT_STOCK|REPORT_DEBTS|REPORT_FULL|CLOSE_BOOK|SETTINGS|CHANGE_LANGUAGE|DEBT_PAYMENT|ADD_STAFF|DOWNLOAD_REPORT|UNDO_LAST_SALE|REPORT_RECENT|HELP|UNKNOWN",
  "is_credit": boolean,
  "customer_name": "string | null",
  "staffPhoneNumber": "string | null",
  "items": [
    { "name": "string (singular)", "qty": number, "unit": "string", "unit_price": number | null }
  ],
  "total_money": number | null,
  "report_params": { "start_date": "ISOString" | null, "end_date": "ISOString" | null },
  "settings_update": { "key": "closingTime" | "dailySummary" | "language" | null, "value": "string|boolean|null" },
  "reply_text": "string (Natural confirmation)"
}
</schema>
`;

export const parseMessageWithGemini = async (
  message: string,
  userLanguage: string = 'English',
  imageBuffer?: string,
  imageMimeType?: string
): Promise<ParsedResult> => {
  const safeMessage = sanitizeInput(message);
  const isoDate = new Date().toISOString();

  // ✅ Ultra-fast local detect first (Includes NEW Math Logic)
  const fb = fallbackParse(safeMessage);
  
  // Respect explicit matches from fallback first
  if (fb) return fb;

  const systemInstruction = getSystemPrompt(userLanguage, isoDate);

  const parts: any[] = [
    `${systemInstruction}\n\n<user_message>${JSON.stringify({ text: safeMessage })}</user_message>\nReturn ONLY a single JSON object.`,
  ];

  if (imageBuffer && imageMimeType) {
    parts.push({ inlineData: { data: imageBuffer, mimeType: imageMimeType } });
  }

  try {
    const result = await geminiWithRetry(parts);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return safeParsedResult(parsed);
  } catch (err: any) {
    // ✅ fallback parser retry
    const fbRetry = fallbackParse(safeMessage);
    if (fbRetry) return fbRetry;

    if (err?.status === 429 || String(err?.message || '').includes('429')) {
      return {
        intent: 'UNKNOWN',
        is_credit: false, items: [], total_money: null,
        report_params: { start_date: null, end_date: null },
        settings_update: { key: null, value: null },
        reply_text: 'Too many requests right now. Abeg wait small and try again.',
      };
    }

    console.error('❌ Gemini Parse Error:', err);
    return {
      intent: 'UNKNOWN',
      is_credit: false,
      items: [],
      total_money: null,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: 'Network fluctuate small. Abeg type that again.',
    };
  }
};