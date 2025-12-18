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

/** ✅ sanitize input: removes weird/invisible characters + dangerous stuff */
const sanitizeInput = (input: string): string => {
  if (!input) return '';
  let s = input.slice(0, SAFE_MAX);

  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ');
  s = s.replace(/<\/?[^>]+>/g, ' ');

  // Unicode-safe allow letters/numbers across languages + currency symbols
  s = s.replace(/[^\p{L}\p{N}\s₦$€£₵.,\-\/+()%@'_]/gu, ' ');

  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

/** ✅ parse "20k", "₦20,000", "1m" -> number */
const parseMoney = (raw: any): number | null => {
  if (raw == null) return null;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }

  const s = String(raw).toLowerCase().replace(/\s+/g, '');

  const mult = s.includes('m') ? 1_000_000 : s.includes('k') ? 1_000 : 1;
  const num = parseFloat(s.replace(/[^\d.]/g, ''));

  if (Number.isNaN(num)) return null;

  const v = num * mult;
  return Number.isFinite(v) && v >= 0 ? v : null;
};

/** ✅ normalize product name (handle plural, remove filler/units) */
const normalizeItemName = (name: string): string => {
  if (!name) return 'unknown_item';
  let n = sanitizeInput(name).toLowerCase();

  // remove filler/units words
  n = n.replace(/\b(bags?|pcs?|pieces?|cartons?|packs?|sachets?|rolls?|bottles?|liters?|litres?|ltrs?|ltr|kg|kgs|g|grams?|of|the|a|an)\b/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();

  // safer plural rules
  if (n.endsWith('ies') && n.length > 4) n = n.slice(0, -3) + 'y';
  else if (/(xes|ses|zes|ches|shes)$/.test(n) && n.length > 4) n = n.slice(0, -2);
  else if (n.endsWith('s') && n.length > 3 && !n.endsWith('ss')) {
    const noTouch = new Set(['gas', 'rice', 'beans']); // customize
    if (!noTouch.has(n)) n = n.slice(0, -1);
  }

  return n || 'item';
};

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

  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: any) => {
    const cleanName = typeof it?.name === 'string' ? normalizeItemName(it.name) : 'unknown_item';

    const unit = typeof it?.unit === 'string' ? sanitizeInput(it.unit).toLowerCase() : '';

    // ✅ parse unit_price robustly
    const unitPrice = parseMoney(it?.unit_price);

    return {
      name: cleanName,
      // ✅ if DEFINE_PRICE or PRICE_CHECK -> qty must be 0
      qty:
        intent === 'DEFINE_PRICE' || intent === 'PRICE_CHECK'
          ? 0
          : Number(it?.qty) > 0
            ? Number(it.qty)
            : 0,
      unit_price: unitPrice,
      unit,
    };
  });

  // ✅ parse total_money robustly (THIS FIXES "20k" problems)
  const totalMoney = parseMoney(p?.total_money);

  // fallback reply
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

// ✅ Undo detection
function looksLikeUndo(message: string): boolean {
  const m = sanitizeInput(message).toLowerCase();
  const patterns: RegExp[] = [
    /\bundo\b/,
    /\bundoo+\b/,
    /\b(undo|cancel|reverse|revert|rollback|roll\s?back)\b/,
    /\b(delete|remove)\s+(the\s+)?last\b/,
    /\b(last|previous)\s+(sale|transaction|record)\b/,
    /\b(cancel|reverse|undo)\s+(the\s+)?last\s+(sale|transaction|record)\b/,
    /\b(abeg\s+)?reverse\b/,
    /\bcommot\s+last\b/,
    /\bno\s+count\s+that\s+one\b/,
    /\bpada\b/,
    /\bda\s+pada\b/,
    /\bweghachi\b/,
    /\bkpochapu\b/,
  ];
  return patterns.some((re) => re.test(m));
}

function looksLikeDebtRequest(message: string): boolean {
  const m = sanitizeInput(message).toLowerCase();

  // ✅ include "credit/credits" keyword
  if (m === 'credit' || m === 'credits' || m.includes('all credits') || m.includes('credit list')) return true;

  if (m.includes('dey owe') || m.includes('who dey owe') || m.includes('who is owing') || m.includes('who owes')) return true;
  return /\b(debt|debts|debtor|debtors|owing|owes|gbese|bashi|ugwo|credit|credits)\b/.test(m);
}

/** Extract qty, optional unit, and item from something like "200 liters kerosene" */
function parseQtyUnitItem(s: string): { qty: number; unit: string; item: string } | null {
  const t = sanitizeInput(s).trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(liters?|litres?|ltrs?|ltr|l|kgs?|kg|bags?|pcs?|pieces?|cartons?|packs?|bottles?|rolls?|sachets?)?\s+(.+)$/i);
  if (!m) return null;

  const qty = Number(m[1]);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const unit = m[2] ? sanitizeInput(m[2]).toLowerCase() : '';
  const item = sanitizeInput(m[3]);

  return { qty, unit, item };
}

// ✅ fallback parser (strong for bad English/Pidgin)
function fallbackParse(message: string): ParsedResult | null {
  const mRaw = sanitizeInput(message);
  const m = mRaw.toLowerCase();

  // 1) HELP
  if (/\b(help|menu|commands|options|how to use|how far)\b/.test(m)) {
    return safeParsedResult({ intent: 'HELP', reply_text: 'Here are what I can do: Sale, Restock, Credits, Reports, Undo…' });
  }

  // 2) UNDO
  if (looksLikeUndo(m)) {
    return safeParsedResult({ intent: 'UNDO_LAST_SALE', reply_text: 'Okay ✅ I will undo your last sale.' });
  }

  // 3) DEBTS
  if (looksLikeDebtRequest(m)) {
    return safeParsedResult({ intent: 'REPORT_DEBTS', reply_text: '📌 Debtors List' });
  }

  // 4) DEBT PAYMENT: "Emeka paid 20000" / "john pay 20k"
  {
    const pay = mRaw.match(/\b([a-zA-Z][a-zA-Z0-9\s]{1,30}?)\s+(paid|pay|has\s+paid)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?\s*(?:k|m)?)\b/i);
    if (pay) {
      const customer = sanitizeInput(pay[1]).trim();
      const amt = parseMoney(pay[3]);
      if (customer && amt != null) {
        return safeParsedResult({
          intent: 'DEBT_PAYMENT',
          is_credit: false,
          customer_name: customer,
          total_money: amt,
          items: [],
          report_params: { start_date: null, end_date: null },
          settings_update: { key: null, value: null },
          reply_text: `✅ Payment recorded. ${customer} paid ₦${amt}.`,
        });
      }
    }
  }

  // 5) PRICE CHECK: "price of rice", "how much be beans"
  {
    const pc = mRaw.match(/\b(price\s+of|how\s+much\s+be|how\s+much\s+is)\s+(.+)\b/i);
    if (pc) {
      const itemName = normalizeItemName(pc[2]);
      return safeParsedResult({
        intent: 'PRICE_CHECK',
        items: [{ name: itemName, qty: 0, unit_price: null, unit: '' }],
        reply_text: `📌 Checking price for ${itemName}...`,
      });
    }
  }

  // 6) DEFINE PRICE (before sales): "rice is 5k", "set price of beans to 2000"
  {
    const priceRegex =
      /(?:price\s+of\s+|set\s+price\s+for\s+|update\s+price\s+for\s+|set\s+)?(.+?)\s+(?:is|to|now|at)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?(?:k|m)?)\b/i;
    const priceMatch = mRaw.match(priceRegex);

    if (priceMatch && !m.includes('sold') && !m.includes('sell') && !m.includes('comot') && !m.includes('add') && !m.includes('restock')) {
      const itemName = normalizeItemName(priceMatch[1]);
      const price = parseMoney(priceMatch[2]);
      if (price != null) {
        return safeParsedResult({
          intent: 'DEFINE_PRICE',
          items: [{ name: itemName, qty: 0, unit_price: price, unit: '' }],
          total_money: null,
          reply_text: `✅ Updated price of ${itemName} to ₦${price}.`,
        });
      }
    }
  }

  // 7) DELETE ITEM: "delete rice"
  {
    const del = mRaw.match(/\b(delete|remove|clear)\s+(.+)\b/i);
    if (del && !m.includes('sale') && !m.includes('sold')) {
      const itemName = normalizeItemName(del[2]);
      return safeParsedResult({
        intent: 'DELETED_STOCK',
        items: [{ name: itemName, qty: 0, unit_price: null, unit: '' }],
        reply_text: `✅ Deleted ${itemName} from stock.`,
      });
    }
  }

  // 8) REPORT RECENT: "last 5 sales"
  if (/\b(last|recent)\s+\d+\s+(sales|transactions)\b/.test(m) || m.includes('recent transactions')) {
    return safeParsedResult({ intent: 'REPORT_RECENT', reply_text: '📌 Recent transactions' });
  }

  // 9) SALE (robust): "Sold 200 liters kerosene to john for 20k on credit"
  {
    const saleVerb = mRaw.match(/\b(sold|sell|comot)\b/i);
    if (saleVerb) {
      let rest = mRaw.replace(/\b(sold|sell|comot)\b/i, '').trim();

      const isCredit =
        /\b(on\s+credit|credit|owe|owing|later|pay\s+small\s+small)\b/i.test(rest);

      // money: for|@|at
      let totalMoney: number | null = null;
      const moneyMatch = rest.match(/\b(for|@|at)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?\s*(?:k|m)?)\b/i);
      if (moneyMatch) {
        totalMoney = parseMoney(moneyMatch[2]);
        rest = rest.replace(moneyMatch[0], '').trim();
      }

      // customer: to NAME (after removing money)
      let customer: string | null = null;
      const custMatch = rest.match(/\bto\s+([a-zA-Z][a-zA-Z0-9\s]{0,30})\b/i);
      if (custMatch) {
        customer = sanitizeInput(custMatch[1]).trim();
        rest = rest.replace(custMatch[0], '').trim();
      }

      // strip credit words
      rest = rest.replace(/\b(on\s+credit|credit|owe|owing|later)\b/gi, '').trim();

      const qui = parseQtyUnitItem(rest);
      if (qui) {
        const itemName = normalizeItemName(qui.item);

        return safeParsedResult({
          intent: 'SALE',
          is_credit: isCredit,
          customer_name: isCredit && customer ? customer : undefined,
          items: [{ name: itemName, qty: qui.qty, unit_price: null, unit: qui.unit }],
          total_money: totalMoney,
          report_params: { start_date: null, end_date: null },
          settings_update: { key: null, value: null },
          reply_text: isCredit
            ? `✅ Recorded as credit sale to ${customer || 'customer'}${totalMoney != null ? ` for ₦${totalMoney}` : ''}.`
            : `✅ Recorded. Sold ${qui.qty} ${itemName}${totalMoney != null ? ` for ₦${totalMoney}` : ''}.`,
        });
      }
    }
  }

  // 10) RESTOCK: "Add 10 cartons coke"
  {
    const add = mRaw.match(/\b(add|restock)\s+(.+)$/i);
    if (add) {
      const qui = parseQtyUnitItem(add[2]);
      if (qui) {
        const itemName = normalizeItemName(qui.item);
        return safeParsedResult({
          intent: 'RESTOCK',
          is_credit: false,
          items: [{ name: itemName, qty: qui.qty, unit_price: null, unit: qui.unit }],
          total_money: null,
          report_params: { start_date: null, end_date: null },
          settings_update: { key: null, value: null },
          reply_text: `✅ Stock updated. Added ${qui.qty} ${itemName}.`,
        });
      }
    }
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
1. "5k" ALWAYS means 5000. "1m" ALWAYS means 1,000,000.
2. If user says "for 20k" in a SALE, that is total_money (numeric), not string.
3. If user says "@ 200" or "at 200", that is unit_price (numeric). total_money can be null.
4. Name Normalization: convert plural to singular (e.g., "Cements" -> "cement").
5. If user says "Credits" or "Credit", intent is REPORT_DEBTS.

INTENTS (examples):
- SALE: "Sold 5 rice", "Comot 2 cement", "Sold 200 liters kerosene to John for 20k on credit"
- RESTOCK: "Add 5", "Restock 10 cartons coke"
- SET_STOCK: "Set rice to 50"
- DEFINE_PRICE: "Rice is 20k", "Set price of rice 5000" (qty must be 0)
- PRICE_CHECK: "Price of rice?", "How much be beans?"
- REPORT_DEBTS: "Credits", "Who owes me?", "Debt list"
- DEBT_PAYMENT: "Emeka paid 20000", "John pay 20k"
- UNDO_LAST_SALE: "Undo last sale", "reverse last one"
- REPORT_RECENT: "last 5 sales", "recent transactions"
- HELP: "help", "how to use"
- UNKNOWN: If input is noise or unrelated.

Return ONLY JSON. All money numbers must be real numbers (no "20k" strings).

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

  // ✅ fastest: local fallback first
  const fb = fallbackParse(safeMessage);
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

    // ✅ final safety normalize
    const safe = safeParsedResult(parsed);

    // ✅ if Gemini returns "20k" as string in total_money or unit_price, safeParsedResult parses it.
    return safe;
  } catch (err: any) {
    // ✅ fallback retry
    const fbRetry = fallbackParse(safeMessage);
    if (fbRetry) return fbRetry;

    if (err?.status === 429 || String(err?.message || '').includes('429')) {
      return {
        intent: 'UNKNOWN',
        is_credit: false,
        items: [],
        total_money: null,
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
