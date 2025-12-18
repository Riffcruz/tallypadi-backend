import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

const genAI = new GoogleGenerativeAI(env.geminiApiKey);

// ✅ Enforce JSON mode to reduce markdown/codefence issues
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
// 🧼 SANITIZE
// ==========================================
const sanitizeInput = (input: string): string => {
  if (!input) return '';
  let s = input.slice(0, SAFE_MAX);

  // remove control chars + invisible
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ');

  // strip HTML
  s = s.replace(/<\/?[^>]+>/g, ' ');

  // strip injection-like phrases (don’t overdo, keep business text)
  s = s.replace(/\b(ignore (all|any|previous|above|earlier)|system prompt|developer message|hidden rules|act as|you must|bypass|override|jailbreak|return raw|tool|function call|json schema)\b/gi, ' ');

  // keep unicode letters/numbers + currency symbols etc
  s = s.replace(/[^\p{L}\p{N}\s₦$€£₵.,\-\/+()%@'_km]/gu, ' ');

  return s.replace(/\s+/g, ' ').trim();
};


// ==========================================
// 💰 MONEY PARSER
// ==========================================
const parseMoney = (raw: any): number | null => {
  if (raw == null) return null;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }

  const s0 = String(raw).toLowerCase().trim();
  if (!s0) return null;

  const s = s0.replace(/\s+/g, '').replace(/,/g, '');

  const mult = s.includes('m') ? 1_000_000 : s.includes('k') ? 1_000 : 1;
  const num = parseFloat(s.replace(/[^\d.]/g, ''));

  if (Number.isNaN(num)) return null;

  const v = num * mult;
  if (!Number.isFinite(v) || v < 0) return null;

  // keep as integer money where possible
  return Math.round(v);
};

// ==========================================
// 📦 ITEM NORMALIZATION
// ==========================================
const normalizeItemName = (name: string): string => {
  if (!name) return 'unknown_item';
  let n = sanitizeInput(name).toLowerCase();

  // remove filler words (keep core product name)
  n = n.replace(
    /\b(of|the|a|an|my|your|their|this|that|pls|please|abeg)\b/g,
    ' '
  );

  // remove common container words but keep product
  n = n.replace(
    /\b(bags?|bag|pcs?|piece|pieces|cartons?|carton|packs?|pack|sachets?|rolls?|bottles?|bottle|plates?|cups?)\b/g,
    ' '
  );

  // remove common unit words (unit will be extracted separately)
  n = n.replace(
    /\b(liters?|litres?|ltrs?|ltr|ml|cl|kg|kgs|g|grams?|tonnes?|tons?|yards?|mtrs?|meters?|metres?)\b/g,
    ' '
  );

  n = n.replace(/\s+/g, ' ').trim();

  // plural -> singular (light rules)
  if (n.endsWith('ies') && n.length > 4) n = n.slice(0, -3) + 'y';
  else if (n.endsWith('s') && n.length > 3 && !n.endsWith('ss')) {
    const noTouch = new Set(['rice', 'beans', 'gas', 'couscous']);
    if (!noTouch.has(n)) n = n.slice(0, -1);
  }

  return n || 'item';
};

const extractUnit = (text: string): string => {
  const m = sanitizeInput(text).toLowerCase();
  // capture common units
  const unitMatch = m.match(/\b(liters?|litres?|ltrs?|ltr|kg|kgs|g|grams?|bags?|cartons?|pcs?|pieces?)\b/);
  if (!unitMatch) return '';
  const u = unitMatch[1];

  // normalize
  if (u.startsWith('liter') || u.startsWith('litre') || u.startsWith('ltr') || u.startsWith('ltrs')) return 'liters';
  if (u.startsWith('kg')) return 'kg';
  if (u.startsWith('gram') || u === 'g') return 'g';
  if (u.startsWith('bag')) return 'bag';
  if (u.startsWith('carton')) return 'carton';
  if (u.startsWith('pc') || u.startsWith('piece')) return 'pcs';

  return u;
};

// ==========================================
// ✅ SAFE RESULT NORMALIZER
// ==========================================
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

function safeParsedResult(p: any): ParsedResult {
  const intent: ParsedIntent = allowedIntents.includes(p?.intent) ? p.intent : 'UNKNOWN';

  const items = Array.isArray(p?.items) ? p.items : [];
  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: any) => {
    const name = typeof it?.name === 'string' ? normalizeItemName(it.name) : 'unknown_item';

    // qty rules: price check & define price should never deduct stock
    const qty =
      intent === 'DEFINE_PRICE' || intent === 'PRICE_CHECK'
        ? 0
        : Number(it?.qty) > 0
        ? Number(it.qty)
        : 0;

    const unit = typeof it?.unit === 'string' ? sanitizeInput(it.unit).toLowerCase() : '';

    return {
      name,
      qty,
      unit_price: parseMoney(it?.unit_price),
      unit,
    };
  });

  const totalMoney = parseMoney(p?.total_money);

  // fallback reply if AI reply missing
  let fallbackReply = 'Noted.';
  if (intent === 'HELP') fallbackReply = 'Type: "Sold 2 rice 5000" or "Credits" or "Emeka paid 5k".';
  if (intent === 'REPORT_DEBTS') fallbackReply = '📌 Debtors List';
  if (intent === 'DEBT_PAYMENT') fallbackReply = `✅ Payment recorded.`;
  if (intent === 'SALE') fallbackReply = `✅ Recorded.`;
  if (intent === 'RESTOCK') fallbackReply = `✅ Stock updated.`;

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
    reply_text:
      typeof p?.reply_text === 'string' && p.reply_text.trim().length > 2 ? p.reply_text.trim() : fallbackReply,
  };
}

// ==========================================
// ⚡ FAST LOCAL FALLBACK PARSER (NOT STRICT)
// ==========================================
function looksLikeHelp(m: string) {
  return /\b(help|menu|commands|how|how to|use|guide|wetin you fit do)\b/i.test(m);
}

function looksLikeUndo(m: string) {
  return /\b(undo|reverse|revert|cancel last|rollback|remove last|delete last)\b/i.test(m);
}

function looksLikeDebts(m: string) {
  return /\b(credit|credits|debt|debts|debtors|owing|owes|who dey owe|who owes|gbese|bashi|ugwo)\b/i.test(m);
}

function looksLikeDownload(m: string) {
  return /\b(pdf|download report|send report|export)\b/i.test(m);
}

function looksLikeRecent(m: string) {
  return /\b(last\s+\d+|recent|last sales|recent sales|last transactions|recent transactions)\b/i.test(m);
}

function fallbackParse(message: string): ParsedResult | null {
  const raw = sanitizeInput(message);
  const m = raw.toLowerCase();

  // HELP
  if (looksLikeHelp(m)) {
    return safeParsedResult({ intent: 'HELP', reply_text: '🤖 Help' });
  }

  // UNDO
  if (looksLikeUndo(m)) {
    return safeParsedResult({ intent: 'UNDO_LAST_SALE', reply_text: 'Okay ✅ I will undo your last sale.' });
  }

  // DOWNLOAD
  if (looksLikeDownload(m)) {
    return safeParsedResult({ intent: 'DOWNLOAD_REPORT', reply_text: '📄 Generating report...' });
  }

  // DEBTS LIST
  if (looksLikeDebts(m) && !/\bpaid|pay|settle|payment|i paid|don pay\b/i.test(m)) {
    return safeParsedResult({ intent: 'REPORT_DEBTS', reply_text: '📌 Debtors List' });
  }

  // RECENT (default 5)
  if (looksLikeRecent(m)) {
    const nMatch = m.match(/\b(last|recent)\s+(\d+)\b/i);
    const n = nMatch ? Math.min(Math.max(Number(nMatch[2]), 1), 10) : 5;
    return safeParsedResult({
      intent: 'REPORT_RECENT',
      items: [{ name: 'recent', qty: n, unit_price: null, unit: '' }],
      reply_text: `🕒 Fetching last ${n} sales...`,
    });
  }

  // DEBT PAYMENT: "John paid 20k" / "John pay 20k" / "I collected 2k from John"
  const pay1 = raw.match(
    /\b([a-zA-Z][a-zA-Z0-9\s]{0,25})\s+(paid|pay|has\s+paid|don\s+pay|settled|settle)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?\s*(?:k|m)?)\b/i
  );
  if (pay1) {
    const customer_name = sanitizeInput(pay1[1]).trim();
    const total_money = parseMoney(pay1[3]);
    if (customer_name && total_money != null) {
      return safeParsedResult({
        intent: 'DEBT_PAYMENT',
        customer_name,
        total_money,
        reply_text: `✅ Payment recorded for ${customer_name}.`,
      });
    }
  }

  const pay2 = raw.match(
    /\b(i\s+collected|collect|received|i\s+receive|got)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?\s*(?:k|m)?)\s+(from)\s+([a-zA-Z][a-zA-Z0-9\s]{0,25})\b/i
  );
  if (pay2) {
    const total_money = parseMoney(pay2[2]);
    const customer_name = sanitizeInput(pay2[4]).trim();
    if (customer_name && total_money != null) {
      return safeParsedResult({
        intent: 'DEBT_PAYMENT',
        customer_name,
        total_money,
        reply_text: `✅ Payment recorded for ${customer_name}.`,
      });
    }
  }

  // DEFINE PRICE: "rice is 5k" / "set price of beans to 2000"
  const priceMatch = raw.match(
    /(?:price\s+of\s+|set\s+price\s+for\s+|update\s+price\s+for\s+|set\s+)?(.+?)\s+(?:is|to|now|at)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?\s*(?:k|m)?)\b/i
  );
  if (priceMatch && !/\b(sold|sell|comot|restock|add|paid|pay)\b/i.test(raw)) {
    const itemName = normalizeItemName(priceMatch[1]);
    const unit_price = parseMoney(priceMatch[2]);
    if (itemName && unit_price != null) {
      return safeParsedResult({
        intent: 'DEFINE_PRICE',
        items: [{ name: itemName, qty: 0, unit_price, unit: '' }],
        reply_text: `✅ Price updated for ${itemName}.`,
      });
    }
  }

  // DELETE STOCK: "delete rice"
  const delMatch = raw.match(/\b(delete|remove|clear)\s+(.+)\b/i);
  if (delMatch && !/\b(last|sale|transaction)\b/i.test(raw)) {
    const itemName = normalizeItemName(delMatch[2]);
    if (itemName) {
      return safeParsedResult({
        intent: 'DELETED_STOCK',
        items: [{ name: itemName, qty: 0, unit_price: null, unit: '' }],
        reply_text: `🗑️ Deleting ${itemName}...`,
      });
    }
  }

  // SALE (CREDIT or PAID)
  // handles: "Sold 200 liters kerosene to john for 20k on credit"
  // handles: "sold 2 rice for 5000"
  const saleMatch = raw.match(
    /\b(sold|sell|comot)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+?)(?:\s+to\s+([a-zA-Z][a-zA-Z0-9\s]{0,25}))?(?:\s+(?:for|@|at)\s+([₦$€£₵]?\s*[\d,]+(?:\.\d+)?\s*(?:k|m)?))?(?:\s+(on\s+credit|credit|owe|owing|later))?\b/i
  );

  if (saleMatch) {
    const qty = Math.max(Number(saleMatch[2] || 0), 0);
    const unitCandidate = saleMatch[3] || '';
    const itemRaw = saleMatch[4] || '';
    const customerRaw = saleMatch[5] || '';
    const moneyRaw = saleMatch[6] || '';
    const creditFlag = saleMatch[7] || '';

    const unit = unitCandidate ? extractUnit(unitCandidate) : extractUnit(raw);
    const name = normalizeItemName(itemRaw);
    const total_money = parseMoney(moneyRaw);

    const is_credit =
      /\bcredit|owe|owing|later\b/i.test(raw) || /\bon\s+credit\b/i.test(String(creditFlag)) ? true : false;

    const customer_name = customerRaw ? sanitizeInput(customerRaw).trim() : undefined;

    return safeParsedResult({
      intent: 'SALE',
      is_credit,
      customer_name,
      items: [{ name, qty: Number.isFinite(qty) ? qty : 0, unit, unit_price: null }],
      total_money,
      reply_text: is_credit
        ? `✅ Recorded as credit sale${customer_name ? ` to ${customer_name}` : ''}.`
        : `✅ Recorded. Sold ${qty} ${name}.`,
    });
  }

  // RESTOCK: "add 50 sugar" / "restock 20 bags rice"
  const addMatch = raw.match(/\b(add|restock)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+)\b/i);
  if (addMatch) {
    const qty = Math.max(Number(addMatch[2] || 0), 0);
    const unit = addMatch[3] ? extractUnit(addMatch[3]) : extractUnit(raw);
    const name = normalizeItemName(addMatch[4] || '');
    return safeParsedResult({
      intent: 'RESTOCK',
      is_credit: false,
      items: [{ name, qty, unit, unit_price: null }],
      total_money: null,
      reply_text: `✅ Stock updated. Added ${qty} ${name}.`,
    });
  }

  // QUICK REPORT WORDS (not strict)
  if (/\b(sales|report|summary|how market|how far|profit)\b/i.test(raw)) {
    return safeParsedResult({ intent: 'REPORT_FULL', reply_text: '📊 Generating report...' });
  }
  if (/\b(stock|inventory|what remains|balance)\b/i.test(raw)) {
    return safeParsedResult({ intent: 'REPORT_STOCK', reply_text: '📦 Checking inventory...' });
  }

  return null;
}

// ==========================================
// 🤖 SYSTEM PROMPT (NOT TOO STRICT)
// ==========================================
// 🟢 FIX: Clean Template Literal (Easier for AI to read)
const getSystemPrompt = (userLanguage: string, currentDate: string) => `
You are "TallyPadi", a smart Nigerian Business Assistant with advanced natural language understanding.

*** CONTEXT ***
Current Date & Time: ${currentDate}
Today's weekday: ${new Date(currentDate).toLocaleDateString('en-US', {weekday: 'long'})}
This month: ${new Date(currentDate).toLocaleDateString('en-US', {month: 'long'})}

*** STRICT LANGUAGE PROTOCOL ***
The user's preferred language is: **${String(userLanguage || 'English').toUpperCase()}**.
You MUST reply in **${userLanguage || 'English'}**.
- If ${userLanguage} is "English", use professional, clear English.
- If ${userLanguage} is "Pidgin", use Nigerian Pidgin (e.g. "No wahala", "I don run am", "How body?").
- If ${userLanguage} is "Hausa/Yoruba/Igbo", use that language with appropriate business terminology.

*** ADVANCED TEXT PATTERN RECOGNITION ***
You must recognize these patterns intelligently:

1. **NUMBER VARIATIONS:**
   - "two bags" = "2 bags" = "2bags" = "2-bags" → qty: 2
   - "twenty thousand" = "20,000" = "20k" = "20K" → 20000
   - "1.5k" = "1,500" = "one thousand five hundred" → 1500
   - "10k5" = "10,500" = "ten thousand five hundred" → 10500
   - "100k" = 100,000, "1.2m" = 1,200,000, "500" = 500

2. **PRODUCT NAME NORMALIZATION:**
   - "rice" = "Rice" = "RICE" → "rice"
   - "plantain" = "plantaing" = "plantin" = "dodo" → "plantain"
   - "tomatoes" = "tomatos" = "tomato" → "tomato"
   - "indomie" = "indomie noodles" = "indomie pack" → "indomie"
   - "garri" = "gari" = "eba" → "garri"
   - "groundnut oil" = "groundnut" = "gnut oil" → "groundnut oil"
   - "coke" = "coca-cola" = "coca cola" → "coca-cola"

3. **UNIT INTELLIGENCE:**
   - "2 bags of rice" → name: "rice", qty: 2, unit: "bag"
   - "5 cartons of milk" → name: "milk", qty: 5, unit: "carton"
   - "10 pieces of chicken" → name: "chicken", qty: 10, unit: "piece"
   - "3 sachets of water" → name: "water", qty: 3, unit: "sachet"
   - "500ml of oil" → name: "oil", qty: 500, unit: "ml"
   - "1 dozen eggs" → name: "eggs", qty: 12, unit: "piece"
   - "half bag of rice" → name: "rice", qty: 0.5, unit: "bag"

*** CONTEXTUAL UNDERSTANDING ***
1. **IMPLIED PRODUCTS:**
   - If previous messages mentioned "rice" and user says "Sell 2 more" → assume rice
   - If market context suggests (e.g., "Sold at Mile 12 market") → use common products in that market

2. **TIME REFERENCES:**
   - "today" = current date
   - "yesterday" = previous day
   - "last week" = previous week
   - "this month" = current month
   - "on Monday" = most recent Monday

3. **CUSTOMER RECOGNITION:**
   - "Mama Chinedu" = customer_name: "Mama Chinedu"
   - "Broda J" = customer_name: "Broda J"
   - "that woman from yesterday" → if you have context, use it
   - "the mechanic" → customer_name: "the mechanic"

*** ENHANCED SHORT COMMANDS ***
Add these to existing short commands:
- "bal" = "balance" → REPORT_STOCK
- "summary" = "sum" → REPORT_FULL
- "debt list" → REPORT_DEBTS
- "owe me" → REPORT_DEBTS
- "money" → REPORT_SALES
- "whats left" → REPORT_STOCK
- "price of" → PRICE_CHECK
- "cost of" → PRICE_CHECK
- "how much for" → PRICE_CHECK
- "add staff" → ADD_STAFF
- "new staff" → ADD_STAFF
- "remove staff" → (needs clarification)
- "close today" → CLOSE_BOOK
- "end day" → CLOSE_BOOK
- "undo" → UNDO_LAST_SALE
- "cancel last" → UNDO_LAST_SALE
- "make pdf" → DOWNLOAD_REPORT
- "send report" → DOWNLOAD_REPORT

*** ENHANCED IMAGE INTELLIGENCE ***
When analyzing images:

1. **RECEIPT PARSING:**
   - Look for: ITEM, QTY, PRICE, TOTAL patterns
   - Nigerian receipt formats: "Mtn 5000", "Airtime 1k", "Data 2GB 1500"
   - Market receipts: "Rice 5kg @ 5000"

2. **BARCODE/QR SCANNING:**
   - If barcode detected, try to match with known products
   - QR codes might contain product info or prices

3. **PACKAGING RECOGNITION:**
   - Nigerian brands: "Dangote", "Golden Penny", "Honeywell", "Mama's Pride"
   - Standard package sizes: "50kg", "25kg", "10kg", "5kg", "1kg"

4. **PRICE TAG FORMATS:**
   - "₦1,500" → 1500
   - "N500" → 500
   - "5k" → 5000
   - "10k each" → unit_price: 10000

*** BUSINESS LOGIC ENHANCEMENTS ***

1. **CREDIT TRANSACTION PATTERNS:**
   - "on credit" → is_credit: true
   - "she will pay later" → is_credit: true
   - "collect money tomorrow" → is_credit: true
   - "I go pay you Friday" → is_credit: true

2. **PAYMENT RECOGNITION:**
   - "John paid 20k" → DEBT_PAYMENT
   - "Collected 5000 from Mama B" → DEBT_PAYMENT
   - "Settlement from Emeka" → DEBT_PAYMENT

3. **BULK TRANSACTIONS:**
   - "Wholesale price" → tag as wholesale
   - "Bought for shop" → likely RESTOCK
   - "Supply to restaurant" → likely SALE with customer

4. **DISCOUNT RECOGNITION:**
   - "minus 500" → discount amount
   - "10% off" → percentage discount
   - "I give you 15k instead of 20k" → total_money: 15000

*** MULTI-ITEM TRANSACTION PARSING ***
Example: "Sold 2 bags rice at 25k, 5 cartons milk at 3k, and 10 sachets water at 50 naira"
→ Extract 3 items with their respective quantities and prices

*** STOCK MANAGEMENT INTELLIGENCE ***
1. **AUTO-UNIT CONVERSION:**
   - If user says "sold 1 bag of 50kg rice" → name: "rice", qty: 50, unit: "kg"
   - "bought 10 bottles of 75cl oil" → name: "oil", qty: 7.5, unit: "litre" (converted)

2. **PRODUCT CATEGORIES:**
   - Grains: rice, beans, maize, millet
   - Tubers: yam, potato, cassava
   - Liquids: oil, water, fuel, kerosene
   - Packaged: indomie, biscuits, sweets

*** ERROR HANDLING & CLARIFICATION ***
If uncertain, set intent to UNKNOWN and ask clarifying questions in reply_text:
- "Which product specifically?"
- "At what price per unit?"
- "Is this on credit?"
- "When did this transaction happen?"

*** CULTURAL CONTEXT ***
Understand Nigerian business practices:
- "Market price" = current fluctuating price
- "Factory price" = wholesale price
- "Customer price" = retail price
- "On the road" = transport/shipping included
- "Give me balance" = give me change

*** ADVANCED INTENT DETECTION EXAMPLES ***
- "How market today?" → REPORT_SALES
- "Wetin remain?" → REPORT_STOCK
- "Who never pay?" → REPORT_DEBTS
- "Add 5 to rice" → RESTOCK
- "Rice finish" → REPORT_STOCK (with alert)
- "Change price of beans to 1k" → DEFINE_PRICE
- "Make I see yesterday sales" → REPORT_SALES with date filter
- "Total for this week" → REPORT_FULL with weekly range
- "My brother bought 2 phones on credit" → SALE with customer_name: "my brother", is_credit: true
- "Mama Nkechi just paid" → DEBT_PAYMENT

*** RESPONSE ENHANCEMENT ***
Your reply_text should:
1. Acknowledge the action taken
2. Summarize key details
3. Ask for confirmation if needed
4. Use appropriate cultural phrases
5. Include emojis when natural (💰, 📊, 📈, ✅, ❌)
6. Suggest next actions when helpful

Return ONLY JSON. No markdown, no additional text.

<schema>
{
  "intent": "SALE|RESTOCK|SET_STOCK|DELETED_STOCK|DEFINE_PRICE|PRICE_CHECK|REPORT_SALES|REPORT_STOCK|REPORT_FULL|REPORT_DEBTS|REPORT_RECENT|DEBT_PAYMENT|CLOSE_BOOK|ADD_STAFF|DOWNLOAD_REPORT|UNDO_LAST_SALE|SETTINGS|CHANGE_LANGUAGE|HELP|UNKNOWN",
  "is_credit": boolean,
  "customer_name": "string | null",
  "staffPhoneNumber": "string | null",
  "items": [
    { 
      "name": "string (normalized, lowercase)", 
      "qty": number, 
      "unit": "string", 
      "unit_price": number | null,
      "category": "grains|liquids|tubers|packaged|electronics|others" | null
    }
  ],
  "total_money": number | null,
  "discount_amount": number | null,
  "transaction_date": "ISOString | null", // if different from current
  "report_params": { 
    "start_date": "ISOString | null", 
    "end_date": "ISOString | null",
    "category_filter": "string | null",
    "customer_filter": "string | null"
  },
  "settings_update": { 
    "key": "closingTime" | "dailySummary" | "language" | "currency" | "taxRate" | null, 
    "value": "string|boolean|number|null" 
  },
  "confidence_score": number, // 0-1 scale
  "needs_clarification": boolean,
  "reply_text": "string"
}
</schema>
`;


// ==========================================
// ⏱️ TIMEOUT + RETRY
// ==========================================
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

    // don't retry rate limit
    if (status === 429 || msg.includes('429')) throw e;

    const transient =
      msg.includes('timeout') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ENOTFOUND') ||
      (status >= 500 && status < 600);

    if (!transient) throw e;

    // retry once
    return await withTimeout(model.generateContent(parts), 25000);
  }
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
  const isoDate = new Date().toISOString();

  // ✅ Fast local parse first (handles bad English / pidgin / short commands)
  const local = fallbackParse(safeMessage);
  if (local) return local;

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

    // handle accidental codefences
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(cleaned);
    return safeParsedResult(parsed);
  } catch (err: any) {
    // ✅ fallback retry (again) in case Gemini failed
    const retry = fallbackParse(safeMessage);
    if (retry) return retry;

    if (err?.status === 429 || String(err?.message || '').includes('429')) {
      return safeParsedResult({
        intent: 'UNKNOWN',
        reply_text: 'Too many requests right now. Abeg wait small and try again.',
      });
    }

    console.error('❌ Gemini Parse Error:', err);
    return safeParsedResult({
      intent: 'UNKNOWN',
      reply_text: 'Network fluctuate small. Abeg type that again.',
    });
  }
};
