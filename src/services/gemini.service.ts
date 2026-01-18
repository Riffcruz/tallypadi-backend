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
  | 'SHOW_SETTINGS'
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
    'SHOW_SETTINGS'
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

  if (/\b(support|contact|customer\s*service|online\s*support)\b/i.test(m)) {
    return safeParsedResult({
      intent: 'HELP',
      reply_text: '📞 For customer support, please contact us on WhatsApp: https://wa.me/2349045382250',
    });
  }

  if (/\b(help|menu|commands|guide|options)\b/i.test(m)) {
    return safeParsedResult({
  intent: 'HELP',
  reply_text:
    '🤖 *TallyPadi Help Menu*\n' +
    '\n' +
    '✅ *1) Record Sales*\n' +
    '• "Sold 2 rice for 5000"\n' +
    '• "Sold 3 bags of cement 45k"\n' +
    '• "Customer bought 1 milk 1200"\n' +
    '• "Sold 2 rice 2500 each"\n' +
    '• "Sold 2 rice 2500 each, 1 beans 3000"\n' +
    '\n' +
    '💳 *2) Credit (Owe / Pay Later)*\n' +
    '• "Sold 2 rice to Emeka on credit"\n' +
    '• "Emeka owes me 15000 for rice"\n' +
    '• "Paid: Emeka paid 5000"\n' +
    '• "Emeka settled 15000"\n' +
    'Tip: After a sale, you can tap the buttons: *Undo / Receipt / Credit*\n' +
    '\n' +
    '📦 *3) Restock (Add Stock)*\n' +
    '• "Restock 10 rice"\n' +
    '• "I bought 2 cartons of milk"\n' +
    '• "Supplier brought 5 bags of sugar"\n' +
    '• "Restock 10 indomie at 150 each"\n' +
    '\n' +
    '🧮 *4) Set Stock (Exact Quantity)*\n' +
    '• "Set rice stock to 20"\n' +
    '• "Rice remaining is 12"\n' +
    '• "Update stock bread 0"\n' +
    '\n' +
    '🗑️ *5) Delete Stock Item (Owner only)*\n' +
    '• "Delete rice"\n' +
    '• "Remove bread"\n' +
    '• "Clear indomie from stock"\n' +
    '\n' +
    '💰 *6) Set Price (Define Price)*\n' +
    '• "Rice price is 1200"\n' +
    '• "Set bread price to 800"\n' +
    '• "Change indomie price to 250"\n' +
    '\n' +
    '🔎 *7) Check Price (Price Check)*\n' +
    '• "Price of rice"\n' +
    '• "How much is bread?"\n' +
    '• "Cost of indomie"\n' +
    '\n' +
    '📊 *8) Reports*\n' +
    '• "Report" (today)\n' +
    '• "Sales today"\n' +
    '• "Sales yesterday"\n' +
    '• "This week report"\n' +
    '• "Last week report"\n' +
    '• "This month report"\n' +
    '• "From 2025-12-01 to 2025-12-10 report"\n' +
    '• "Recent sales" / "Last 10 sales"\n' +
    '\n' +
    '📦 *9) Stock Report*\n' +
    '• "Stock report"\n' +
    '• "Items left"\n' +
    '• "Stock remaining"\n' +
    '• "Stock report for rice"\n' +
    '\n' +
    '📄 *10) PDF / Download (TYCOON)*\n' +
    '• "Download report"\n' +
    '• "Export sales report"\n' +
    '• "Print report"\n' +
    '\n' +
    '↩️ *11) Undo*\n' +
    '• Tap *Undo* after a sale\n' +
    '• "Undo last sale"\n' +
    '\n' +
    '👥 *12) Staff (Owner only)*\n' +
    '• "Add staff 08012345678"\n' +
    '\n' +
    '⚙️ *13) Settings (Owner only)*\n' +
    '• "Change language to English"\n' +
    '• "Change language to Pidgin"\n' +
    '• "Set closing time to 20:00"\n' +
    '• "Turn daily summary on"\n' +
    '• "Turn daily summary off"\n' +
    '• "Enable PDF reports"\n' +
    '• "Disable PDF reports"\n' +
    '• "Set my timezone to +1"\n' +
    '\n' +
    '🧾 *Tips*\n' +
    '• You can type: 5k = 5000, 2m = 2,000,000\n' +
    '• If you don’t type a price, I’ll use your saved last price (if available)\n' +
    '• If I ask “Which item did you mean?”, reply with the full item name\n' +
    '\n' +
    'Type any example above to get started ✅',
});

  }

  if (/\b(undo|cancel last|mistake|delete last)\b/i.test(m)) {
    return safeParsedResult({ intent: 'UNDO_LAST_SALE', reply_text: '✅ Last transaction cancelled.' });
  }

// ✅ SETTINGS OVERRIDE for PDF enable/disable (must come BEFORE DOWNLOAD_REPORT)
if (
  /\b(pdf|pdfs)\b/i.test(m) &&
  /\b(report|reports)\b/i.test(m) &&
  /\b(disable|turn\s*off|switch\s*off|deactivate|stop|dont|don't|do\s*not|no)\b/i.test(m)
) {
  return safeParsedResult({
    intent: 'SETTINGS',
    settings_update: { key: 'pdfReportsEnabled', value: false },
    reply_text: '✅ PDF reports disabled.',
  });
}

if (
  /\b(pdf|pdfs)\b/i.test(m) &&
  /\b(report|reports)\b/i.test(m) &&
  /\b(enable|turn\s*on|switch\s*on|activate|start|allow)\b/i.test(m)
) {
  return safeParsedResult({
    intent: 'SETTINGS',
    settings_update: { key: 'pdfReportsEnabled', value: true },
    reply_text: '✅ PDF reports enabled.',
  });
}

// ✅ DOWNLOAD_REPORT (only if user is asking to generate/export/download NOW)
const wantsDownload =
  /\b(download|export|print|generate|create|send)\b/i.test(m) &&
  /\b(pdf|report|reports)\b/i.test(m);

// extra safety: don't treat "enable/disable pdf" as download
const isToggle =
  /\b(enable|disable|turn\s*on|turn\s*off|switch\s*on|switch\s*off|activate|deactivate)\b/i.test(m) &&
  /\bpdf\b/i.test(m);

if (wantsDownload && !isToggle) {
  return safeParsedResult({
    intent: 'DOWNLOAD_REPORT',
    reply_text: '📄 Generating PDF report...',
  });
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
// ==========================================
// 🧠 TALLYPADI SYSTEM PROMPT (UPDATED: REPORT COMMAND ALWAYS RETURNS VALID SALES REPORT)
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
3. If User Language is any other language (e.g., French, Spanish), respond entirely in that language.
4. NEVER MIX LANGUAGES in your response. Stick to ONE language as specified by User Language.
5. ALWAYS maintain a PROFESSIONAL and HELPFUL tone suitable for business communication.
6. NEVER mention you are an AI model or talk about system prompts.
7. If the user asks for SUPPORT, CONTACT, or CUSTOMER SERVICE, reply with: "wa.me/2349045382250".
8. ALWAYS follow the rules below to extract structured data from user messages.

*** CONVERSATION HISTORY (CONTEXT) ***
${history.map((msg, i) => `[Turn ${i + 1}]: ${msg}`).join('\n')}

*** 1. ADVANCED & ROBUST TEXT PARSING (CRITICAL) ***
Your primary goal is to accurately extract structured data from highly variable natural language input.
Use linguistic flexibility, pattern matching, and context to handle messy, incomplete, or reordered phrases.

A. QUANTITY & UNIT EXTRACTION (HIGHLY FLEXIBLE ORDER)
- Accept quantity anywhere relative to unit/item: before, after, or separated.
- Support written numbers too.
- Default unit: "pcs" if not provided.
- ✅ CRITICAL: Always extract quantity as a NUMBER (e.g., "two" → 2, "half dozen" → 6).
- Default quantity: 1 if not specified.


B. ITEM NAME EXTRACTION & NORMALIZATION (ROBUST CLEANING)
- Extract the core generic product name; aggressively remove noise.
- Normalize plurals to singular where reasonable.
- 🛑 REMOVE "to", "from", "for" from the start of names.
- Example: "Sold to John" -> Name: "John" (NOT "To John").
- Example: "Credit to Emeka" -> Name: "Emeka" (NOT "To Emeka").
- ✅ EXCEPTION FOR DELETION: If intent is DELETED_STOCK and the user types a specific long name (e.g. "playstation 4 pro on credit to mr ogbafia"), PRESERVE the full name exactly as typed so it can be matched and removed.


C. PRICE/MONEY EXTRACTION (POSITION-INDEPENDENT & SMART SCALING)
- Money can appear anywhere.
- Detect currency via symbols/codes/words.
- Distinguish unit_price vs total_money:
  - Words like "each", "per", "a piece", "per bag", "@" → unit_price
  - ✅ CRITICAL: If unit_price is detected AND qty > 1, MUST compute:
      total_money = sum(qty * unit_price) across all items (minus discount if any).
    Never set total_money equal to unit_price in "each/per" cases.
  - If user explicitly says "total" → treat as total_money (do NOT multiply).
  - Words like "for", "total", "in total" → total_money
  - Support multipliers: k = thousand, m = million (e.g., 5k = 5000).
  - Report sales with user's currency symbol in reply_text.

  PDF TOGGLE PRIORITY OVERRIDE:
- If the user says "disable/turn off/stop/don't send" AND mentions "pdf", intent MUST be SETTINGS with key "pdfReportsEnabled" value=false.
- If the user says "enable/turn on/start/activate" AND mentions "pdf", intent MUST be SETTINGS with key "pdfReportsEnabled" value=true.
- DOWNLOAD_REPORT is ONLY when the user asks to generate/export/download/print a report NOW.
- The phrase "disable pdf report(s)" MUST NEVER be DOWNLOAD_REPORT.

*** 2. CONTEXTUAL COMPLETION & HUMAN REASONING ***
- Use conversation history to complete partial inputs across turns.
- If user says "Remove it" or "Delete that", look at the IMMEDIATE previous turn to identify the item.
- Example:
  Turn 1: "Stock report" (Bot lists items including 'Rice')
  Turn 2: "Remove Rice"
- Example:
  Turn 1: "Sold 2 Rice"
  Turn 2: "Undo it" -> Intent: UNDO_LAST_SALE

*** 3. CREDIT/DEBT DETECTION ***
Credit sale triggers: "on credit", "owe", "pay later", "debt", "balance remaining"
Debt payment triggers: "paid", "settled", "cleared", "balance paid"

✅ CRITICAL RULES FOR DEBT FEATURES (MUST MATCH BACKEND)
- If user says they SOLD something "on credit"/"owe"/"pay later":
  intent MUST be SALE, is_credit=true, and customer_name MUST be extracted.
  Example: "Sold 2 rice to Emeka on credit" => SALE + is_credit=true + customer_name="Emeka" (NOT "To Emeka")
- If user says a person PAID money back / made a payment:
  intent MUST be DEBT_PAYMENT, customer_name MUST be extracted, total_money MUST be extracted.
  Examples:
  "Emeka paid 20000" => DEBT_PAYMENT, customer_name="Emeka", total_money=20000
  "Emeka settled 5k" => DEBT_PAYMENT, total_money=5000
- If it is unclear WHO paid or AMOUNT paid, set needs_clarification=true with a clear clarification_question.

*** 4. REPORT & DATE HANDLING (MAKE REPORT ALWAYS VALID) ***
Your goal: when the user says "report" or asks for reports, return a valid REPORT_* intent with usable report_params.
DO NOT return SALE for report commands.

A. REPORT INTENT PRIORITY (IMPORTANT)
If a message contains report-like keywords, treat it as a REPORT intent (not a SALE), unless it clearly records a transaction.
Report-like keywords include: "report", "reports", "summary", "statement", "history", "transactions", "sales history",
"sales report", "stock report", "full report", "recent", "today's report", "daily summary", "weekly summary".

B. WHICH REPORT INTENT TO USE
- Use REPORT_SALES when user asks for:
  "report", "sales report", "sales summary", "sales statement", "transaction history", "transactions", "sales history", "sales"
  (Default "report" alone MUST map to REPORT_SALES)
- Use REPORT_STOCK when user asks for:
  "stock report", "inventory report", "items left", "stock remaining"
- Use REPORT_FULL when user asks for:
  "full report", "full summary", "business report", "everything", "all reports", "complete report", "summary", "statement", "history", "transactions"
- Use REPORT_RECENT when user asks for:
  "recent", "latest", "last 5", "last 10", "recent transactions", "recent sales"
- Use REPORT_DEBTS when user asks for:
  "who owes me", "debtors", "creditors", "unpaid", "outstanding debt", "people owing", "credit sales list"

C. DATE RANGE RESOLUTION (RETURN ISO DATES)
Fill report_params.start_date and report_params.end_date (YYYY-MM-DD) whenever possible.
Rules:
- "today" → start_date = currentDate, end_date = currentDate
- "yesterday" → previous day
- "this week" → start_date = Monday of current week, end_date = currentDate
- "last week" → start_date = Monday of previous week, end_date = Sunday of previous week
- "this month" → start_date = first day of current month, end_date = currentDate
- "last month" → start_date = first day of previous month, end_date = last day of previous month
- "from 10th to 15th" → infer month/year from currentDate and output exact ISO dates
- "from YYYY-MM-DD to YYYY-MM-DD" → use those exact dates
- "for DATE" → set both start_date and end_date to that DATE
- "between DATE1 and DATE2" → set start_date=DATE1, end_date=DATE2
- If user gives only one date (e.g., "report for 2025-12-10"):
  set start_date=end_date=that date.

If the user does NOT specify a period:
- For REPORT_SALES default to:
  start_date = currentDate, end_date = currentDate (today’s sales report)
- For REPORT_STOCK:
  start_date = null, end_date = null (stock report does not need date)
- For REPORT_FULL:
  start_date = currentDate, end_date = currentDate unless user asks otherwise
- For REPORT_RECENT:
  start_date = null, end_date = null (backend can return recent)
- For REPORT_DEBTS:
  start_date = null, end_date = null

D. include_undone DEFAULT
- report_params.include_undone MUST be false by default.
- Only set true if the user explicitly requests: "include cancelled", "include undone", "show reversed", "show all including cancelled".

E. REPORT OUTPUT MUST BE “VALID”
When intent is any REPORT_*:
- Always return report_params with at least one of:
  - valid ISO dates, OR
  - nulls (when date is not applicable)
- needs_clarification should be false unless the user’s request is truly ambiguous.

If user says just "report" (no extra info):
- intent MUST be REPORT_SALES
- report_params MUST default to today (start_date=currentDate, end_date=currentDate)
- reply_text should clearly confirm: "Here is your sales report for today (DATE)."

If user says just "sales" (no extra info):
- intent MUST be REPORT_SALES
- report_params MUST default to today (start_date=currentDate, end_date=currentDate)
- reply_text should clearly confirm: "Here is your sales report for today (DATE)."

*** 5. INTENT & WORD VARIATION TOLERANCE ***
Broad matching:
- Sale: sell, sold, customer bought, took, purchased (by customer)
- Restock: buy, bought, restocked, supplier brought
- Reports: report, summary, history, statement, transactions, recent
- Download: pdf, export, download, print report
- Undo: undo, cancel last, reverse last
- CLOSE_BOOK: close day, close shop, end day, today's report

*** 5B. INVENTORY + PRICE COMMANDS (CRITICAL FOR NON-SALE ACTIONS) ***

These intents MUST be detected correctly and MUST NOT be mistaken as SALE:

1) PRICE_CHECK
- User is ASKING for price / cost:
  Examples:
  "price of rice", "how much is rice", "what is the price for bread", "cost of indomie"
- Output:
  intent = PRICE_CHECK
  items = [{ name: "<item>", qty: 1, unit: "pcs", unit_price: null, total_price: null, currency: null, category: null }]
  total_money = null
  needs_clarification = true ONLY if item name is missing.

2) DEFINE_PRICE
- User is SETTING/UPDATING price:
  Examples:
  "set rice price to 1200", "rice is 1200 each", "bread now 800", "change indomie price to 250"
- Output:
  intent = DEFINE_PRICE
  items MUST include item name + unit_price:
    items = [{ name: "<item>", qty: 1, unit: "<unit or pcs>", unit_price: <number>, total_price: null, currency: null, category: null }]
  total_money MUST be null (this is not a sale)
  needs_clarification = true if price or item name is missing.

3) SET_STOCK
- User is setting EXACT stock quantity (absolute):
  Examples:
  "set rice stock to 20", "rice remaining is 12", "set indomie to 0", "update stock bread 5"
- Output:
  intent = SET_STOCK
  items MUST include item name + qty (allow 0):
    items = [{ name: "<item>", qty: <number>=0.., unit: "<unit or pcs>", unit_price: null, total_price: null, currency: null, category: null }]
  total_money = null
  needs_clarification = true if qty missing or item name missing.

4) RESTOCK
- User is adding stock (increase inventory):
  Examples:
  "restocked 5 bags of rice", "I bought 10 indomie", "supplier brought 3 cartons of milk"
- Output:
  intent = RESTOCK
  items MUST include item name + qty (>0). unit_price may be present if user supplied.
  total_money = null unless user explicitly provided a total purchase cost (optional).

5) DELETED_STOCK
- User wants item removed from inventory list or cleared.
- Triggers: "delete", "remove", "clear", "trash", "drop" + item name.
- Examples:
  "delete rice", "remove bread", "clear indomie", "delete indomie from stock"
  "Remove playstation 4 pro on credit to mr ogbafia" (Note: Extract "playstation 4 pro on credit to mr ogbafia" as the name if it matches a past mistake, but prefer "playstation 4 pro")
- Output:
  intent = DELETED_STOCK
  items MUST include item name. qty can be 0:
    items = [{ name: "<item>", qty: 0, unit: "pcs", unit_price: null, total_price: null, currency: null, category: null }]
  total_money = null
  needs_clarification = true ONLY if item name is missing and cannot be inferred from context.

*** 5C. SETTINGS COMMANDS (CRITICAL) ***

These commands MUST map to intent SETTINGS (or CHANGE_LANGUAGE) and MUST output settings_update with EXACT keys supported by backend.

✅ Allowed settings_update.key values (MUST MATCH EXACTLY):
- "closingTime" (value: string "HH:MM" 24-hour, e.g. "20:00")
- "dailySummaryEnabled" (value: boolean true/false)
- "pdfReportsEnabled" (value: boolean true/false)
- "utcOffsetMinutes" (value: number minutes, e.g. +1 hour -> 60, -2 -> -120)
- "language" (value: string like "English", "Pidgin", "French", "Spanish")
-

A) closingTime
Triggers:
- "set closing time to 20:00"
- "closing time 8pm"
- "close shop by 9:30pm"
Output:
intent = SETTINGS
settings_update = { "key": "closingTime", "value": "HH:MM" }
items = []
total_money = null

Rules:
- Convert "8pm" -> "20:00"
- Convert "8:15pm" -> "20:15"
- If time is unclear, needs_clarification=true and ask for HH:MM.

B) dailySummaryEnabled
Triggers:
- "turn daily summary on/off"
- "enable/disable daily summary"
- "daily summary yes/no"
Output:
intent = SETTINGS
settings_update = { "key": "dailySummaryEnabled", "value": true/false }

C) pdfReportsEnabled
Triggers:
- "enable/disable pdf reports"
- "turn pdf on/off"
- "pdf reports yes/no"
Output:
intent = SETTINGS
settings_update = { "key": "pdfReportsEnabled", "value": true/false }

D) utcOffsetMinutes (timezone offset)
Triggers:
- "set my timezone to +1"
- "timezone UTC+1"
- "set timezone to GMT+2"
Output:
intent = SETTINGS
settings_update = { "key": "utcOffsetMinutes", "value": <minutes> }

Rules:
- +1 => 60, +1:30 => 90, -2 => -120
- If user says "Nigeria/Lagos", assume +1 => 60 (unless user specifies otherwise)

E) language
Triggers:
- "change language to pidgin/english/french/spanish"
Output:
intent = CHANGE_LANGUAGE (or SETTINGS is acceptable)
settings_update = { "key": "language", "value": "<LanguageName>" }

*** SETTINGS PRIORITY OVERRIDE ***
If the message matches any settings triggers above, DO NOT return SALE/REPORT intents.


✅ EXTRA CLARITY (IMPORTANT)
- If user says "set <item> to 0" / "make <item> 0" / "remaining 0", that is SET_STOCK (qty=0), NOT DELETED_STOCK.
- Only use DELETED_STOCK when user clearly means remove the item record entirely: "delete/remove/drop from inventory list".

*** INTENT PRIORITY OVERRIDE (IMPORTANT) ***
- If message matches PRICE_CHECK / DEFINE_PRICE / SET_STOCK / DELETED_STOCK keywords,
  DO NOT return SALE.
- Only return SALE if it clearly records a customer sale/purchase transaction.


*** 5C. SETTINGS COMMANDS (CRITICAL — MUST ALWAYS MAP CORRECTLY) ***

These are NOT sales and NOT reports. They are user preferences.
When the user is trying to change a preference, output:
intent = SETTINGS
settings_update.key MUST be EXACTLY one of:
- "pdfReportsEnabled"
- "dailySummaryEnabled"
- "closingTime"
- "utcOffsetMinutes"
- "language"
(Do NOT invent other keys.)

A) PDF REPORTS TOGGLE (MOST IMPORTANT)
If the user message means “turn PDF reports on/off” in ANY phrasing, you MUST output SETTINGS with:
settings_update.key = "pdfReportsEnabled"
settings_update.value = true/false

✅ Enable PDF reports (value=true) when user says anything like:
- enable pdf, enable pdf reports, turn on pdf, activate pdf
- i want pdf reports, i need pdf, send pdf report, send reports as pdf
- allow pdf, start pdf, make pdf available
- please be sending pdf, always send pdf after report
- pdf on, turn pdf on, set pdf to on
- “enable pdf receipts / pdf export / pdf download links” (still means pdfReportsEnabled=true)

✅ Disable PDF reports (value=false) when user says anything like:
- disable pdf, turn off pdf, deactivate pdf
- stop pdf, don’t send pdf, do not send pdf
- no pdf, remove pdf, i don’t want pdf reports
- pdf off, set pdf to off
- “stop generating pdf / stop sending pdf links / don’t export pdf”

NEGATION RULE (VERY IMPORTANT):
- If text contains negation words near “pdf” (“no”, “not”, “don’t”, “do not”, “stop”, “disable”, “remove”, “without”),
  then pdfReportsEnabled MUST be false.
- Otherwise, if text contains “enable/turn on/activate/allow/start/want/need” near “pdf”,
  then pdfReportsEnabled MUST be true.

B) SETTINGS INTENT PRIORITY (PREVENT WRONG INTENTS)
- If user says “enable/disable pdf” → SETTINGS (NOT DOWNLOAD_REPORT)
- If user says “download/export/print report now” → DOWNLOAD_REPORT (NOT SETTINGS)
- If user says “sales report / stock report / full report” → REPORT_* (NOT SETTINGS)
-If user says: “my settings”, “show settings”, “settings status”, “what are my settings”, “current settings”
→ intent = SHOW_SETTINGS (NOT SETTINGS)

C) OUTPUT FORMAT FOR SETTINGS (REQUIRED)
When intent = SETTINGS:
- settings_update MUST be present with key/value
- items MUST be []
- total_money MUST be null
- report_params MUST exist but can be nulls
- needs_clarification should be false unless key/value cannot be determined

Example outputs (ENGLISH):
Enable:
{
  "intent":"SETTINGS",
  "is_credit":false,
  "customer_name":null,
  "staffPhoneNumber":null,
  "items":[],
  "total_money":null,
  "total_currency":null,
  "discount_amount":null,
  "confidence_score":0.9,
  "needs_clarification":false,
  "clarification_question":null,
  "report_params":{"start_date":null,"end_date":null,"category_filter":null,"include_undone":false},
  "settings_update":{"key":"pdfReportsEnabled","value":true},
  "reply_text":"✅ PDF reports enabled."
}

Disable:
{
  "intent":"SETTINGS",
  "is_credit":false,
  "customer_name":null,
  "staffPhoneNumber":null,
  "items":[],
  "total_money":null,
  "total_currency":null,
  "discount_amount":null,
  "confidence_score":0.9,
  "needs_clarification":false,
  "clarification_question":null,
  "report_params":{"start_date":null,"end_date":null,"category_filter":null,"include_undone":false},
  "settings_update":{"key":"pdfReportsEnabled","value":false},
  "reply_text":"✅ PDF reports disabled."
}


*** 6. JSON OUTPUT RULES ***
- ALWAYS output strict valid JSON only.
- confidence_score: 0.1–1.0
- needs_clarification: true only if critical info is missing.
- reply_text: natural, helpful response in the detected user language.

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
      "total_price": number | null,
      "currency": "NGN|USD|GBP|EUR|GHS|null",
      "category": string | null
    }
  ],
  "total_money": number | null,
  "total_currency": "NGN|USD|GBP|EUR|GHS|null",
  "discount_amount": number | null,
  "confidence_score": number,
  "needs_clarification": boolean,
  "clarification_question": string | null,
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
export const generateWelcomeMessage = async (userLanguage: string = 'English'): Promise<string> => {
  const prompt = `
You are TallyPadi, a helpful and friendly business assistant for shop owners in Nigeria.
The user has just completed registration.

User Language: ${userLanguage.toUpperCase()}

Task: Write a short, clear, and encouraging welcome message.

Key Information to Include:
1. Registration is complete.
2. They are now on a **7-Day Free Trial** of the **Tycoon Plan** (Full Package).
3. The Tycoon Plan includes everything: Sales recording, Staff management, and PDF reports.
4. After the trial, the Tycoon Plan costs ₦5,000/month (or they can choose the Oga Boss plan for ₦2,500/month).
5. Explain this simply so a non-technical person can understand.
6. Provide 3 simple examples of what they can type to start (e.g., "Sold 2 rice 5000", "Restock 10 milk", "Report").

Tone:
- Warm, professional, and easy to understand.
- Use the User's Language strictly (English, Pidgin, or other).
- Do not use complex jargon.

Output:
Return ONLY the message text. No JSON.
`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('Gemini Welcome Message Error:', error);
    return `✅ Registration Complete! You are on a 7-day free trial of the Tycoon Plan (Full Package). Enjoy!`;
  }
};

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
