import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';

import { env } from '../config/env';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { DeletedItem } from '../models/deletedItem.model';
import { AdminSettings } from '../models/adminSettings.model';
import { Transaction } from '../models/transaction.model';

import { parseMessageWithGemini } from '../services/gemini.service';
import { processTransaction } from '../services/transaction.service';
import {
  getDailySummary,
  getStockReport,
  getFullSummary,
  getTodayTransactions
} from '../services/report.service';
import { generatePdfReport } from '../services/pdf.service';
import { checkSubscriptionStatus } from '../services/billing.service';

import { messageQueue, queueOutboundMessage } from '../services/queue.service';
import { undoLastSale } from '../services/undo.service';

// 🌍 CURRENCY CONFIGURATION
const COUNTRY_CURRENCIES: Record<string, { symbol: string; code: string; locale: string }> = {
  NG: { symbol: '₦', code: 'NGN', locale: 'en-NG' },
  US: { symbol: '$', code: 'USD', locale: 'en-US' },
  GB: { symbol: '£', code: 'GBP', locale: 'en-GB' },
  EU: { symbol: '€', code: 'EUR', locale: 'en-IE' },
  GH: { symbol: '₵', code: 'GHS', locale: 'en-GH' },
  KE: { symbol: 'KSh', code: 'KES', locale: 'en-KE' },
  ZA: { symbol: 'R', code: 'ZAR', locale: 'en-ZA' },
  IN: { symbol: '₹', code: 'INR', locale: 'en-IN' },
  CA: { symbol: 'C$', code: 'CAD', locale: 'en-CA' },
  DEFAULT: { symbol: '₦', code: 'NGN', locale: 'en-NG' },
};

const getUserCurrency = (user: any) => {
  let countryCode = user?.countryCode;

  // Guess from phone prefix if missing
  if (!countryCode && user?.phoneNumber) {
    const phone = String(user.phoneNumber).replace('+', '');
    if (phone.startsWith('234')) countryCode = 'NG';
    else if (phone.startsWith('1')) countryCode = 'US';
    else if (phone.startsWith('44')) countryCode = 'GB';
    else if (phone.startsWith('233')) countryCode = 'GH';
    else if (phone.startsWith('254')) countryCode = 'KE';
    else if (phone.startsWith('27')) countryCode = 'ZA';
    else if (phone.startsWith('91')) countryCode = 'IN';
  }

  return COUNTRY_CURRENCIES[countryCode] || COUNTRY_CURRENCIES.DEFAULT;
};

function normalizeName(name: string) {
  return String(name || '')
    .replace(/\s*\(.*?\)\s*$/, '')
    .toLowerCase()
    .trim();
}

/* =========================================================
   ✅ NEW: Controller-level safety parsers (backup)
   ========================================================= */

const parseMoney = (raw: any): number | null => {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;

  const s = String(raw).toLowerCase().replace(/\s+/g, '').replace(/,/g, '');
  const mult = s.includes('m') ? 1_000_000 : s.includes('k') ? 1_000 : 1;
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  if (Number.isNaN(num)) return null;

  const v = num * mult;
  return Number.isFinite(v) && v >= 0 ? v : null;
};

const normalizeItemName = (name: string) => {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return 'item';
  // very light normalization (your gemini.service does deeper)
  return n
    .replace(/\b(of|the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseQtyUnitItem = (text: string): { qty: number; unit: string; name: string } | null => {
  const t = String(text || '').trim();

  // supports: 200 liters kerosene, 5 bags rice, 2 kg beans
  const m = t.match(
    /^(\d+(?:\.\d+)?)\s*(liters?|litres?|ltrs?|ltr|l|kg|kgs?|g|grams?|bags?|pcs?|pieces?|cartons?|packs?|bottles?|rolls?|sachets?)?\s+(.+)$/i
  );
  if (!m) return null;

  const qty = Number(m[1]);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const unit = m[2] ? String(m[2]).toLowerCase() : '';
  const name = normalizeItemName(m[3]);

  return { qty, unit, name };
};

/* ========================================================= */

// HELPER: Fetch Image Data from Meta
const getMediaBuffer = async (
  mediaId: string
): Promise<{ data: string; mimeType: string } | null> => {
  try {
    const urlRes = await axios.get(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${env.whatsappToken}` },
    });

    const mediaUrl = urlRes.data.url;

    const mediaRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${env.whatsappToken}` },
      responseType: 'arraybuffer',
    });

    const base64Data = Buffer.from(mediaRes.data).toString('base64');
    return { data: base64Data, mimeType: mediaRes.headers['content-type'] };
  } catch (error) {
    console.error('❌ Failed to download media:', error);
    return null;
  }
};

// 1) VERIFY WEBHOOK (Meta)
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.webhookVerifyToken) {
    console.log('✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

// 2) FAST RECEIVER (ACK 200 ASAP + queue job)
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      return res.sendStatus(200);
    }

    const value = body.entry[0].changes[0].value;
    const msg = value.messages[0];

    const from: string = msg.from;
    const messageId: string = msg.id;

    // profile name
    const profileName: string | undefined = value.contacts?.[0]?.profile?.name;

    let text = '';
    let mediaId: string | undefined;
    let isVoiceMessage = false;

    switch (msg.type) {
      case 'text':
        text = msg.text.body;
        break;

      case 'image':
        text = msg.image.caption || 'Analyze this image';
        mediaId = msg.image.id;
        break;

      case 'audio':
        text = 'Analyze this audio';
        mediaId = msg.audio.id;
        isVoiceMessage = true;
        break;

      default:
        console.log(`Unsupported message type: ${msg.type}`);
        return res.sendStatus(200);
    }

    if (!text && !mediaId) return res.sendStatus(200);

    // ✅ ACK META IMMEDIATELY (avoid retries)
    res.sendStatus(200);

    // ✅ QUEUE (dedupe by messageId)
    void messageQueue
      .add(
        'process-message',
        { from, text, messageId, mediaId, isVoiceMessage, profileName },
        { jobId: messageId }
      )
      .then(() => console.log(`📥 Queued message from ${from}`))
      .catch((e) => console.error('❌ Failed to queue message:', e));
  } catch (err) {
    console.error('❌ Error in webhook receiver:', err);
    return res.sendStatus(200);
  }
};

// ✅ debtors list helper (supports old CREDIT docs + new balance docs)
const buildDebtSummary = async (userId: any, symbol: string, locale: string) => {
  const debtSales = await Transaction.find({
    user: userId,
    type: 'SALE',
    isUndone: { $ne: true },
    $or: [{ paymentStatus: 'CREDIT' }, { balance: { $gt: 0 } }],
  })
    .sort({ timestamp: -1 })
    .limit(2000)
    .lean();

  if (!debtSales.length) return `✅ Nobody dey owe you. Everyone has cleared their tab.`;

  const byName: Record<string, number> = {};

  for (const t of debtSales as any[]) {
    const name = String(t.customerName || 'Unknown').trim() || 'Unknown';

    let outstanding = 0;
    if (typeof t.balance === 'number') {
      outstanding = Number(t.balance || 0);
    } else {
      const total = Number(t.totalMoney || 0);
      const paid = Number(t.amountPaid || 0);
      outstanding = Math.max(total - paid, 0);
    }

    if (outstanding <= 0) continue;
    byName[name] = (byName[name] || 0) + outstanding;
  }

  const entries = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `✅ Nobody dey owe you. Everyone has cleared their tab.`;

  const lines = entries
    .slice(0, 30)
    .map(([n, v]) => `• *${n}* — ${symbol}${v.toLocaleString(locale)}`);

  return `📌 *Debtors List*\n\n${lines.join('\n')}\n\nReply like: *Emeka paid 20000* to record payment.`;
};

// 3) BACKGROUND PROCESSOR (called by Worker)
// ===============================
// 🔐 SECURITY / ALLOWLIST HELPERS
// ===============================

const ALLOWED_INTENTS = new Set([
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
]);

const ALLOWED_SETTINGS_KEYS = new Set(['closingTime', 'dailySummary', 'language']);
const SAFE_TEXT_MAX = 900;

function cleanTextForSecurity(input: string) {
  let s = String(input || '').slice(0, SAFE_TEXT_MAX);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function looksLikeTxnSentence(low: string) {
  return /\b(sold|sell|comot|add|restock|set\s+stock|set\s+price|price\s+of|delete|remove|owe|credit|on\s+credit|vent|vnt|selam|customer bought|purchased from me|took|collected)\b/.test(
    low
  );
}

/**
 * "lots of injection-like phrases" → score based
 * Only suspend if it looks clearly malicious
 */
function injectionScore(raw: string) {
  const s = cleanTextForSecurity(raw).toLowerCase();

  const patterns: RegExp[] = [
    /\bignore\b/,
    /\bdisregard\b/,
    /\bbypass\b/,
    /\boverride\b/,
    /\bdeveloper\s+message\b/,
    /\bsystem\s+prompt\b/,
    /\bprevious\s+instructions\b/,
    /\bact\s+as\b/,
    /\byou\s+must\b/,
    /\breturn\s+raw\b/,
    /\btool\b/,
    /\bfunction\s+call\b/,
    /\bjson\s+schema\b/,
    /\bchange\s+schema\b/,
    /\bdo\s+anything\b/,
    /\bjailbreak\b/,
  ];

  let hits = 0;
  for (const re of patterns) if (re.test(s)) hits++;

  // Boost score if user is clearly trying to force huge/insane values
  if (/\b\d{9,}\b/.test(s)) hits += 2; // 9+ digit numbers
  if (/(rrule|dtstart|BEGIN:VEVENT|END:VEVENT)/i.test(s)) hits += 2; // random injection vectors
  return hits;
}

async function suspendUser(userId: any, reason: string) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        subscriptionStatus: 'suspended',
        suspendedAt: new Date(),
        suspensionReason: reason,
      },
    }
  );
}

// ===============================
// ✅ MODEL OUTPUT ALLOWLIST GUARD
// ===============================
function allowlistParsed(parsed: any) {
  const safe: any = { ...parsed };

  // intent allowlist
  if (!ALLOWED_INTENTS.has(safe?.intent)) safe.intent = 'UNKNOWN';

  // settings key allowlist
  if (!ALLOWED_SETTINGS_KEYS.has(safe?.settings_update?.key)) {
    safe.settings_update = { key: null, value: null };
  }

  // report params allowlist (only start_date/end_date)
  if (!safe.report_params || typeof safe.report_params !== 'object') {
    safe.report_params = { start_date: null, end_date: null };
  } else {
    const s = safe.report_params.start_date;
    const e = safe.report_params.end_date;

    safe.report_params = {
      start_date: typeof s === 'string' ? s : null,
      end_date: typeof e === 'string' ? e : null,
    };
  }

  // items sanity
  safe.items = Array.isArray(safe.items) ? safe.items.slice(0, 30) : [];
  safe.items = safe.items.map((it: any) => ({
    name: String(it?.name || '').toLowerCase().trim().slice(0, 60) || 'unknown_item',
    qty: Number.isFinite(Number(it?.qty)) ? Math.max(0, Math.min(Number(it?.qty), 1_000_000)) : 0,
    unit: String(it?.unit || '').toLowerCase().trim().slice(0, 20),
    unit_price:
      it?.unit_price == null
        ? null
        : Number.isFinite(Number(it?.unit_price))
        ? Math.max(0, Math.min(Number(it?.unit_price), 1_000_000_000_000))
        : null,
  }));

  // money sanity
  safe.total_money =
    safe.total_money == null
      ? null
      : Number.isFinite(Number(safe.total_money))
      ? Math.max(0, Math.min(Number(safe.total_money), 1_000_000_000_000))
      : null;

  // booleans
  safe.is_credit = Boolean(safe.is_credit);

  // strings
  safe.customer_name = typeof safe.customer_name === 'string' ? safe.customer_name.trim() : safe.customer_name;
  safe.staffPhoneNumber =
    typeof safe.staffPhoneNumber === 'string' ? safe.staffPhoneNumber.trim() : safe.staffPhoneNumber;

  // reply text clamp
  safe.reply_text = typeof safe.reply_text === 'string' ? safe.reply_text.slice(0, 400) : 'Noted.';

  return safe;
}

// ===============================
// 🧠 INTELLIGENT FALLBACK PARSER FOR SALE
// ===============================
function parseMoneyLoose(moneyText: string): number | null {
  if (!moneyText) return null;
  
  // Clean the text
  let text = moneyText.toLowerCase().trim();
  
  // Remove currency symbols and commas
  text = text.replace(/[₦$€£₵,]/g, '');
  
  // Handle Nigerian shorthand
  if (text.includes('k')) {
    const num = parseFloat(text.replace('k', '')) * 1000;
    return isNaN(num) ? null : Math.round(num);
  }
  
  if (text.includes('m')) {
    const num = parseFloat(text.replace('m', '')) * 1000000;
    return isNaN(num) ? null : Math.round(num);
  }
  
  if (text.includes('thousand')) {
    const num = parseFloat(text.replace('thousand', '')) * 1000;
    return isNaN(num) ? null : Math.round(num);
  }
  
  // Try direct parse
  const num = parseFloat(text);
  return isNaN(num) ? null : Math.round(num);
}

/**
 * Intelligent parser for sales with flexible patterns and word number support
 */
function forceParseSaleFromText(text: string) {
  const raw = cleanTextForSecurity(text);
  const low = raw.toLowerCase();
  
  // First check if this looks like a sale
  const saleIndicators = /\b(sold|sell|comot|selam|sale|vending|selling|bought from me|customer bought|purchased from me|took|collected|vent|vnt)\b/i;
  if (!saleIndicators.test(low)) {
    return null; // Not a sale
  }

  // Multiple patterns for different formats
  const patterns = [
    // Pattern 1: Full sale with customer
    /\b(sold|sell|comot|sale)\s+(?:me\s+)?(\d+(?:\.\d+)?|\w+)\s*(bags?|packs?|pcs?|pieces?|sachets?|cartons?|bottles?|liters?|litres?|kgs?|kilos?|units?)?\s*(?:of\s+)?([^.!?]+?)\s+(?:to|for|give|gave)\s+([^.!?]{1,40})\s+(?:for|at|@)\s+([₦$€£₵]?\s*[\d,.]+(?:\.\d+)?\s*(?:k|m|thousand)?)\s*(?:on\s+credit|credit|owe|owing|i\s+go\s+pay\s+later)?/i,
    
    // Pattern 2: Sale without customer but with amount
    /\b(sold|sell|comot)\s+(?:me\s+)?(\d+(?:\.\d+)?|\w+)\s*(bags?|packs?|pcs?)?\s*(?:of\s+)?([^.!?]+?)\s+(?:for|at|@)\s+([₦$€£₵]?\s*[\d,.]+(?:\.\d+)?\s*(?:k|m|thousand)?)\s*(?:on\s+credit|credit)?/i,
    
    // Pattern 3: Generic sale pattern
    /\b(sold|sell)\s+(\d+(?:\.\d+)?|\w+)\s+(?:of\s+)?([^.!?]+?)\s+for\s+([\d,.]+(?:\.\d+)?\s*(?:k|m)?)/i,
    
    // Pattern 4: Pidgin format
    /\b(comot|selam|vent)\s+(\d+)\s+([^.!?]+?)\s+(?:for|na)\s+([\d,.]+(?:\.\d+)?k?)/i,
    
    // Pattern 5: Minimal pattern (just quantity and amount)
    /\b(sold|sell)\s+(\d+(?:\.\d+)?)\s+for\s+([\d,.]+(?:\.\d+)?\s*k?)/i,
    
    // Pattern 6: Very flexible capture
    /\b(sold|sell|comot)\s+(?:me\s+)?(\d+(?:\.\d+)?|\w+)\s*(bags?|packs?)?\s*(?:of\s+)?([^.!?]+?)\s+(?:for|at)\s+([\d,.kKmM]+)/i
  ];

  let match = null;
  let patternIndex = -1;

  // Try all patterns
  for (let i = 0; i < patterns.length; i++) {
    match = raw.match(patterns[i]);
    if (match) {
      patternIndex = i;
      break;
    }
  }

  if (!match) {
    // Couldn't parse with any pattern
    return null;
  }

  // Helper function to parse quantity (including word numbers)
  function parseQuantity(input: string): number {
    const wordMap: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7,
      'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
      'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
      'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
      'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
      'a': 1, 'an': 1, 'single': 1, 'double': 2, 'triple': 3, 'couple': 2
    };
    
    // Try direct number first
    const num = parseFloat(input);
    if (!isNaN(num)) return num;
    
    // Try word number
    const lower = input.toLowerCase();
    if (wordMap[lower] !== undefined) return wordMap[lower];
    
    // Try compound numbers
    if (lower.includes('-')) {
      const parts = lower.split('-');
      let sum = 0;
      for (const part of parts) {
        if (wordMap[part]) sum += wordMap[part];
      }
      if (sum > 0) return sum;
    }
    
    return 0;
  }

  // Extract data based on pattern
  let qty: number = 0;
  let unit = 'pcs';
  let item = '';
  let customer: string | null = null;
  let total: number | null = null;
  let isCredit = false;

  switch (patternIndex) {
    case 0: // Full pattern with customer
      qty = parseQuantity(match[2]);
      unit = (match[3] || '').toLowerCase().trim() || 'bag';
      item = (match[4] || '').trim();
      customer = (match[5] || '').trim();
      total = parseMoneyLoose(match[6] || '');
      isCredit = /\b(on\s+credit|credit|owe|owing|i\s+go\s+pay\s+later)\b/.test(low);
      break;
      
    case 1: // Sale without customer
    case 2:
      qty = parseQuantity(match[2]);
      unit = (match[3] || '').toLowerCase().trim() || 'bag';
      item = (match[4] || '').trim();
      total = parseMoneyLoose(match[5] || '');
      isCredit = /\bcredit\b/.test(low);
      break;
      
    case 3: // Pidgin format
      qty = parseQuantity(match[2]);
      item = (match[3] || '').trim();
      total = parseMoneyLoose(match[4] || '');
      isCredit = /\bcredit\b/.test(low);
      break;
      
    case 4: // Minimal pattern
      qty = parseQuantity(match[2]);
      item = 'item'; // Generic, will be handled by AI
      total = parseMoneyLoose(match[3] || '');
      break;
      
    case 5: // Flexible capture
      qty = parseQuantity(match[2]);
      unit = (match[3] || '').toLowerCase().trim() || 'bag';
      item = (match[4] || '').trim();
      total = parseMoneyLoose(match[5] || '');
      isCredit = /\bcredit\b/.test(low);
      break;
      
    default:
      return null;
  }

  // Clean up item name
  const cleanItem = item
    .replace(/\bfor\s+[\d,.kKmM]+\b/i, '') // Remove "for 20k"
    .replace(/\bto\s+[^.!?]+\b/i, '') // Remove "to customer"
    .replace(/\bon\s+credit\b/i, '') // Remove "on credit"
    .trim();

  // Check if item was captured properly
  const finalItem = cleanItem || 'item';
  const isGenericItem = finalItem === 'item' || finalItem === 'unknown' || finalItem.length < 2;

  // Generate reply text
  let replyText = '';
  if (isGenericItem) {
    // Let Gemini handle the item name
    replyText = `I recorded a sale for ₦${total?.toLocaleString() || 'amount'}. `;
    if (customer) replyText += `Customer: ${customer}. `;
    if (isCredit) replyText += `(Credit sale). `;
    replyText += `What item was sold?`;
    
    return {
      intent: 'UNKNOWN' as const,
      is_credit: isCredit,
      customer_name: customer || null,
      staffPhoneNumber: null,
      items: [],
      total_money: total,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: replyText
    };
  } else {
    // We have enough info for a proper SALE intent
    replyText = `✅ Sale recorded: ${qty} ${unit}(s) of ${finalItem}`;
    if (customer) replyText += ` to ${customer}`;
    if (total) replyText += ` for ₦${total.toLocaleString()}`;
    if (isCredit) replyText += ` (Credit)`;
    
    return {
      intent: 'SALE' as const,
      is_credit: isCredit,
      customer_name: isCredit ? customer : customer || null,
      staffPhoneNumber: null,
      items: [{
        name: finalItem.toLowerCase().trim(),
        qty: qty || 1,
        unit: unit,
        unit_price: total && qty ? total / qty : null
      }],
      total_money: total,
      report_params: { start_date: null, end_date: null },
      settings_update: { key: null, value: null },
      reply_text: replyText
    };
  }
}

const STRIKE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const STRIKE_SUSPEND_AT = 3;                  // 3 attempts

async function handleInjectionAttemptOrRefuse(user: any, from: string, rawText: string) {
  const score = injectionScore(rawText);

  // score 0 => not injection
  if (score <= 0) return { handled: false };

  const now = new Date();
  const last = user.security?.lastInjectionAt ? new Date(user.security.lastInjectionAt) : null;
  const withinWindow = last ? (now.getTime() - last.getTime()) <= STRIKE_WINDOW_MS : false;

  user.security = user.security || { injectionStrikes: 0, lastInjectionAt: null };
  user.security.injectionStrikes = withinWindow ? (user.security.injectionStrikes || 0) + 1 : 1;
  user.security.lastInjectionAt = now;

  // ✅ suspend if too many attempts OR very high score
  if (user.security.injectionStrikes >= STRIKE_SUSPEND_AT || score >= 5) {
    user.subscriptionStatus = 'suspended';
    user.suspendedAt = now;
    user.suspensionReason = 'Prompt injection attempts (system prompt / developer message / override)';
    await user.save();

    await queueOutboundMessage(
      from,
      `🛑 Account suspended for suspicious instructions.\nReason: ${user.suspensionReason}\nIf this is a mistake, contact support.`
    );

    return { handled: true };
  }

  // ✅ refuse (do NOT call Gemini)
  await user.save();
  await queueOutboundMessage(
    from,
    `🛡️ I can't show internal system prompts or instructions.\n\nTry:\n• Sold 5 bags of rice for 50k\n• Credits\n• Emeka paid 20k\n• Stock list\n• Sales today`
  );

  return { handled: true };
}


export const handleMessageLogic = async (
  from: string,
  text: string,
  messageId: string,
  mediaId?: string,
  isVoiceMessage?: boolean,
  profileName?: string
) => {
  try {
    const rawText = cleanTextForSecurity(text);
    const low = rawText.toLowerCase().trim();

    console.log(`⚡ Processing Logic for ${from}: "${rawText}"`);

    // --- GLOBAL SETTINGS (safe fallback) ---
    let MAX_HISTORY = 5;
    let MAX_STAFF = 5;
    try {
      const globalSettings = await AdminSettings.findOne().lean();
      MAX_HISTORY = globalSettings?.limits?.maxMessageHistory || 5;
      MAX_STAFF = globalSettings?.limits?.maxStaffAccounts || 5;
    } catch {
      console.warn('⚠️ AdminSettings not reachable, using defaults.');
    }

    // --- MEDIA ---
    let imageBuffer: string | undefined;
    let imageMime: string | undefined;

    if (mediaId) {
      const media = await getMediaBuffer(mediaId);
      if (media) {
        imageBuffer = media.data;
        imageMime = media.mimeType;
      }
    }

    // --- USER ---
    let user = await User.findOne({ phoneNumber: from });

    const guessedCurrency = getUserCurrency({ phoneNumber: from });
    const { symbol, locale, code } = getUserCurrency(user || { phoneNumber: from });

    // ✅ Create user on first contact
    if (!user) {
      const initialShopName = profileName || 'My Shop';

      user = await User.create({
        phoneNumber: from,
        businessName: initialShopName,
        name: profileName,
        countryCode:
          guessedCurrency.code === 'NGN'
            ? 'NG'
            : guessedCurrency.code === 'USD'
            ? 'US'
            : guessedCurrency.code === 'GBP'
            ? 'GB'
            : 'NG',
        registrationStage: 'EMAIL',
        settings: {
          dailySummaryEnabled: false,
          closingTime: '20:00',
          utcOffsetMinutes: 60,
          language: 'English',
          pdfReportsEnabled: false,
        },
        messageHistory: [],
      });

      const shopNote = profileName
        ? `I use your WhatsApp name (*${profileName}*) as your shop name.`
        : `I set your shop name to *"${user.businessName}"*`;

      await queueOutboundMessage(
        from,
        `Welcome to *Tallypadi*, ${profileName || 'Friend'}! 👋\n\n${shopNote}\n\nTo start, reply with your *EMAIL ADDRESS* (for account recovery).`
      );
      return;
    }

    // ✅ If already suspended, block immediately
    if (user.subscriptionStatus === 'suspended') {
      await queueOutboundMessage(
        from,
        `🛑 Your account has been suspended.\nReason: ${user.suspensionReason || 'Security policy'}`
      );
      return;
    }

    if (user && user.registrationStage === 'COMPLETED') {
      const inj = await handleInjectionAttemptOrRefuse(user, from, rawText);
      if (inj.handled) return;
    }

    // --- REG FLOW ---
    if (user.registrationStage === 'EMAIL') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rawText)) {
        await queueOutboundMessage(from, '❌ Invalid email format. Please enter a valid email address.');
        return;
      }

      const existingUser = await User.findOne({ email: rawText });
      if (existingUser) {
        await queueOutboundMessage(from, 'This email is already registered. Please use a different email.');
        return;
      }

      user.email = rawText;
      user.registrationStage = 'PASSWORD';
      await user.save();

      await queueOutboundMessage(
        from,
        `✅ Email Saved! Now reply with a *SECRET PASSWORD* (min 8 chars).\n\nLogin: https://tallypadi.com/login`
      );
      return;
    }

    if (user.registrationStage === 'PASSWORD') {
      if (rawText.length < 8) {
        await queueOutboundMessage(from, '❌ Password too short. Please use at least 8 characters.');
        return;
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(rawText, salt);
      user.registrationStage = 'COMPLETED';
      await user.save();

      await queueOutboundMessage(from, `✅ Password Saved!\n\nTry: *I sold 2 bags of rice for ${symbol}50k*`);
      return;
    }

    // ✅ SECURITY: detect injection-like messages (only after COMPLETED)
    const score = injectionScore(rawText);
    if (score >= 5) {
      await suspendUser(user._id, 'Prompt injection / unsafe instruction attempt');
      await queueOutboundMessage(
        from,
        `🛑 Your account has been suspended for suspicious instructions.\nIf this is a mistake, contact support.`
      );
      return;
    }

    // --- PLAN RULES ---
    if (mediaId && !isVoiceMessage && user.planType !== 'TYCOON') {
      await queueOutboundMessage(from, '📷 Image scanning is only available for *Tycoon Plan* users. Upgrade to use this feature!');
      return;
    }

    if (isVoiceMessage) {
      const allowedAudioPlans = ['TYCOON', 'OGA_BOSS'];
      if (!allowedAudioPlans.includes(user.planType)) {
        await queueOutboundMessage(from, '🎤 Voice messages are available for *Oga Boss* and *Tycoon* plans only. Upgrade to use this feature!');
        return;
      }
    }

    // --- SUB CHECK + HISTORY ---
    if (user.registrationStage === 'COMPLETED') {
      const isAllowed = await checkSubscriptionStatus(user);
      if (!isAllowed) return;

      user.messageHistory = user.messageHistory || [];
      if (user.messageHistory.length >= MAX_HISTORY) user.messageHistory.shift();
      user.messageHistory.push(rawText);
      await user.save();
    }

    // ✅ QUICK COMMANDS (no Gemini)
    const looksLikeTxn = looksLikeTxnSentence(low);

    // ✅ Debt list command (will NEVER trigger for transaction sentences)
    const isDebtCmd =
      !looksLikeTxn &&
      (low === 'credit' ||
        low === 'credits' ||
        low.includes('credit list') ||
        low.includes('credits list') ||
        low.includes('all credits') ||
        low === 'debt' ||
        low.includes('debtors') ||
        /\b(debt|debts|debtor|debtors|owing|owes|owe|gbese|bashi|ugwo|tab)\b/.test(low) ||
        low.includes('dey owe') ||
        low.includes('who dey owe') ||
        low.includes('who is owing') ||
        low.includes('who owes'));

    const isPaymentPhrase = /\b(paid|pay|payment|settle|settled|i paid|don pay)\b/.test(low);

    if (isDebtCmd && !isPaymentPhrase) {
      const msg = await buildDebtSummary(user._id, symbol, locale);
      await queueOutboundMessage(from, msg);
      return;
    }

    // ✅ Undo (quick)
    const isUndoCmd =
      low === 'undo' ||
      low === 'undo last' ||
      low === 'undo last sale' ||
      low === 'cancel last sale' ||
      low === 'reverse last sale';

    if (isUndoCmd) {
      const r = await undoLastSale(user._id, messageId);
      await queueOutboundMessage(from, r.message);
      return;
    }

    // --- AI PARSE ---
    const currentLang = user.settings?.language || 'English';
    let parsed: any = await parseMessageWithGemini(rawText, currentLang, imageBuffer, imageMime);

    // ✅ SERVER-SIDE ALLOWLIST: model cannot invent ops/keys/params
    parsed = allowlistParsed(parsed);

    // ✅ HARD SAFETY: if AI returns REPORT_DEBTS for a transaction sentence, force SALE parse
    if (parsed?.intent === 'REPORT_DEBTS' && looksLikeTxn) {
      const forced = forceParseSaleFromText(rawText);
      if (forced) parsed = forced;
    }

    // --- DATE PARSING ---
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let dateLabel = "Today's";

    if (parsed?.report_params?.start_date) {
      startDate = new Date(parsed.report_params.start_date);
      if (parsed.report_params.end_date) endDate = new Date(parsed.report_params.end_date);
      else {
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
      }

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      if (startDate.toDateString() === today.toDateString()) dateLabel = "Today's";
      else if (startDate.toDateString() === yesterday.toDateString()) dateLabel = "Yesterday's";
      else {
        const diffDays = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 20) dateLabel = 'Monthly';
        else if (diffDays > 1) dateLabel = 'Weekly';
        else dateLabel = startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      }
    }

    // Close book behavior
    if (parsed?.intent === 'CLOSE_BOOK') {
      const currentHour = new Date().getHours();
      if (currentHour < 12) {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        y.setHours(0, 0, 0, 0);

        const yEnd = new Date(y);
        yEnd.setHours(23, 59, 59, 999);

        startDate = y;
        endDate = yEnd;
        dateLabel = "Yesterday's (Closed)";
        await queueOutboundMessage(from, '💡 You reply late! I will close the book for *Yesterday*.');
      }
      parsed.intent = 'REPORT_FULL';
    }

    // --- ROUTING ---
    switch (parsed.intent) {
      case 'SALE':
      case 'RESTOCK':
      case 'SET_STOCK':
      case 'DEFINE_PRICE': {
        await processTransaction(user._id as any, parsed, messageId);
        await queueOutboundMessage(from, parsed.reply_text || '✅ Done.');
        break;
      }

      case 'HELP': {
        const helpMsg =
          `🤖 *How to use Tallypadi*\n\n` +
          `💰 *Sales & Credit:*\n` +
          `• Sold 2 rice for 50k\n` +
          `• Sold 200 liters kerosene to John for 20k on credit\n` +
          `• Undo last sale\n\n` +
          `💸 *Debts & Payments:*\n` +
          `• Credits\n` +
          `• Who is owing me?\n` +
          `• Emeka paid 20k\n\n` +
          `📦 *Stock Management:*\n` +
          `• Add 50 sugar (Restock)\n` +
          `• Price of rice?\n` +
          `• Stock list\n\n` +
          `📊 *Reports:*\n` +
          `• How much I sell today?\n` +
          `• Send PDF (Tycoon Only)\n\n` +
          `💎 *Premium Plans:*\n` +
          `• 🎤 Voice Notes (Oga Boss & Tycoon)\n` +
          `• 📷 Image Scan (Tycoon Only)\n` +
          `• 👥 Staff Accounts (Tycoon Only)\n` +
          `• 📄 PDF Reports (Tycoon Only)`;

        await queueOutboundMessage(from, helpMsg);
        break;
      }

      case 'REPORT_DEBTS': {
        const msg = await buildDebtSummary(user._id, symbol, locale);
        await queueOutboundMessage(from, msg);
        break;
      }

      case 'REPORT_RECENT': {
        const limit = parsed.items?.[0]?.qty || 5;
        const safeLimit = Math.min(Math.max(limit, 1), 10);

        await queueOutboundMessage(from, `🔎 Fetching last ${safeLimit} transactions...`);

        const recentTx = await Transaction.find({
          user: user._id,
          type: 'SALE',
          isUndone: { $ne: true },
        })
          .sort({ timestamp: -1 })
          .limit(safeLimit)
          .lean();

        if (!recentTx.length) {
          await queueOutboundMessage(from, "You haven't recorded any sales yet.");
          break;
        }

        let msg = `🕒 *Last ${safeLimit} Sales:*\n\n`;
        recentTx.forEach((tx: any) => {
          const d = new Date(tx.timestamp);
          const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          const dateStr = d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });

          const itemsStr = tx.items.map((i: any) => `${i.name} (${i.qty})`).join(', ');
          const money = `${symbol}${(tx.totalMoney || 0).toLocaleString(locale)}`;
          const status = tx.paymentStatus === 'CREDIT' ? '🔴 CREDIT' : '✅ PAID';

          msg += `• *${itemsStr}* — ${money}\n`;
          msg += `   _${dateStr} @ ${timeStr} • ${status}_\n\n`;
        });

        await queueOutboundMessage(from, msg);
        break;
      }

      case 'UNDO_LAST_SALE': {
        const r = await undoLastSale(user._id, messageId);
        await queueOutboundMessage(from, r.message);
        break;
      }

      case 'DELETED_STOCK': {
        const itemToDelete = parsed.items?.[0]?.name?.toLowerCase();
        if (!itemToDelete) {
          await queueOutboundMessage(from, "Which item you wan delete? (e.g. 'Delete Rice')");
          break;
        }

        const item = await Inventory.findOne({
          user: user._id,
          name: { $regex: itemToDelete, $options: 'i' },
        });

        if (item) {
          await new DeletedItem({ user: user._id, name: item.name, quantity: item.quantity }).save();
          await Inventory.deleteOne({ _id: item._id });
          await queueOutboundMessage(from, `🗑️ Deleted *${item.name}* from your stock.`);
        } else {
          await queueOutboundMessage(from, `I no see "${itemToDelete}" inside your shop list o.`);
        }
        break;
      }

      case 'DEBT_PAYMENT': {
        await processTransaction(user._id as any, parsed, messageId);
        await queueOutboundMessage(from, parsed.reply_text || '✅ Payment recorded.');
        break;
      }

      case 'PRICE_CHECK': {
        const itemQuery = parsed.items?.[0]?.name?.toLowerCase();
        if (!itemQuery) {
          await queueOutboundMessage(from, "Which item price you wan check? (e.g. 'Price of Rice')");
          break;
        }

        const item = await Inventory.findOne({
          user: user._id,
          name: { $regex: itemQuery, $options: 'i' },
        });

        if (!item) {
          await queueOutboundMessage(from, `I no see "${itemQuery}" inside your shop list o.`);
          break;
        }

        const priceFmt =
          item.lastUnitPrice > 0 ? `${symbol}${item.lastUnitPrice.toLocaleString(locale)}` : 'Not set yet';

        await queueOutboundMessage(
          from,
          `🏷️ *Price Check: ${item.name.toUpperCase()}*\n\n💰 Last recorded price: *${priceFmt}*\n📦 Stock Level: *${item.quantity}*`
        );
        break;
      }

      case 'REPORT_SALES': {
        await queueOutboundMessage(from, `Calculating ${dateLabel.toLowerCase()} report... ⏳`);

        const summary = await getDailySummary(user._id as any, startDate, endDate);
        const totalFormatted = summary.totalRevenue.toLocaleString(locale, {
          style: 'currency',
          currency: code,
          maximumFractionDigits: 0,
        });

        const transactions = await getTodayTransactions(user._id as any, startDate, endDate);

        let salesMsg = `📅 *${dateLabel} Sales Breakdown*\n\n`;

        if (transactions.length > 0) {
          transactions.forEach((tx: any) => {
            const d = new Date(tx.timestamp);
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const timeStr = `${hh}:${mm}`;

            tx.items.forEach((it: any) => {
              const itemTotal = it.total ? `${symbol}${Number(it.total).toLocaleString(locale)}` : '(No Price)';
              const unitLabel = it.unit ? ` ${it.unit}` : '';
              salesMsg += `🕒 ${timeStr} • ${it.name} (${it.qty}${unitLabel}) - ${itemTotal}\n`;
            });
          });
        } else {
          salesMsg += `_No sales recorded for ${dateLabel.toLowerCase()}._\n`;
        }

        salesMsg += `\n💰 *Total Money:* ${totalFormatted}\n`;
        salesMsg += `📉 *Total Transactions:* ${transactions.length}`;

        await queueOutboundMessage(from, salesMsg);

        if (user.planType === 'TYCOON') {
          try {
            const pdfFileName = await generatePdfReport(user._id as any, 'SALES', dateLabel, startDate, endDate);
            await queueOutboundMessage(from, `✨ Download PDF: https://tallypadi.com/reports/${pdfFileName}`);
            await queueOutboundMessage(from, `Link expires in 24 hours.`);
          } catch (e) {
            console.error('❌ PDF error:', e);
          }
        }
        break;
      }

      case 'REPORT_STOCK': {
        await queueOutboundMessage(from, 'Checking inventory... 📦');

        const targetItem = parsed.items?.length ? parsed.items[0].name : null;
        const stockList = await getStockReport(user._id as any, targetItem);

        if (!stockList.length) {
          await queueOutboundMessage(from, 'Your inventory is empty or item not found.');
          break;
        }

        let stockMsg = `📦 *Current Stock Balance*\n\n`;
        let hasNegative = false;

        stockList.forEach((it: any) => {
          if (it.quantity < 0) {
            hasNegative = true;
            stockMsg += `• ${it.name}: ⚠️ *${Math.abs(it.quantity)}* (Oversold/Not Recorded)\n`;
          } else {
            stockMsg += `• ${it.name}: *${it.quantity}* remaining\n`;
          }
        });

        if (hasNegative) stockMsg += `\n_Note: Some items show negative. Update me when you restock._`;

        await queueOutboundMessage(from, stockMsg);
        break;
      }

      case 'REPORT_FULL': {
        await queueOutboundMessage(from, 'Generating comprehensive report... 📋');

        const fullData = await getFullSummary(user._id as any, startDate, endDate);
        const revenueSummary = await getDailySummary(user._id as any, startDate, endDate);

        let fullMsg = `📋 *${dateLabel} Business Summary*\n\n`;
        fullMsg += `💰 *Revenue:* ${symbol}${revenueSummary.totalRevenue.toLocaleString(locale)}\n`;
        fullMsg += `📉 *Items Sold:* ${revenueSummary.items.length}\n\n`;

        if (!fullData.length) {
          fullMsg += `_No data found for this period._`;
        } else {
          fullMsg += `*Inventory Status:*\n\n`;
          fullData.forEach((it: any) => {
            const unit = it.unit || 'units';
            fullMsg += `🔹 *${String(it.name).toUpperCase()}*\n`;
            if (it.soldPaid > 0) fullMsg += `   • Sold (Paid): ${it.soldPaid} ${unit}\n`;
            if (it.soldCredit > 0) fullMsg += `   • Sold (Credit): ${it.soldCredit} ${unit} ⚠️\n`;
            fullMsg += `   • Stock Left: ${it.stock < 0 ? 0 : it.stock} ${unit}\n`;
            if (it.stock < 0) fullMsg += `   • ⚠️ System shows -${Math.abs(it.stock)} (please update stock)\n`;
            if (it.revenue > 0) fullMsg += `   • Revenue: ${symbol}${it.revenue.toLocaleString(locale)}\n`;
            fullMsg += `\n`;
          });
          fullMsg += `_End of Report_`;
        }

        await queueOutboundMessage(from, fullMsg);

        if (user.planType === 'TYCOON') {
          try {
            const pdfFileName = await generatePdfReport(user._id as any, 'FULL', dateLabel, startDate, endDate);
            await queueOutboundMessage(from, `✨ Download PDF: https://tallypadi.com/reports/${pdfFileName}`);
            await queueOutboundMessage(from, `Link expires in 24 hours.`);
          } catch (e) {
            console.error('❌ PDF error:', e);
          }
        }
        break;
      }

      case 'CHANGE_LANGUAGE': {
        if (parsed?.settings_update?.key === 'language' && parsed.settings_update.value) {
          user.settings.language = String(parsed.settings_update.value);
          await user.save();
          await queueOutboundMessage(from, parsed.reply_text || `Language changed to ${parsed.settings_update.value}`);
        } else {
          await queueOutboundMessage(from, parsed.reply_text || 'Okay.');
        }
        break;
      }

      case 'SETTINGS': {
        if (parsed?.settings_update?.key === 'closingTime' && parsed.settings_update.value) {
          user.settings.closingTime = String(parsed.settings_update.value);
          await user.save();
          await queueOutboundMessage(from, `✅ Done! Closing time set to ${user.settings.closingTime}.`);
        } else {
          await queueOutboundMessage(from, parsed.reply_text || 'Okay.');
        }
        break;
      }

      case 'ADD_STAFF': {
        if (user.planType !== 'TYCOON') {
          await queueOutboundMessage(from, '🛑 Staff accounts are for *Tycoon Plan* users only.');
          break;
        }

        const staffPhoneNumber = parsed.staffPhoneNumber;
        if (!staffPhoneNumber) {
          await queueOutboundMessage(from, 'Please provide the phone number of the staff you want to add.');
          break;
        }

        const staffCount = await User.countDocuments({ ownerId: user._id });
        if (staffCount >= MAX_STAFF) {
          await queueOutboundMessage(from, `You have reached the maximum staff limit (${MAX_STAFF}).`);
          break;
        }

        const existingStaff = await User.findOne({ phoneNumber: staffPhoneNumber });
        if (existingStaff) {
          await queueOutboundMessage(from, 'This user is already registered on Tallypadi.');
          break;
        }

        const newStaff = await User.create({
          phoneNumber: staffPhoneNumber,
          role: 'STAFF',
          ownerId: user._id,
          planType: 'TYCOON',
          registrationStage: 'COMPLETED',
        });

        await queueOutboundMessage(from, `✅ Added ${newStaff.phoneNumber} as your staff.`);
        await queueOutboundMessage(
          newStaff.phoneNumber,
          `🔔 You have been added as a staff by ${user.phoneNumber}. You can now record sales for their shop.`
        );
        break;
      }

      case 'DOWNLOAD_REPORT': {
        if (user.planType !== 'TYCOON') {
          await queueOutboundMessage(from, '📄 PDF reports are a *Tycoon Plan* feature. Upgrade to unlock it.');
          break;
        }

        await queueOutboundMessage(from, 'Generating your PDF report... 📄');

        try {
          const pdfFileName = await generatePdfReport(user._id as any, 'FULL', dateLabel, startDate, endDate);
          await queueOutboundMessage(from, `✅ PDF ready: https://tallypadi.com/reports/${pdfFileName}`);
          await queueOutboundMessage(from, `Link expires in 24 hours.`);
        } catch (e) {
          console.error('❌ PDF error:', e);
          await queueOutboundMessage(from, 'Sorry, error while generating PDF. Try again later.');
        }
        break;
      }

      case 'UNKNOWN':
      default: {
        await queueOutboundMessage(from, parsed.reply_text || 'Noted.');
        break;
      }
    }
  } catch (err) {
    console.error('❌ Error processing message logic:', err);
    throw err; // ✅ let BullMQ retry
  }
};