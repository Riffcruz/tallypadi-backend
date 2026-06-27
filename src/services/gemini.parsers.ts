// ============================================================
// gemini.parsers.ts
// Utility functions: sanitizers, money parser, item normalizer,
// safe result builder, and local fallback regex parser.
// These run BEFORE calling Gemini (or instead of it on fast paths).
// ============================================================

import type { ParsedItem, ParsedResult, ParsedIntent } from './gemini.types';

// ─── Constants ─────────────────────────────────────────────
export const SAFE_MAX = 1000;

// ─── Strip WhatsApp export header line ─────────────────────
export const stripWhatsAppExportLine = (input: string): string => {
  if (!input) return '';
  let s = input.trim();
  s = s.replace(/^\[\[([^\]]+)\]\]\s*/, '[$1] ');
  s = s.replace(/^\[\s*\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]\s*/i, '');
  s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*-\s*/i, '');
  s = s.replace(/^~?[a-z0-9 _.-]{1,40}:\s*/i, '');
  return s.trim();
};

// ─── Sanitize user input ────────────────────────────────────
export const sanitizeInput = (input: string): string => {
  if (!input) return '';
  let s = input.slice(0, SAFE_MAX);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/<\/?[^>]+>/g, ' ');
  s = s.replace(/\b(system prompt|ignore previous|developer mode)\b/gi, ' ');
  // Replace multiple spaces/tabs with a single space
  s = s.replace(/[ \t]+/g, ' ');
  // Replace multiple newlines with a single newline, and trim
  return s.replace(/\n\s*\n/g, '\n').trim();
};

// ─── Extract JSON object from Gemini response ────────────────
export const extractJsonObject = (text: string): string => {
  const t = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return t;
  return t.slice(first, last + 1);
};

// ─── Normalize phone number ──────────────────────────────────
export const normalizePhone = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const s = sanitizeInput(raw);
  const cleaned = s.replace(/\D/g, '');
  return cleaned || undefined;
};

// ─── Detect currency symbol from text ───────────────────────
export const detectMoneySymbol = (raw: unknown): string => {
  const s = String(raw || '').toLowerCase();
  if (s.includes('$') || s.includes('dollar') || s.includes('usd')) return '$';
  if (s.includes('£') || s.includes('pound') || s.includes('gbp')) return '£';
  if (s.includes('€') || s.includes('euro') || s.includes('eur')) return '€';
  if (s.includes('₵') || s.includes('cedi') || s.includes('ghs')) return '₵';
  if (s.includes('₦') || s.includes('naira') || s.includes('ngn')) return '₦';
  if (s.includes('rand') || s.includes('zar')) return 'R';
  if (s.includes('shilling') || s.includes('kes') || s.includes('ugx') || s.includes('tzs')) return 'KSh';
  return '';
};

// ─── Parse money string to number ───────────────────────────
export const parseMoney = (raw: unknown): number | null => {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;

  const s0 = String(raw).toLowerCase().trim();
  if (!s0) return null;

  let mult = 1;
  if (s0.includes('million') || s0.match(/\b(?<!\.)m\b/)) {
    mult = 1_000_000;
  } else if (s0.includes('thousand') || s0.match(/\b(?<!\.)k\b/)) {
    mult = 1_000;
  } else if (s0.includes('m') && !s0.includes('million')) {
    mult = 1_000_000;
  } else if (s0.includes('k') && !s0.includes('thousand')) {
    mult = 1_000;
  }

  const numStr = s0.replace(/,/g, '').match(/[\d.]+/)?.[0];
  if (!numStr) return null;

  const num = parseFloat(numStr);
  if (!Number.isFinite(num) || num < 0) return null;

  const result = Math.round(num * mult);
  return result;
};

// ─── Normalize item name ─────────────────────────────────────
export const normalizeItemName = (name: string): string => {
  if (!name) return 'unknown_item';
  let s = sanitizeInput(name);
  s = s.replace(/^(a|an|the|some|few|many)\s+/i, '');
  s = s.replace(/\b(pack|packs|bag|bags|carton|cartons|bottle|bottles|piece|pieces|pcs|rolls?|sachet|sachets?|liters?|ltrs?|kg)\b/gi, '').trim();
  s = s.replace(/\s{2,}/g, ' ').trim().toLowerCase();
  if (!s || s === 'item' || s === 'product') return 'unknown_item';
  return s;
};

// ─── Compute total from items (qty × unit_price) ────────────
export const computeTotalFromItems = (items: ParsedItem[]): number | null => {
  const totals = items
    .filter((i) => i.unit_price != null && i.qty > 0)
    .map((i) => i.qty * (i.unit_price as number));
  if (totals.length === 0) return null;
  return totals.reduce((a, b) => a + b, 0);
};

// ─── Safe result normalizer ──────────────────────────────────
export function safeParsedResult(p: any): ParsedResult {
  const allowedIntents: ParsedIntent[] = [
    'SALE', 'RESTOCK', 'SET_STOCK', 'DELETED_STOCK', 'DELETE_ALL_INVENTORY',
    'DEFINE_PRICE', 'PRICE_CHECK', 'REPORT_SALES', 'REPORT_STOCK', 'REPORT_FULL',
    'SETTINGS', 'CHANGE_LANGUAGE', 'DEBT_PAYMENT', 'CLOSE_BOOK', 'ADD_STAFF',
    'DOWNLOAD_REPORT', 'UNDO_LAST_SALE', 'REPORT_DEBTS', 'REPORT_RECENT',
    'SHOW_SETTINGS', 'CREATE_ORDER', 'LIST_ORDERS', 'UPDATE_ORDER', 'CANCEL_ORDER',
    'GET_SHOP_LINK', 'HQ_DASHBOARD', 'HQ_COMPARE_BRANCHES', 'HQ_STOCK_TRANSFER',
    'CREATE_INVOICE', 'UPDATE_BANK_DETAILS', 'EXPENSE', 'REPORT_EXPENSE',
    'BEST_SELLING', 'COMPARE_SALES', 'HELP', 'UNKNOWN',
  ];

  const intent: ParsedIntent = allowedIntents.includes(p?.intent) ? p.intent : 'UNKNOWN';
  const items = Array.isArray(p?.items) ? p.items : [];

  const normalizedItems: ParsedItem[] = items.slice(0, 30).map((it: Record<string, unknown>) => ({
    name: typeof it?.name === 'string' ? normalizeItemName(it.name) : 'unknown_item',
    qty: Number.isFinite(Number(it?.qty)) ? Math.max(0, Number(it.qty)) : 0,
    unit_price: parseMoney(it?.unit_price),
    cost_price: parseMoney(it?.cost_price),
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

  if (intent === 'HQ_STOCK_TRANSFER') {
    if (!p?.transfer_params?.from_branch || !p?.transfer_params?.to_branch || !normalizedItems[0]?.name) {
      needsClarification = true;
    }
  }

  const includeUndoneRaw = p?.report_params?.include_undone;
  const include_undone = typeof includeUndoneRaw === 'boolean' ? includeUndoneRaw : false;

  const parsedTotal = parseMoney(p?.total_money);
  const computedTotal = computeTotalFromItems(normalizedItems);

  let finalTotal = parsedTotal;
  if (computedTotal != null) {
    if (finalTotal == null || finalTotal < computedTotal) {
      finalTotal = computedTotal;
    }
  }

  const discount = parseMoney(p?.discount_amount);
  if (finalTotal != null && discount != null && discount > 0) {
    finalTotal = Math.max(0, finalTotal - discount);
  }

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
    staffName: typeof p?.staffName === 'string' ? sanitizeInput(p.staffName) : undefined,
    items: normalizedItems,
    total_money: finalTotal,
    amount_paid: parseMoney(p?.amount_paid),
    discount_amount: discount,
    confidence_score: typeof p?.confidence_score === 'number' ? p.confidence_score : 1,
    needs_clarification: needsClarification,
    report_params: {
      start_date: p?.report_params?.start_date || null,
      end_date: p?.report_params?.end_date || null,
      category_filter: p?.report_params?.category_filter || null,
      include_undone,
      compare_start_date: p?.report_params?.compare_start_date || null,
      compare_end_date: p?.report_params?.compare_end_date || null,
    },
    expense_params: {
      category: typeof p?.expense_params?.category === 'string' ? sanitizeInput(p.expense_params.category) : null,
      description: typeof p?.expense_params?.description === 'string' ? sanitizeInput(p.expense_params.description) : null,
    },
    order_params: {
      description: p?.order_params?.description || null,
      delivery_date: p?.order_params?.delivery_date || null,
      status: p?.order_params?.status || null,
    },
    transfer_params: {
      from_branch: p?.transfer_params?.from_branch || null,
      to_branch: p?.transfer_params?.to_branch || null,
    },
    bank_details: {
      bank_name: p?.bank_details?.bank_name || null,
      account_number: p?.bank_details?.account_number || null,
      account_name: p?.bank_details?.account_name || null,
    },
    settings_update: {
      key: p?.settings_update?.key || null,
      value: p?.settings_update?.value ?? null,
    },
    due_date: typeof p?.due_date === 'string' && p.due_date ? p.due_date : null,
    reply_text: typeof p?.reply_text === 'string' && p.reply_text.length > 2 ? p.reply_text.trim() : fallback,
  };
}

// ─── Local fallback regex parser (no Gemini call) ────────────
export function fallbackParse(message: string): ParsedResult | null {
  const raw = sanitizeInput(stripWhatsAppExportLine(message));
  if (/^\d+$/.test(raw)) return null;

  const m = raw.toLowerCase();

  if (/\b(support|contact|customer\s*service|online\s*support)\b/i.test(m)) {
    return safeParsedResult({ intent: 'HELP', reply_text: '📞 Click on "Contact Support" to text with an agent' });
  }

  if (/\b(help|menu|commands|guide|options)\b/i.test(m)) {
    return safeParsedResult({
      intent: 'HELP',
      reply_text:
        '🤖 *TallyPadi Help Menu*\n\n' +
        '✅ *1) Record Sales*\n• "Sold 2 rice for 5000"\n• "Sold 3 bags of cement 45k"\n• "Sold 2 rice 2500 each"\n\n' +
        '💳 *2) Credit (Owe / Pay Later)*\n• "Sold 2 rice to Emeka on credit"\n• "Emeka paid 5000"\n\n' +
        '📦 *3) Restock*\n• "Restock 10 rice"\n• "I bought 2 cartons of milk"\n\n' +
        '🧮 *4) Set Stock*\n• "Set rice stock to 20"\n\n' +
        '🗑️ *5) Delete Stock Item*\n• "Delete rice"\n\n' +
        '💰 *6) Set Price*\n• "Rice price is 1200"\n\n' +
        '🔎 *7) Price Check*\n• "Price of rice"\n\n' +
        '📊 *8) Reports*\n• "Report today"\n• "This month report"\n\n' +
        '📦 *9) Stock Report*\n• "Stock report"\n\n' +
        '📄 *10) PDF Report (TYCOON)*\n• "Download report"\n\n' +
        '↩️ *11) Undo*\n• "Undo last sale"\n\n' +
        '👥 *12) Staff (Owner)*\n• "Add staff 08012345678"\n\n' +
        '⚙️ *13) Settings (Owner)*\n• "Change language to Pidgin"\n• "Enable PDF reports"\n\n' +
        '🧾 *Tips*\n• 5k = 5000, 2m = 2,000,000\nType any example above to get started ✅',
    });
  }

  if (/\b(shop link|store link|website|my shop|share shop)\b/i.test(m) && !/\b(report|sales|change|update|set|name)\b/i.test(m)) {
    return safeParsedResult({ intent: 'GET_SHOP_LINK', reply_text: '🛍️ Fetching your shop link...' });
  }

  if (/\b(undo|cancel last|mistake|delete last)\b/i.test(m)) {
    return safeParsedResult({ intent: 'UNDO_LAST_SALE', reply_text: '✅ Last transaction cancelled.' });
  }

  // PDF disable
  if (/\b(pdf|pdfs)\b/i.test(m) && /\b(report|reports)\b/i.test(m) && /\b(disable|turn\s*off|switch\s*off|deactivate|stop|dont|don't|do\s*not|no)\b/i.test(m)) {
    return safeParsedResult({ intent: 'SETTINGS', settings_update: { key: 'pdfReportsEnabled', value: false }, reply_text: '✅ PDF reports disabled.' });
  }
  // PDF enable
  if (/\b(pdf|pdfs)\b/i.test(m) && /\b(report|reports)\b/i.test(m) && /\b(enable|turn\s*on|switch\s*on|activate|start|allow)\b/i.test(m)) {
    return safeParsedResult({ intent: 'SETTINGS', settings_update: { key: 'pdfReportsEnabled', value: true }, reply_text: '✅ PDF reports enabled.' });
  }

  const wantsDownload = /\b(download|export|print|generate|create|send)\b/i.test(m) && /\b(pdf|report|reports)\b/i.test(m);
  const isToggle = /\b(enable|disable|turn\s*on|turn\s*off|switch\s*on|switch\s*off|activate|deactivate)\b/i.test(m) && /\bpdf\b/i.test(m);
  if (wantsDownload && !isToggle) {
    return safeParsedResult({ intent: 'DOWNLOAD_REPORT', reply_text: '📄 Generating PDF report...' });
  }

  if (/\b(debtors?|owing|who owes|credit list)\b/i.test(m) && !/\b(paid|pay)\b/i.test(m)) {
    return safeParsedResult({ intent: 'REPORT_DEBTS', reply_text: 'Fetching debtors list...' });
  }

  if (/^orders?$/i.test(m) || /\b(list|check|show|my|get)\s+orders?\b/i.test(m) || /\b(active|pending)\s+(jobs?|orders?)\b/i.test(m)) {
    if (!/\b(new|create|make|add)\b/i.test(m)) {
      return safeParsedResult({ intent: 'LIST_ORDERS', reply_text: '🔍 Checking orders...' });
    }
  }

  // Expense fallback
  const expenseRegex = /\b(spent|spend|expense|expenses|cost)\b/i;
  if (expenseRegex.test(m) && !/\b(sold|sell|sale)\b/i.test(m)) {
    const moneyMatch = raw.match(/([₦$€£₵]?\s*[\d,]+(?:\s*(?:k|m|thousand|million))?)/i);
    if (moneyMatch) {
      const total_money = parseMoney(moneyMatch[1]);
      const hasCurrencyOrSuffix = /[₦$€£₵km]/i.test(moneyMatch[0]) || /thousand|million/i.test(moneyMatch[0]);
      if (total_money && total_money > 0 && (hasCurrencyOrSuffix || total_money > 100)) {
        let desc = raw.replace(moneyMatch[0], '').replace(expenseRegex, '').replace(/\b(on|for|naira|dollars?|cedis?)\b/gi, '').trim();
        desc = sanitizeInput(desc) || 'Expense';
        let cat = 'General';
        const d = desc.toLowerCase();
        if (/\b(fuel|diesel|petrol|gas|power|light|bill|nepa)\b/.test(d)) cat = 'Utilities';
        else if (/\b(transport|bus|taxi|uber|bolt|trip|travel)\b/.test(d)) cat = 'Transport';
        else if (/\b(food|eat|lunch|dinner|snack)\b/.test(d)) cat = 'Feeding';
        else if (/\b(rent|shop|space)\b/.test(d)) cat = 'Rent';
        else if (/\b(airtime|data|card|recharge)\b/.test(d)) cat = 'Communication';
        else if (/\b(salary|wages|staff|pay)\b/.test(d)) cat = 'Salaries';
        const sym = detectMoneySymbol(raw) || '₦';
        return safeParsedResult({ intent: 'EXPENSE', total_money, expense_params: { description: desc, category: cat }, reply_text: `✅ Recorded expense: ${sym}${total_money.toLocaleString()} for ${desc} (${cat}).` });
      }
    }
  }

  // Sale regex fast path
  const saleRegex =
    /(?:i|we)?\s*\b(?:sold|sell)\b\s+(\d+(?:\.\d+)?)\s*(bags?|pcs?|pieces?|cartons?|packs?|sachets?|bottles?|rolls?|liters?|ltrs?|kg)?\s*(?:of)?\s+(.+?)\s+(?:for|at|price)\s+([₦$€£₵]?\s*[\d,]+(?:\s*(?:k|m|thousand|million))?)(?:\s*(?:naira|dollars?|cedis?|pounds?|shillings?|rand|ngn|usd|ghs|gbp|eur))?\s*(each|per|\/each|\/per|total)?\b/i;

  const match = raw.match(saleRegex);
  if (match) {
    const qty = parseFloat(match[1]);
    const unitRaw = match[2] || 'pcs';
    const name = normalizeItemName(match[3]);
    const moneyRaw = match[4];
    const qualifier = String(match[5] || '').toLowerCase();
    const price = parseMoney(moneyRaw);
    const sym = detectMoneySymbol(moneyRaw);

    const unit = unitRaw.toLowerCase().startsWith('bag') ? 'bag'
      : unitRaw.toLowerCase().startsWith('carton') ? 'carton'
      : unitRaw.toLowerCase().startsWith('pack') ? 'pack'
      : unitRaw.toLowerCase().startsWith('bottle') ? 'bottle'
      : unitRaw.toLowerCase().startsWith('liter') || unitRaw.toLowerCase().startsWith('ltr') ? 'liter'
      : unitRaw.toLowerCase().startsWith('kg') ? 'kg'
      : unitRaw.toLowerCase().startsWith('pc') || unitRaw.toLowerCase().startsWith('piece') ? 'pcs'
      : unitRaw.toLowerCase();

    if (name && name !== 'unknown_item' && qty > 0) {
      const isUnit = qualifier === 'each' || qualifier === 'per' || qualifier === '/each' || qualifier === '/per';
      const unitPrice = isUnit ? price : null;
      const totalMoney = price == null ? null : isUnit ? Math.round(qty * price) : price;
      return safeParsedResult({
        intent: 'SALE',
        is_credit: false,
        items: [{ name, qty, unit, unit_price: unitPrice, category: null }],
        total_money: totalMoney,
        reply_text: totalMoney != null
          ? `✅ Recorded. Sold ${qty} ${unit} of ${name} for ${sym}${totalMoney.toLocaleString()}`.trim()
          : `✅ Recorded. Sold ${qty} ${unit} of ${name}.`,
      });
    }
  }

  return null;
}
