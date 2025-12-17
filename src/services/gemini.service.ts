import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

const genAI = new GoogleGenerativeAI(env.geminiApiKey);

// Try JSON mode; if unsupported, your cleaning+JSON.parse still works.
const model = genAI.getGenerativeModel({
  model: env.geminiModel,
  generationConfig: { responseMimeType: "application/json" as any }
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
  if (!input) return "";
  let s = input.slice(0, SAFE_MAX);

  // Remove control chars
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ");

  // Remove bidi/invisible
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, " ");

  // HTML entities
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Strip tags
  s = s.replace(/<\/?[^>]+>/g, " ");

  // Block obvious prompt injection keywords (light)
  s = s.replace(/\b(ignore|disregard|bypass|override|system prompt|instructions)\b/gi, " ");

  // ✅ Unicode-safe allow letters/numbers across languages
  s = s.replace(/[^\p{L}\p{N}\s₦$€£₵.,\-\/+()%@'_]/gu, " ");

  s = s.replace(/\s+/g, " ").trim();
  return s;
};

const allowedIntents: ParsedIntent[] = [
  "SALE","RESTOCK","SET_STOCK","DELETED_STOCK","DEFINE_PRICE","PRICE_CHECK",
  "REPORT_SALES","REPORT_DEBTS","REPORT_STOCK","REPORT_FULL","CLOSE_BOOK","SETTINGS",
  "CHANGE_LANGUAGE","DEBT_PAYMENT","ADD_STAFF","DOWNLOAD_REPORT","UNDO_LAST_SALE","UNKNOWN"
];

function safeParsedResult(p: any): ParsedResult {
  const intent: ParsedIntent = allowedIntents.includes(p?.intent) ? p.intent : "UNKNOWN";

  const items = Array.isArray(p?.items) ? p.items : [];
  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: any) => ({
    name: typeof it?.name === "string" ? sanitizeInput(it.name).toLowerCase() : "unknown_item",
    qty: Number(it?.qty) > 0 ? Number(it.qty) : 0,
    unit_price: it?.unit_price == null ? null : (Number(it.unit_price) >= 0 ? Number(it.unit_price) : null),
    unit: typeof it?.unit === "string" ? sanitizeInput(it.unit).toLowerCase() : ""
  }));

  return {
    intent,
    is_credit: Boolean(p?.is_credit),
    customer_name: typeof p?.customer_name === "string" ? sanitizeInput(p.customer_name) : undefined,
    staffPhoneNumber: typeof p?.staffPhoneNumber === "string" ? sanitizeInput(p.staffPhoneNumber) : undefined,
    items: normalizedItems,
    total_money: (p?.total_money == null || Number(p.total_money) < 0) ? null : Number(p.total_money),
    report_params: {
      start_date: typeof p?.report_params?.start_date === "string" ? p.report_params.start_date : null,
      end_date: typeof p?.report_params?.end_date === "string" ? p.report_params.end_date : null,
    },
    settings_update: {
      key: (p?.settings_update?.key === "closingTime" || p?.settings_update?.key === "dailySummary" || p?.settings_update?.key === "language")
        ? p.settings_update.key
        : null,
      value: p?.settings_update?.value ?? null,
    },
    reply_text: typeof p?.reply_text === "string" && p.reply_text.trim() ? p.reply_text.trim() : "Noted."
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Gemini timeout after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function geminiWithRetry(parts: any[]) {
  try {
    return await withTimeout(model.generateContent(parts), 25000);
  } catch (e: any) {
    const msg = String(e?.message || "");
    const status = e?.status;

    // no retry on rate limit
    if (status === 429 || msg.includes("429")) throw e;

    const transient =
      msg.includes("timeout") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ENOTFOUND") ||
      (status >= 500 && status < 600);

    if (!transient) throw e;

    // retry once
    return await withTimeout(model.generateContent(parts), 25000);
  }
}

// ✅ Undo detection (works even if misspelled / slang / different language)
function looksLikeUndo(message: string): boolean {
  const m = sanitizeInput(message).toLowerCase();

  // common phrases + misspellings
  const patterns: RegExp[] = [
    /\bundo\b/,
    /\bundoo+\b/,
    /\b(undo|cancel|reverse|revert|rollback|roll\s?back)\b/,
    /\b(delete|remove)\s+(the\s+)?last\b/,
    /\b(last|previous)\s+(sale|transaction|record)\b/,
    /\b(cancel|reverse|undo)\s+(the\s+)?last\s+(sale|transaction|record)\b/,

    // pidgin-ish
    /\b(abeg\s+)?reverse\b/,
    /\bcommot\s+last\b/,
    /\bno\s+count\s+that\s+one\b/,

    // Yoruba hints
    /\bpada\b/,
    /\bda\s+pada\b/,
    /\bfi\s+se\s+yin\b/,

    // Hausa hints
    /\bsoke\b/,
    /\bsoke\s+na\s+karshe\b/,

    // Igbo hints
    /\bweghachi\b/,
    /\bkpochapu\b/,
  ];

  return patterns.some((re) => re.test(m));
}

// Simple fallback so “sold/add/undo” still works when Gemini fails
function fallbackParse(message: string): ParsedResult | null {
  const m = sanitizeInput(message).toLowerCase();

  // ✅ undo
  if (looksLikeUndo(m)) {
    return safeParsedResult({
      intent: "UNDO_LAST_SALE",
      is_credit: false,
      items: [],
      total_money: null,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: "Okay ✅ I will undo your last sale."
    });
  }

  if (/\b(debt|debts|debtor|debtors|owing|owes|gbese|bashi|ugwo)\b/.test(m) || m.includes('dey owe')) {
  return safeParsedResult({
    intent: "REPORT_DEBTS",
    is_credit: false,
    items: [],
    total_money: null,
    report_params: { start_date: null, end_date: null },
    settings_update: { key: null, value: null },
    reply_text: "📌 Debt summary"
  });
}


  // sold 2 rice for 50k / ₦5000 / 5000
  const sold = m.match(/\b(sold|sell|comot)\s+(\d+)\s+(.+?)(?:\s+(?:for|@|at)\s+([₦$€£₵]?\s*\d+(?:k)?))?\b/i);
  if (sold) {
    const qty = Number(sold[2]);
    const name = sold[3].trim();
    const moneyRaw = (sold[4] || "").replace(/\s+/g, "");
    let total: number | null = null;

    if (moneyRaw) {
      const num = Number(moneyRaw.replace(/[^\d]/g, ""));
      total = moneyRaw.toLowerCase().includes("k") ? num * 1000 : num;
    }

    return safeParsedResult({
      intent: "SALE",
      is_credit: false,
      items: [{ name, qty, unit_price: null, unit: "" }],
      total_money: total,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: "✅ Recorded."
    });
  }

  // add 10 indomie
  const add = m.match(/\b(add|restock)\s+(\d+)\s+(.+)\b/i);
  if (add) {
    return safeParsedResult({
      intent: "RESTOCK",
      is_credit: false,
      items: [{ name: add[3].trim(), qty: Number(add[2]), unit_price: null, unit: "" }],
      total_money: null,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: "✅ Stock updated."
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

INTENTS:
- SALE: "Sold 5 rice", "Comot 2", "I sold on credit to Emeka"
- RESTOCK: "Add 5", "Restock 10"
- SET_STOCK: "Set rice to 50", "Rice is now 20"
- DEFINE_PRICE: "Rice is 20k"
- DELETED_STOCK: "Delete rice"
- PRICE_CHECK: "Price of rice?"
- REPORT_SALES, REPORT_STOCK, REPORT_FULL
- DEBT_PAYMENT: "Emeka paid 20k" (customer_name required if present)
- ADD_STAFF: "Add 080... as staff"
- DOWNLOAD_REPORT: "Send pdf"
- CLOSE_BOOK: "Close the book"

- REPORT_DEBTS: user wants list of people owing and balances.
  Examples (any language/spelling):
  "debt", "debts", "debt summary", "debtors", "who owes me", "who dey owe", "who dey owe me money",
  "gbese" (Yoruba), "bashi" (Hausa), "ugwo" (Igbo), "aboki dey owe", "list debtors"


✅ UNDO_LAST_SALE:
User wants to reverse the last recorded sale/transaction.
Examples (any language / spelling):
- "undo", "undo last", "undo last sale", "reverse last sale", "cancel that last one"
- "abeg reverse am", "no count that one", "commot last sale"
- "pada", "da pada" (Yoruba)
- "soke na karshe" (Hausa)
- "weghachi" (Igbo)
If the user message means undo/reverse/cancel the last sale, set intent = "UNDO_LAST_SALE".

Return ONLY JSON.

<schema>
{
  "intent": "SALE" | "RESTOCK" | "SET_STOCK" | "DELETED_STOCK" | "DEFINE_PRICE" | "PRICE_CHECK" | "REPORT_SALES" | "REPORT_STOCK" | "REPORT_DEBTS" | "REPORT_FULL" | "CLOSE_BOOK" | "SETTINGS" | "CHANGE_LANGUAGE" | "DEBT_PAYMENT" | "ADD_STAFF" | "DOWNLOAD_REPORT" | "UNDO_LAST_SALE" | "UNKNOWN",
  "is_credit": boolean,
  "customer_name": "string | null",
  "staffPhoneNumber": "string | null",
  "items": [
    { "name": "string", "qty": number, "unit": "string", "unit_price": number | null }
  ],
  "total_money": number | null,
  "report_params": { "start_date": "ISOString" | null, "end_date": "ISOString" | null },
  "settings_update": { "key": "closingTime" | "dailySummary" | "language" | null, "value": "string|boolean|null" },
  "reply_text": "string"
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

  // ✅ Ultra-fast local detect first (so misspellings still work even before Gemini)
  if (looksLikeUndo(safeMessage)) {
    return safeParsedResult({
      intent: "UNDO_LAST_SALE",
      is_credit: false,
      items: [],
      total_money: null,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: "Okay ✅ I will undo your last sale."
    });
  }

  const systemInstruction = getSystemPrompt(userLanguage, isoDate);

  const parts: any[] = [
    `${systemInstruction}\n\n<user_message>${JSON.stringify({ text: safeMessage })}</user_message>\nReturn ONLY a single JSON object.`
  ];

  if (imageBuffer && imageMimeType) {
    parts.push({
      inlineData: { data: imageBuffer, mimeType: imageMimeType }
    });
  }

  try {
    const result = await geminiWithRetry(parts);
    const text = result.response.text().trim();

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return safeParsedResult(parsed);
  } catch (err: any) {
    // ✅ fallback parser (prevents lost sales/undo when Gemini fails)
    const fb = fallbackParse(safeMessage);
    if (fb) return fb;

    if (err?.status === 429 || String(err?.message || "").includes('429')) {
      return {
        intent: 'UNKNOWN',
        is_credit: false,
        items: [],
        total_money: null,
        report_params: { start_date: null, end_date: null },
        settings_update: { key: null, value: null },
        reply_text: "Too many requests right now. Abeg wait small and try again."
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
      reply_text: "Network fluctuate small. Abeg type that again."
    };
  }
};
