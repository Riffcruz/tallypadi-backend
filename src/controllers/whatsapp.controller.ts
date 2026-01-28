// src/controllers/whatsapp.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';

import { env } from '../config/env';
import { User, IUser } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { Debtor } from '../models/debtor.model';
import { AdminSettings } from '../models/adminSettings.model';
import { DailyStats } from '../models/dailyStats.model';
import { SupportTicket } from '../models/supportTicket.model';
import { SupportAgent } from '../models/supportAgent.model'; // ✅ Import Agent
import { supportService } from '../services/support.service';

import { processTransaction } from '../services/transaction.service';
import { checkSubscriptionStatus } from '../services/billing.service';
import { orderService } from '../services/order.service';
import {
  messageQueue,
  queueOutboundMessage,
  queueOutboundButtons, // ✅ NEW: queued buttons helper
  queueSaleResponse,
  queueWelcomeResponse,
  queueSaleReceipt,
  queueInvoicePdf
} from '../services/queue.service';
import { sendWhatsAppDocumentBuffer } from '../services/whatsapp.service';


import { undoLastSale } from '../services/undo.service';

import { resolveDebtor, normName } from '../services/debtor.service';
import { hqService } from '../services/hq.service';
import { Invoice } from '../models/invoice.model';
import { generateInvoicePdf } from '../services/invoice.pdf.service';

// Reports / PDF (your existing services)
import {
  getDailySummary,
  getStockReport,
  getFullSummary,
  getTodayTransactions,
  getRelevantUserIds,
} from '../services/report.service';
import { generatePdfReport } from '../services/pdf.service';
import { toUserLocalDate } from '../utils/dates';

// =====================================================
// 🌍 Currency
// =====================================================
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

function guessCountryFromPhone(phoneNumber?: string) {
  const phone = String(phoneNumber || '').replace('+', '');
  if (phone.startsWith('234')) return 'NG';
  if (phone.startsWith('1')) return 'US';
  if (phone.startsWith('44')) return 'GB';
  if (phone.startsWith('233')) return 'GH';
  if (phone.startsWith('254')) return 'KE';
  if (phone.startsWith('27')) return 'ZA';
  if (phone.startsWith('91')) return 'IN';
  return 'NG';
}

const getUserCurrency = (user: any) => {
  const cc = String(user?.countryCode || guessCountryFromPhone(user?.phoneNumber) || 'NG').toUpperCase();
  return COUNTRY_CURRENCIES[cc] || COUNTRY_CURRENCIES.DEFAULT;
};

// =====================================================
// 🕒 User-local time helpers
// =====================================================

function toISODateForOffset(offsetMinutes: number): string {
  const now = new Date();
  const local = new Date(now.getTime() + offsetMinutes * 60_000);
  return local.toISOString().split('T')[0];
}

function getUtcRangeForUser(offsetMinutes: number, startDate?: Date, endDate?: Date) {
  if (startDate && endDate) return { startUtc: startDate, endUtc: endDate };

  const nowLocal = toUserLocalDate(new Date(), offsetMinutes);

  const startLocal = new Date(nowLocal);
  startLocal.setHours(0, 0, 0, 0);

  const endLocal = new Date(nowLocal);
  endLocal.setHours(23, 59, 59, 999);

  const startUtc = new Date(startLocal.getTime() - offsetMinutes * 60_000);
  const endUtc = new Date(endLocal.getTime() - offsetMinutes * 60_000);
  return { startUtc, endUtc };
}

// =====================================================
// ✅ Undone filtering rules for reports
// =====================================================
function ownerRequestedUndoneHistory(rawText: string, parsed: any) {
  const s = String(rawText || '').toLowerCase();

  const wantsUndone =
    /\b(include|show|with)\b.*\b(undone|reversed|void|voided|cancelled|canceled|undo)\b/.test(s) ||
    /\bundo history\b/.test(s) ||
    /\bundone histories\b/.test(s);

  const excludeUndone =
    /\b(exclude|remove|hide|without)\b.*\b(undone|reversed|void|voided|cancelled|canceled|undo)\b/.test(s);

  const parsedFlag =
    Boolean((parsed as any)?.report_params?.include_undone) ||
    Boolean((parsed as any)?.include_undone) ||
    Boolean((parsed as any)?.show_undone);

  if (excludeUndone) return false;
  return wantsUndone || parsedFlag;
}

function buildUndoneFilter(includeUndone: boolean) {
  if (includeUndone) return {};
  return { $or: [{ isUndone: { $exists: false } }, { isUndone: false }] };
}

function suffixReportScope(includeUndone: boolean) {
  return includeUndone ? ' (including undone)' : ' (excluding undone)';
}

async function getSalesCountForPeriod(
  userIds: any[],
  startUtc: Date,
  endUtc: Date,
  includeUndone: boolean
) {
  const q: any = {
    user: { $in: userIds },
    type: 'SALE',
    timestamp: { $gte: startUtc, $lte: endUtc },
  };

  // default: exclude undone
  if (!includeUndone) {
    q.$or = [{ isUndone: { $exists: false } }, { isUndone: false }];
  }

  return Transaction.countDocuments(q);
}

// =====================================================
// 🧾 TYCOON PDF helper (match report type)
// =====================================================
const REPORT_BASE_URL = process.env.REPORT_BASE_URL || 'https://tallypadi.com/reports/';

function isTycoon(user: any) {
  return String(user?.planType || '').toUpperCase() === 'TYCOON';
}

/**
 * IMPORTANT:
 * - Use type='SALES' for REPORT_SALES
 * - Use type='FULL' for REPORT_FULL
 * - For STOCK/DEBTS/RECENT, default to FULL unless your pdf.service supports those.
 */
async function sendPdfIfTycoon(opts: {
  user: any;
  from: string;
  type: 'FULL' | 'SALES';
  dateLabel: string;
  startUtc?: Date;
  endUtc?: Date;
}) {
  const { user, from, type, dateLabel, startUtc, endUtc } = opts;
  if (!isTycoon(user)) return;

  try {
    const pdfFileName = await generatePdfReport(
      user._id as any,
      type,
      dateLabel,
      startUtc,
      endUtc
    );
    await queueOutboundMessage(from, `📄 PDF: ${REPORT_BASE_URL}${pdfFileName}`);
  } catch (e) {
    console.error('PDF gen error:', e);
  }
}

// =====================================================
// Media download
// =====================================================
const getMediaBuffer = async (mediaId: string): Promise<{ data: string; mimeType: string } | null> => {
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

function isValidDate(d: any) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Parses: today/yesterday/2025/2025-12-18/18-12-2025/18-12-2025
 * into UTC-ish boundaries matching the user's local day.
 */
function parseReportDateToUtc(input: any, offsetMinutes: number, isEnd: boolean): Date | null {
  if (!input) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  const s = raw.toLowerCase();

  if (s === 'today') {
    const nowLocal = toUserLocalDate(new Date(), offsetMinutes);
    const y = new Date(nowLocal);
    y.setHours(isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0);
    return new Date(y.getTime() - offsetMinutes * 60_000);
  }

  if (s === 'yesterday') {
    const nowLocal = toUserLocalDate(new Date(), offsetMinutes);
    const y = new Date(nowLocal);
    y.setDate(y.getDate() - 1);
    y.setHours(isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0);
    return new Date(y.getTime() - offsetMinutes * 60_000);
  }

  const yearOnly = raw.match(/^(\d{4})$/);
  if (yearOnly) {
    const yr = Number(yearOnly[1]);
    const m = isEnd ? 11 : 0;
    const d = isEnd ? 31 : 1;
    const hh = isEnd ? 23 : 0;
    const mm = isEnd ? 59 : 0;
    const ss = isEnd ? 59 : 0;
    const ms = isEnd ? 999 : 0;
    return new Date(Date.UTC(yr, m, d, hh, mm, ss, ms) - offsetMinutes * 60_000);
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const yr = Number(ymd[1]);
    const mo = Number(ymd[2]) - 1;
    const da = Number(ymd[3]);
    const hh = isEnd ? 23 : 0;
    const mm = isEnd ? 59 : 0;
    const ss = isEnd ? 59 : 0;
    const ms = isEnd ? 999 : 0;
    return new Date(Date.UTC(yr, mo, da, hh, mm, ss, ms) - offsetMinutes * 60_000);
  }

  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) {
    const da = Number(dmy[1]);
    const mo = Number(dmy[2]) - 1;
    const yr = Number(dmy[3]);
    const hh = isEnd ? 23 : 0;
    const mm = isEnd ? 59 : 0;
    const ss = isEnd ? 59 : 0;
    const ms = isEnd ? 999 : 0;
    return new Date(Date.UTC(yr, mo, da, hh, mm, ss, ms) - offsetMinutes * 60_000);
  }

  const d = new Date(raw);
  if (!isValidDate(d)) return null;
  return d;
}

function normalizeSettingsUpdate(parsed: any) {
  const su = parsed?.settings_update;
  if (!su || !su.key) return parsed;

  const rawKey = String(su.key || '').trim();
  const rawVal = su.value;

  const keyMap: Record<string, string> = {
    // closing time
    closing_time: 'closingTime',
    closingtime: 'closingTime',
    close_time: 'closingTime',

    // daily summary
    daily_summary: 'dailySummaryEnabled',
    dailySummary: 'dailySummaryEnabled',
    daily_summary_enabled: 'dailySummaryEnabled',

    // pdf reports
    pdf: 'pdfReportsEnabled',
    pdf_reports: 'pdfReportsEnabled',
    pdfReports: 'pdfReportsEnabled',
    pdf_reports_enabled: 'pdfReportsEnabled',

    // timezone
    timezone: 'utcOffsetMinutes',
    utc_offset: 'utcOffsetMinutes',
    utcOffset: 'utcOffsetMinutes',
    offsetMinutes: 'utcOffsetMinutes',

    // language
    lang: 'language',
    userLanguage: 'language',
  };

  const normalizedKey = keyMap[rawKey] || rawKey;
  parsed.settings_update.key = normalizedKey;

  // normalize value types
  if (normalizedKey === 'dailySummaryEnabled' || normalizedKey === 'pdfReportsEnabled') {
    const v = String(rawVal).toLowerCase();
    parsed.settings_update.value =
      rawVal === true ||
      v === 'true' || v === 'on' || v === 'enable' || v === 'enabled' || v === 'yes';
  }

  if (normalizedKey === 'utcOffsetMinutes') {
    // Accept "+1", "UTC+1", "+01:30", "-2", etc.
    const s = String(rawVal ?? '').replace(/utc|gmt/gi, '').trim();
    const m = s.match(/^([+-])\s*(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      const hh = Number(m[2] || 0);
      const mm = Number(m[3] || 0);
      parsed.settings_update.value = sign * (hh * 60 + mm);
    } else if (Number.isFinite(Number(rawVal))) {
      parsed.settings_update.value = Number(rawVal);
    }
  }

  if (normalizedKey === 'closingTime') {
    let t = String(rawVal ?? '').trim();

    // supports "8pm" / "8:15pm"
    const pm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (pm) {
      let hh = Number(pm[1]);
      const mm = Number(pm[2] || '00');
      const ap = pm[3].toLowerCase();
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
      t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    parsed.settings_update.value = t;
  }

  if (normalizedKey === 'language') {
    parsed.settings_update.value = String(rawVal ?? 'English');
  }

  return parsed;
}



/**
 * Make labels like your older logic:
 * - Today/Yesterday
 * - Weekly/Monthly based on diffDays
 * - Specific date otherwise
 */
function buildDateLabelOldStyle(startUtc: Date, endUtc: Date, offsetMinutes: number) {
  const startLocal = toUserLocalDate(startUtc, offsetMinutes);
  const endLocal = toUserLocalDate(endUtc, offsetMinutes);

  const today = toUserLocalDate(new Date(), offsetMinutes);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (startLocal.toDateString() === today.toDateString()) return "Today's";
  if (startLocal.toDateString() === yesterday.toDateString()) return "Yesterday's";

  const diffTime = Math.abs(endLocal.getTime() - startLocal.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 20) return 'Monthly';
  if (diffDays > 1) return 'Weekly';

  // default single day
  return startLocal.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

// =====================================================
// WhatsApp buttons (max 3) — ✅ NOW QUEUED (NO DIRECT API CALL)
// =====================================================
async function sendWhatsAppButtons3(to: string, bodyText: string, buttons: { id: string; title: string }[], jobId?: string) {
  await queueOutboundButtons(to, bodyText, (buttons || []).slice(0, 3), jobId);
}

// =====================================================
// Actor/Owner resolution (STAFF -> ownerId)
// =====================================================
async function resolveActorAndOwner(from: string) {
  // Try flexible lookup: exact, no-plus, or with-plus
  const clean = from.replace(/\+/g, '');
  const variants = [from, clean, `+${clean}`];
  
  // Remove duplicates
  const uniqueVariants = [...new Set(variants)];

  const actor = await User.findOne({ phoneNumber: { $in: uniqueVariants } });
  if (!actor) return { actor: null as any, owner: null as any, ownerId: null as any };

  if (actor.role === 'STAFF') {
    if (!actor.ownerId) return { actor, owner: null as any, ownerId: null as any };
    const owner = await User.findById(actor.ownerId);
    return { actor, owner, ownerId: owner?._id || null };
  }

  return { actor, owner: actor, ownerId: actor._id };
}

// =====================================================
// Button helpers
// =====================================================
function saleBtnId(action: 'UNDO' | 'RECEIPT' | 'CREDIT', txId: string) {
  return `SALEACT|${action}|${txId}`;
}

function invoiceBtnId(action: 'PAID' | 'CANCEL', invoiceId: string) {
  return `INVACT|${action}|${invoiceId}`;
}

function parseBtnText(rawText: string): { type: string; action: string; id: string } | null {
  if (!rawText.startsWith('__BTN__:')) return null;
  const parts = rawText.split(':'); // __BTN__:ID:TITLE
  const btnId = parts[1] || '';
  const seg = btnId.split('|'); // PREFIX|ACTION|ID
  
  if (seg[0] === 'SALEACT') {
      return { type: 'SALEACT', action: seg[1] || '', id: seg[2] || '' };
  }
  if (seg[0] === 'INVACT') {
      return { type: 'INVACT', action: seg[1] || '', id: seg[2] || '' };
  }
  
  return { type: 'GENERIC', action: '', id: btnId };
}

// =====================================================
// Receipt builder
// =====================================================
function buildReceiptText(tx: any, symbol: string, locale: string, businessName?: string, offsetMinutes = 60) {
  const local = toUserLocalDate(tx.timestamp, offsetMinutes);
  const when =
    `${local.toLocaleDateString(locale)} ` +
    `${local.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;

  const items = (tx.items || [])
    .map((i: any) => {
      const qty = Number(i.qty || 0);
      const unitPrice = Number(i.unitPrice || 0);
      const computed = qty * unitPrice;

      let lineTotal = i.total != null ? Number(i.total) : Number(computed);
      if (!Number.isFinite(lineTotal)) lineTotal = 0;

      return `• ${qty}${i.unit ? ` ${i.unit}` : ''} ${i.name} — ${symbol}${lineTotal.toLocaleString(locale)}`;
    })
    .join('\n');

  const total = `${symbol}${Number(tx.totalMoney || 0).toLocaleString(locale)}`;

  let statusLine = `✅ Status: PAID`;
  if (tx.paymentStatus === 'CREDIT') {
    statusLine = `💳 Status: CREDIT (Owes ${symbol}${Number(tx.balance || tx.totalMoney || 0).toLocaleString(locale)})`;
  } else if (tx.paymentStatus === 'PARTIAL') {
    statusLine =
      `💳 Status: PARTIAL (Paid ${symbol}${Number(tx.amountPaid || 0).toLocaleString(locale)}, ` +
      `Owes ${symbol}${Number(tx.balance || 0).toLocaleString(locale)})`;
  }

  const undoneLine = tx.isUndone ? `\n⚠️ *This sale was UNDONE*` : '';
  return `🧾 *${businessName || 'Receipt'}*\n📅 ${when}\n\n${items || '_No items_'}\n\n💰 Total: ${total}\n${statusLine}${undoneLine}`;
}

// =====================================================
// Undo by txId
// =====================================================
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function undoSaleById(txUserId: any, inventoryOwnerId: any, txId: string, undoMessageId: string) {
  const tx = await Transaction.findOne({ _id: txId, user: txUserId, type: 'SALE' });
  if (!tx) return { ok: false, message: 'Sale not found.' };
  if (tx.isUndone) return { ok: false, message: 'Already undone.' };

  tx.isUndone = true;
  tx.undoneAt = new Date();
  tx.undoneByMessageId = undoMessageId;
  await tx.save();

  const items: any[] = (tx as any).items || [];
  for (const it of items) {
    const name = String(it.name || '').trim();
    const qty = Number(it.qty || 0);
    if (!name || qty <= 0) continue;

    await Inventory.updateOne(
      { user: inventoryOwnerId, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } },
      { $inc: { quantity: qty } }
    );
  }

  return { ok: true, message: `✅ Undone sale: ${items.length} item(s) restored back to stock.` };
}

// =====================================================
// Mark CREDIT by txId
// =====================================================
async function markSaleCredit(txUserId: any, txId: string) {
  const tx = await Transaction.findOne({ _id: txId, user: txUserId, type: 'SALE' });
  if (!tx) return { ok: false, msg: 'Sale not found.' };
  if (tx.isUndone) return { ok: false, msg: 'That sale was already undone.' };

  tx.paymentStatus = 'CREDIT';
  tx.amountPaid = 0;
  tx.balance = Number(tx.totalMoney || 0);
  tx.settledAt = null;
  await tx.save();

  const needsName = !tx.customerName;
  return {
    ok: true,
    msg: needsName ? `💳 Marked as CREDIT.\n\nWho owes you? Reply like: *credit John*` : `💳 Marked as CREDIT for *${tx.customerName}*.`,
  };
}

// =====================================================
// Attach "credit John" to latest credit sale missing name
// =====================================================
export async function attachCreditNameToLatest(
  actorId: any,
  shopId: any,
  rawName: string
): Promise<{ ok: boolean; msg: string }> {
  const name = String(rawName || '').trim();
  if (!name) return { ok: false, msg: 'Reply like: credit John' };

  const tx = await Transaction.findOne({
    user: actorId,
    type: 'SALE',
    isUndone: { $ne: true },
    paymentStatus: 'CREDIT',
    $or: [{ customerName: null }, { customerName: '' }, { customerName: { $exists: false } }],
  }).sort({ timestamp: -1 });

  if (!tx) return { ok: false, msg: 'No pending credit sale found.' };

  const res = await resolveDebtor(shopId, name);

  if (res.status === 'suggest') {
    const list = res.options.map((o, i) => `${i + 1}) ${o.displayName}`).join('\n');
    return {
      ok: false,
      msg: `I see similar names. Reply the correct number:\n\n${list}\n\nOr type the full name again (add surname).`,
    };
  }

  let debtorId: any = null;
  let displayName = name;
  let debtorKey = normName(name);

  if (res.status === 'new') {
    const created = await Debtor.create({
      user: shopId,
      displayName: res.displayName,
      debtorKey: res.debtorKey,
      aliases: [res.debtorKey],
      totalDebt: 0,
      lastProductStr: '',
    });
    debtorId = created._id;
    displayName = created.displayName;
    debtorKey = created.debtorKey;
  } else {
    debtorId = res.debtorId;
    displayName = res.displayName;
    debtorKey = res.debtorKey;
  }

  tx.debtorId = debtorId;
  tx.customerName = displayName;
  tx.customerKey = debtorKey;
  await tx.save();

  await Debtor.findByIdAndUpdate(debtorId, {
    $inc: { totalDebt: Number(tx.totalMoney || 0) },
    $set: { lastProductStr: (tx.items || []).map((i: any) => `${i.qty} ${i.name}`).join(', ') },
  });

  return { ok: true, msg: `✅ Credit linked to *${displayName}*.` };
}


// =====================================================
// Allowlist parsed
// =====================================================
function allowlistParsed(parsed: any) {
  if (!parsed || typeof parsed !== 'object') {
    return {
      intent: 'UNKNOWN',
      items: [],
      report_params: { start_date: null, end_date: null, category_filter: null, include_undone: false },
      settings_update: { key: null, value: null },
      reply_text: '',
    };
  }

  parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
  parsed.report_params = parsed.report_params || {};
  parsed.report_params.start_date ??= null;
  parsed.report_params.end_date ??= null;
  parsed.report_params.category_filter ??= null;
  parsed.report_params.include_undone ??= false;

  parsed.settings_update = parsed.settings_update || { key: null, value: null };
  parsed.reply_text = typeof parsed.reply_text === 'string' ? parsed.reply_text : '';
  return parsed;
}


// =====================================================
// 1) VERIFY WEBHOOK
// =====================================================
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

// =====================================================
// 2) FAST RECEIVER (ACK + queue)
// =====================================================
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
    const profileName: string | undefined = value.contacts?.[0]?.profile?.name;

    let text = '';
    let mediaId: string | undefined;
    let isVoiceMessage = false;

    switch (msg.type) {
      case 'text':
        text = msg.text.body;
        break;

      case 'interactive': {
        const btnId = msg?.interactive?.button_reply?.id;
        const btnTitle = msg?.interactive?.button_reply?.title;
        if (!btnId) return res.sendStatus(200);
        text = `__BTN__:${btnId}:${btnTitle || ''}`;
        break;
      }

      case 'button': {
        const btnId = msg?.button?.payload || msg?.button?.text;
        if (!btnId) return res.sendStatus(200);
        text = `__BTN__:${btnId}:${msg?.button?.text || ''}`;
        break;
      }

      case 'image':
        text = msg.image.caption || 'Analyze this image';
        mediaId = msg.image.id;
        break;

      case 'audio':
        text = 'Analyze this audio';
        mediaId = msg.audio.id;
        isVoiceMessage = true;
        break;

      case 'contacts': {
        const contact = msg.contacts?.[0];
        if (contact) {
          const name = contact.name?.formatted_name || contact.name?.first_name || 'Staff';
          const phone = contact.phones?.[0]?.phone || contact.phones?.[0]?.wa_id;
          if (phone) {
             text = `Add staff ${name} ${phone}`;
          }
        }
        break;
      }

      default:
        console.log(`Unsupported message type: ${msg.type}`);
        return res.sendStatus(200);
    }

    if (!text && !mediaId) return res.sendStatus(200);

    // ✅ ACK FAST
    res.sendStatus(200);

    // ✅ Queue inbound processing
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

// =====================================================
// 3) BACKGROUND LOGIC
// =====================================================
const SAFE_TEXT_MAX = 1000;

function cleanTextForSecurity(input: string) {
  let s = String(input || '').slice(0, SAFE_TEXT_MAX);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// =====================================================
// Staff add helper
// =====================================================
function normalizePhone(raw: string) {
  return String(raw || '').replace(/\D/g, '').trim();
}

async function addStaffUnderOwner(owner: any, staffPhoneRaw?: string | null, staffName?: string | null) {
  let staffPhoneDigits = normalizePhone(staffPhoneRaw || ''); // e.g., "18599189638" from "+1 (859) 918-9638"
  if (!staffPhoneDigits) return { ok: false, msg: 'Reply with staff number (e.g. +2348123456789).' };

  let finalStaffPhoneNumber = staffPhoneDigits;
  let finalStaffCountryCodeAlpha = '';

  // Map for numeric country codes
  const numericCcMap: Record<string, string> = {
      NG: '234', US: '1', GB: '44', GH: '233', KE: '254', ZA: '27', IN: '91',
      BJ: '229', TG: '228', CM: '237', GQ: '240', CA: '1', IE: '353',
      // Add more as needed
  };

  // 1. Try to infer country from the staffPhoneDigits itself (e.g., "US" from "1859...")
  const inferredStaffCountryAlpha = guessCountryFromPhone(staffPhoneDigits); 
  
  // If `guessCountryFromPhone` infers a non-default country (i.e. not 'NG' unless it's explicitly an NG number)
  // or if the number is sufficiently long to imply an international format.
  // The 'NG' default in guessCountryFromPhone can be tricky, so we check length too.
  if (inferredStaffCountryAlpha !== 'NG' || (inferredStaffCountryAlpha === 'NG' && staffPhoneDigits.startsWith('234')) || staffPhoneDigits.length > 10) {
    finalStaffCountryCodeAlpha = inferredStaffCountryAlpha;
  } else {
    // If it's ambiguous or looks like a local number, default to owner's country code
    finalStaffCountryCodeAlpha = owner.countryCode || guessCountryFromPhone(owner.phoneNumber);
  }

  const targetNumericCc = numericCcMap[finalStaffCountryCodeAlpha] || '234'; // Fallback to '234' if owner's CC is also unknown

  // If staffPhone starts with '0', remove it (common local dialing prefix in some countries)
  if (finalStaffPhoneNumber.startsWith('0')) {
    finalStaffPhoneNumber = finalStaffPhoneNumber.substring(1);
  }

  // Only prepend the target numeric CC if the number doesn't already start with it
  // This prevents adding '234' to a '1859...' number.
  if (!finalStaffPhoneNumber.startsWith(targetNumericCc)) {
    finalStaffPhoneNumber = `${targetNumericCc}${finalStaffPhoneNumber}`;
  }

  // Ensure no '+' sign (should already be removed by normalizePhone, but good for safety)
  finalStaffPhoneNumber = finalStaffPhoneNumber.replace('+', '');

  // Look for existing staff/user based on the *final normalized phone number*
  const existing = await User.findOne({ phoneNumber: finalStaffPhoneNumber });
  if (existing) {
    if (existing.role !== 'STAFF') return { ok: false, msg: 'That number is already registered as a shop owner.' };

    existing.ownerId = owner._id;
    existing.businessName = owner.businessName;
    existing.subscriptionStatus = owner.subscriptionStatus;
    existing.planType = owner.planType;
    existing.registrationStage = 'COMPLETED';
    existing.countryCode = finalStaffCountryCodeAlpha; // Update country code
    await existing.save();

    return { ok: true, msg: `✅ Staff linked: ${finalStaffPhoneNumber}` };
  }

  await User.create({
    phoneNumber: finalStaffPhoneNumber, // Use the cleaned and prefixed number
    role: 'STAFF',
    ownerId: owner._id,
    businessName: owner.businessName,
    name: staffName || 'Staff',
    countryCode: finalStaffCountryCodeAlpha, // Use the inferred/owner's country code
    registrationStage: 'COMPLETED',
    subscriptionStatus: owner.subscriptionStatus || 'trial',
    trialEndsAt: owner.trialEndsAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    planType: owner.planType || 'TYCOON',
    messageHistory: [],
    settings: owner.settings || {
      dailySummaryEnabled: false,
      closingTime: '20:00',
      utcOffsetMinutes: 60,
      language: 'English',
      pdfReportsEnabled: true,
    },
  });

  await queueOutboundMessage(
    finalStaffPhoneNumber, // Send message to the new, correctly formatted number
    `✅ You have been added as *STAFF* for *${owner.businessName || 'TallyPadi Shop'}*.\nYou can now record sales and view reports on WhatsApp.`
  );

  return { ok: true, msg: `✅ Staff added: ${finalStaffPhoneNumber}` };
}

// =====================================================
// Main handler
// =====================================================
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
    const btn = parseBtnText(rawText);

    // =====================================================
    // 🕵️ SUPPORT AGENT INTERCEPT (High Priority)
    // Check if sender is an Agent operating via WhatsApp
    // =====================================================
    
    // 1. Handle Agent Buttons
    if (btn && btn.id.startsWith('AGENT_')) {
        const agent = await SupportAgent.findOne({ phoneNumber: from });
        if (agent) {
            if (btn.id.startsWith('AGENT_ACCEPT_')) {
                const ticketId = btn.id.replace('AGENT_ACCEPT_', '');
                await supportService.acceptTicketViaWhatsApp(String(agent._id), ticketId);
            } else if (btn.id === 'AGENT_BUSY') {
                // Just silent ack or mark busy status?
                // await supportService.setAgentStatus(agent._id, 'BUSY'); 
                await queueOutboundMessage(from, "👍 Marked busy for now.");
            }
            return;
        }
    }

    // 2. Handle Agent Chat / Commands
    // This returns true if `from` was found in SupportAgent table and processed
    const isAgentAction = await supportService.handleAgentWhatsAppMessage(from, rawText);
    if (isAgentAction) return;


    // =====================================================
    // 🚨 SUPPORT USER INTERCEPT (User seeking help)
    // =====================================================
    const activeTicket = await SupportTicket.findOne({
        userPhone: from,
        status: { $in: ['QUEUED', 'ASSIGNED', 'ACTIVE'] }
    });

    if (activeTicket) {
        // Check for User End Chat
        const isEndCmd = 
             rawText.toLowerCase() === 'end chat' || 
             rawText.toLowerCase() === 'stop chat' || 
             rawText.toLowerCase() === 'end support' ||
             ['leave', 'quit', 'exit', 'cancel'].includes(rawText.toLowerCase()) ||
             (btn && (btn.id === 'CMD_END_CHAT' || btn.id === 'END_CHAT'));

        if (isEndCmd) {
             await supportService.endTicketByUser(from);
             await queueOutboundMessage(from, '✅ Support chat ended. You can continue using TallyPadi normally.');
             return;
        }

        // Clean text for support chat if it's a button
        let supportText = rawText;
        if (rawText.startsWith('__BTN__:')) {
             // __BTN__:ID:TITLE
             const parts = rawText.split(':');
             if (parts.length >= 3) {
                 supportText = parts.slice(2).join(':') || parts[1]; // Use Title, fallback to ID
             } else {
                 supportText = parts[1] || rawText;
             }
        }

        // Safety Valve: detailed warning if they try to use bot commands
        if (/^(sold|stock|help|menu|report|receipt|inv|create|list|update)/i.test(supportText)) {
            await queueOutboundMessage(from, `⚠️ You are in a support chat. To use the bot, type *'end chat'* first.`);
        }

        // If it's a "Close Ticket" command from user, maybe handle it? 
        // For now, pass everything to support service.
        await supportService.handleInboundMessage(from, supportText, messageId, profileName);
        return; 
    }

    // --- limits ---
    let MAX_HISTORY = 5;
    try {
      const globalSettings = await AdminSettings.findOne().lean();
      MAX_HISTORY = globalSettings?.limits?.maxMessageHistory || 5;
    } catch {}

    // --- media ---
    let imageBuffer: string | undefined;
    let imageMime: string | undefined;
    if (mediaId) {
      const media = await getMediaBuffer(mediaId);
      if (media) {
        imageBuffer = media.data;
        imageMime = media.mimeType;
      }
    }

    // ✅ resolve actor + owner
    let { actor, owner, ownerId } = await resolveActorAndOwner(from);

    // ✅ create first-time OWNER
    if (!actor) {
      const initialShopName = profileName || 'My Shop';
      const countryCode = guessCountryFromPhone(from);

      actor = await User.create({
        phoneNumber: from,
        role: 'OWNER',
        businessName: initialShopName,
        name: profileName,
        countryCode,

        registrationStage: 'EMAIL',
        subscriptionStatus: 'trial',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),

        planType: 'TYCOON',
        messageHistory: [],
        settings: {
          dailySummaryEnabled: false,
          closingTime: '20:00',
          utcOffsetMinutes: 60,
          language: 'English',
          pdfReportsEnabled: true,
        },
      });

      owner = actor;
      ownerId = actor._id;

      await queueOutboundButtons(
        from,
        `Welcome to *Tallypadi*, ${profileName || 'Friend'}! 👋\n\nTo start, please choose an option:`,
        [
          { id: 'CMD_REGISTER', title: 'Register' },
          { id: 'CMD_HELP', title: 'Help' },
          { id: 'CMD_SHOW_SETTINGS', title: 'Show My Settings' },
        ]
      );
      return;
    }

    // ✅ staff safety
    if (actor.role === 'STAFF') {
      if (!owner || !ownerId) {
        await queueOutboundMessage(from, `❌ This staff account has no owner linked. Ask owner to re-add you.`);
        return;
      }
      actor.registrationStage = 'COMPLETED';
    }

    // ✅ owner registration
    if (actor.role === 'OWNER' && actor.registrationStage !== 'COMPLETED') {
      
      // 1. Handle "Register" button
      if (btn?.id === 'CMD_REGISTER') {
          await queueOutboundMessage(from, "To start, reply with your *EMAIL ADDRESS*.");
          return;
      }

      // 2. Allow bypass for Help/Settings/Support
      const isSafeCmd = 
          btn?.id === 'CMD_HELP' || 
          btn?.id === 'CMD_SHOW_SETTINGS' || 
          btn?.id === 'CMD_SUPPORT';

      if (!isSafeCmd) {
          if (actor.registrationStage === 'EMAIL') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(rawText)) {
              await queueOutboundMessage(from, '❌ Invalid email format.');
              return;
            }

            const existingUser = await User.findOne({ email: rawText });
            if (existingUser) {
              await queueOutboundMessage(from, '❌ This email is already registered. Please provide a different email address.');
              return;
            }

            actor.email = rawText;
            actor.registrationStage = 'PASSWORD';
            await actor.save();

            await queueOutboundMessage(from, `✅ Email Saved! Now reply with a *SECRET PASSWORD (min 8 chars)*.`);
            return;
          }

          if (actor.registrationStage === 'PASSWORD') {
            if (rawText.length < 8) {
              await queueOutboundMessage(from, '❌ Password too short (min 8 chars).');
              return;
            }
            const salt = await bcrypt.genSalt(10);
            actor.password = await bcrypt.hash(rawText, salt);
            actor.registrationStage = 'COMPLETED';
            await actor.save();

            const { generateWelcomeMessage } = await import('../services/gemini.service');
            const welcomeMsg = await generateWelcomeMessage(actor.settings?.language || 'English');
            
            await queueWelcomeResponse(
              from,
              welcomeMsg,
              'https://tallypadi.com/login'
            );
            return;
          }
      }
    }

    // ✅ suspension check
    const shopUser = owner || actor;
    if (shopUser.subscriptionStatus === 'suspended') {
      await queueOutboundMessage(from, `🛑 Account suspended.\nReason: ${shopUser.suspensionReason || 'Security policy'}`);
      return;
    }

    // ✅ subscription check uses OWNER if staff
    const allowed = await checkSubscriptionStatus(shopUser);
    if (!allowed) return;

    // ✅ store history per actor
    actor.messageHistory = actor.messageHistory || [];
    if (actor.messageHistory.length >= MAX_HISTORY) actor.messageHistory.shift();
    actor.messageHistory.push(rawText);
    actor.lastSeen = new Date(); // ✅ Update last activity
    await actor.save();

    const { symbol, locale, code } = getUserCurrency(shopUser);
    const shopId = ownerId || actor._id;

    const offsetMinutes = shopUser?.settings?.utcOffsetMinutes ?? 60;
    const todayKey = toISODateForOffset(offsetMinutes);

    // =====================================================
    // ✅ BUTTON fast path
    // =====================================================
    // const btn = parseBtnText(rawText); // Removed duplicate declaration

    if (btn) {
      // ✅ SALE ACTIONS
      if (btn.type === 'SALEACT') {
        if (btn.action === 'RECEIPT') {
          await queueOutboundMessage(from, '🧾 Generating receipt PDF…');
          await queueSaleReceipt(
            from,
            String(actor._id),
            String(btn.id),
            `receipt_${btn.id}_${messageId}`
          );
          return;
        }

        if (btn.action === 'CREDIT') {
          const r = await markSaleCredit(actor._id, btn.id);
          await queueOutboundMessage(from, r.msg);
          return;
        }

        if (btn.action === 'UNDO') {
          const r = await undoSaleById(actor._id, shopId, btn.id, messageId);
          await queueOutboundMessage(from, r.message);
          return;
        }
      }

      // ✅ INVOICE BUTTONS
      if (btn.type === 'INVACT') {
          const action = btn.action;
          const invId = btn.id;

          const inv = await Invoice.findById(invId);
          if (!inv) {
              await queueOutboundMessage(from, "⚠️ Invoice not found.");
              return;
          }

          if (action === 'CANCEL') {
              inv.status = 'CANCELLED';
              await inv.save();
              await queueOutboundMessage(from, `🚫 Invoice *${inv.invoiceNumber}* cancelled.`);
              return;
          }

          if (action === 'PAID') {
              if (inv.status === 'PAID') {
                 await queueOutboundMessage(from, "✅ This invoice is already marked as PAID.");
                 return;
              }

              // 1. Mark Invoice Paid
              inv.status = 'PAID';
              await inv.save();

              // 2. Record Sale Transaction
              const now = new Date();
              const todayString = toISODateForOffset(actor.settings?.utcOffsetMinutes ?? 60);

              await Transaction.create({
                  user: actor._id,
                  type: 'SALE',
                  paymentStatus: 'PAID',
                  items: inv.items.map(i => ({
                      name: i.name,
                      qty: i.qty,
                      unit: i.unit || 'pcs',
                      unitPrice: i.unitPrice,
                      total: i.total
                  })),
                  totalMoney: inv.totalAmount,
                  amountPaid: inv.totalAmount,
                  balance: 0,
                  customerName: inv.customerName,
                  date: todayString,
                  timestamp: now,
                  messageId: `inv_${invId}_paid`,
              });

              // 3. Update Stats
              await DailyStats.findOneAndUpdate(
                { user: actor._id, date: todayString },
                { $inc: { totalRevenue: inv.totalAmount, totalTransactions: 1 } },
                { upsert: true }
              );

              await queueOutboundMessage(from, `✅ Payment Received!\nRecorded sale of *${symbol}${inv.totalAmount.toLocaleString(locale)}* for *${inv.customerName}*.`);
              return;
          }
      }

      // ✅ GENERIC COMMANDS (CMD_) -> fall through
      if (btn.type === 'GENERIC' && btn.id.startsWith('CMD_')) {
          // Do nothing, let it proceed to next logic blocks
      } else {
          await queueOutboundMessage(from, 'Unknown action.');
          return;
      }
    }


    // =====================================================
    // ✅ quick command: "credit John"
    // =====================================================
    const creditNameMatch = rawText.match(/^credit\s+(.+)$/i);
    if (creditNameMatch?.[1]) {
      const r = await attachCreditNameToLatest(actor._id, shopId, creditNameMatch[1]);
      await queueOutboundMessage(from, r.msg);
      return;
    }

    // =====================================================
    // 🧠 PARSE WITH GEMINI (or Manual Override)
    // =====================================================
    const currentLang = (shopUser.settings?.language || 'English') as string;
    const contextHistory = actor.messageHistory || [];

    let parsed: any;

    if (btn && btn.id.startsWith('CMD_')) {
        if (btn.id === 'CMD_HELP') {
            const { parseMessageWithGemini } = await import('../services/gemini.service');
            parsed = await parseMessageWithGemini('help', currentLang);
        }
        else if (btn.id === 'CMD_SHOW_SETTINGS') parsed = { intent: 'SHOW_SETTINGS' };
        else if (btn.id === 'CMD_SUPPORT') parsed = { intent: 'SUPPORT' };
        else if (btn.id === 'CMD_FAQ') parsed = { intent: 'FAQ' };
        
        // Settings Toggles
        else if (btn.id === 'CMD_SET_PDF_ON') parsed = { intent: 'SETTINGS', settings_update: { key: 'pdfReportsEnabled', value: true }, reply_text: '✅ PDF reports enabled.' };
        else if (btn.id === 'CMD_SET_PDF_OFF') parsed = { intent: 'SETTINGS', settings_update: { key: 'pdfReportsEnabled', value: false }, reply_text: '✅ PDF reports disabled.' };
        else if (btn.id === 'CMD_SET_DAILY_ON') parsed = { intent: 'SETTINGS', settings_update: { key: 'dailySummaryEnabled', value: true }, reply_text: '🔔 Daily summary enabled.' };
        else if (btn.id === 'CMD_SET_DAILY_OFF') parsed = { intent: 'SETTINGS', settings_update: { key: 'dailySummaryEnabled', value: false }, reply_text: '🔕 Daily summary disabled.' };

        else if (btn.id === 'CMD_CREATE_INVOICE') parsed = { intent: 'CREATE_INVOICE', needs_clarification: true, reply_text: "To create an invoice, I need details. Example: 'Invoice for John, 2 shoes for 50k'." };

        parsed = allowlistParsed(parsed);
    } else {
        const { parseMessageWithGemini } = await import('../services/gemini.service');
        parsed = await parseMessageWithGemini(rawText, currentLang, contextHistory, imageBuffer, imageMime);
        parsed = allowlistParsed(parsed);
        parsed = normalizeSettingsUpdate(parsed);
    }


    // =====================================================
    // ✅ undone scope
    // =====================================================
    const includeUndoneRequestedByOwner =
      actor.role === 'OWNER' && ownerRequestedUndoneHistory(rawText, parsed);

    // =====================================================
    // ✅ DATE PARSING (yesterday/year/specific-date)
    // =====================================================
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let dateLabel = "Today's";

    const rp: any = parsed?.report_params || {};
    const startRaw = rp?.start_date ?? rp?.from ?? rp?.date ?? rp?.year ?? null;
    const endRaw = rp?.end_date ?? rp?.to ?? (rp?.year ? rp?.year : null) ?? null;

    if (startRaw || endRaw) {
      const s = parseReportDateToUtc(startRaw || endRaw, offsetMinutes, false);
      const e = parseReportDateToUtc(endRaw || startRaw || endRaw, offsetMinutes, true);

      if (s && e) {
        startDate = s;
        endDate = e;
        dateLabel = buildDateLabelOldStyle(startDate, endDate, offsetMinutes);
      }
    }

    // CLOSE_BOOK -> Yesterday (if morning)
    if (parsed?.intent === 'CLOSE_BOOK') {
      const nowLocal = toUserLocalDate(new Date(), offsetMinutes);
      const currentHour = nowLocal.getHours();

      if (currentHour < 12) {
        const y = new Date(nowLocal);
        y.setDate(y.getDate() - 1);
        y.setHours(0, 0, 0, 0);

        const yUtc = new Date(y.getTime() - offsetMinutes * 60_000);

        startDate = yUtc;
        endDate = new Date(yUtc);
        endDate.setHours(23, 59, 59, 999);

        dateLabel = "Yesterday's (Closed)";
        await queueOutboundMessage(from, '💡 Closing book for *Yesterday* (since it is morning).');
      }

      parsed.intent = 'REPORT_FULL';
    }

    // Always use UTC range for services (prevents empty results)
    const { startUtc, endUtc } = getUtcRangeForUser(offsetMinutes, startDate, endDate);

    // =====================================================
    // 🚦 ROUTING
    // =====================================================
    switch (parsed.intent) {
      case 'SALE': {
        // ✅ STOP: If clarification needed, ask user first (don't process partial sale)
        if (parsed.needs_clarification) {
          await queueOutboundMessage(from, parsed.reply_text);
          break;
        }

        await processTransaction(shopId as any, parsed, messageId, actor);

       
        const tx = await Transaction.findOne({ user: actor._id, messageId }).lean();
        if (tx?._id) {
          const txId = String(tx._id);
          const body = `After sale:\nChoose action 👇`;

          try {
            await queueSaleResponse(
  from,
  parsed.reply_text || '✅ Sale recorded.',
  'After sale:\nChoose action 👇',
  [
    { id: saleBtnId('UNDO', txId), title: '↩️ Delet This Sale' },
    { id: saleBtnId('RECEIPT', txId), title: '🧾 Receipt' },
    { id: saleBtnId('CREDIT', txId), title: '💳 Sold As Credit' },
  ],
  `sale_${messageId}`
);

          } catch (e) {
            console.error('❌ Failed to queue buttons:', e);
          }
        }
        break;
      }

      case 'RESTOCK':
      case 'SET_STOCK':
      case 'DELETED_STOCK':
      case 'DEFINE_PRICE':
      case 'PRICE_CHECK':
      case 'DEBT_PAYMENT': {
        // ✅ STOP: If clarification needed, ask user first
        if (parsed.needs_clarification) {
          await queueOutboundMessage(from, parsed.reply_text);
          break;
        }

        try {
    await processTransaction(shopId as any, parsed, messageId, actor);

    await queueOutboundMessage(from, parsed.reply_text || '✅ Done.');
      } catch (e) {
        console.error('processTransaction error:', e);
        await queueOutboundMessage(from, '⚠️ Sorry—something went wrong. Please try again.');
      }
      break;
    }

      case 'DELETE_ALL_INVENTORY': {
        if (actor.role !== 'OWNER') {
          await queueOutboundMessage(from, '❌ Only the shop owner can delete all inventory.');
          break;
        }

        if (parsed.needs_clarification) {
          await queueOutboundMessage(
            from,
            parsed.reply_text ||
              '⚠️ Are you sure you want to delete ALL inventory? This cannot be undone.\n\nReply *YES DELETE ALL* to confirm.'
          );
          break;
        }

        try {
          const result = await Inventory.deleteMany({ user: shopId });
          await queueOutboundMessage(from, `✅ All inventory deleted. Removed ${result.deletedCount} items.`);
        } catch (e) {
          console.error('DELETE_ALL_INVENTORY error:', e);
          await queueOutboundMessage(from, '❌ Failed to delete inventory. Please try again.');
        }
        break;
      }

      case 'UNDO_LAST_SALE': {
        const r = await undoLastSale(shopId, messageId);
        await queueOutboundMessage(from, r.message);
        break;
      }

      case 'REPORT_RECENT': {
        const limit = parsed.items?.[0]?.qty || 10;
        const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);

        await queueOutboundMessage(from, `🔎 Fetching last ${safeLimit} transactions...`);

        // ✅ FIX: Use actor to determine scope (Staff sees OWN, Owner sees SHOP)
        const scope = actor.role === 'OWNER' ? 'SHOP' : 'OWN';
        const relevantIds = await getRelevantUserIds(actor, scope);

        const recentTx = await Transaction.find({
          user: { $in: relevantIds },
          type: 'SALE',
          ...buildUndoneFilter(includeUndoneRequestedByOwner),
        })
          .sort({ createdAt: -1 })
          .limit(safeLimit)
          .populate('user', 'name role phoneNumber businessName') // ✅ Populate user to get staff name & shop name
          .lean();

        if (!recentTx.length) {
          await queueOutboundMessage(from, 'No sales found.');
          break;
        }

        let out = `🕒 *Last ${safeLimit} Sales*${suffixReportScope(includeUndoneRequestedByOwner)}:\n\n`;
        recentTx.forEach((t) => {
          const transactingUser = t.user as IUser;
          const local = toUserLocalDate(t.timestamp, offsetMinutes);
          const timeStr = local.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          const money = `${symbol}${Number(t.totalMoney || 0).toLocaleString(locale)}`;
          const itemsStr = (t.items || []).map((i: any) => `${i.name} (${i.qty})`).join(', ');
          const undoneTag = t.isUndone ? ' ⚠️UNDONE' : '';
          
          let soldBy = '';
          if (transactingUser) {
            if (transactingUser.role === 'STAFF') soldBy = ` (Sold by ${transactingUser.name})`;
            else if (transactingUser.role === 'OWNER') soldBy = ` (Sold by ${transactingUser.businessName || 'Shop'})`;
          }

          out += `• *${itemsStr}*\n  — ${money} (${timeStr})${soldBy}${undoneTag}\n\n`; // Improved spacing
        });

        await queueOutboundMessage(from, out);

        // PDF (default FULL for recent)
        await sendPdfIfTycoon({
          user: actor, // ✅ Generate PDF for actor (restricted scope if staff)
          from,
          type: 'FULL',
          dateLabel: `${dateLabel}${suffixReportScope(includeUndoneRequestedByOwner)}`,
          startUtc,
          endUtc,
        });

        break;
      }

      case 'REPORT_SALES': {
  await queueOutboundMessage(from, `Calculating ${String(dateLabel || "Today's").toLowerCase()} report... ⏳`);

  // ✅ 1) Get the correct UTC range for the user's requested period
  const { startUtc, endUtc } = getUtcRangeForUser(offsetMinutes, startDate, endDate);

  // ✅ FIX: Use actor to determine scope (Staff sees OWN, Owner sees SHOP)
  const scope = actor.role === 'OWNER' ? 'SHOP' : 'OWN';
  const relevantIds = await getRelevantUserIds(actor, scope);

  // ✅ 2) Pull transactions (so we can decide empty BEFORE doing anything else)
  const salesTx = await Transaction.find({
    user: { $in: relevantIds },
    type: 'SALE',
    timestamp: { $gte: startUtc, $lte: endUtc },
    ...buildUndoneFilter(includeUndoneRequestedByOwner),
  })
    .sort({ timestamp: 1 })
    .populate('user', 'name role phoneNumber businessName') // ✅ Populate user to get staff name & shop name
    .lean();

  // ✅ 3) If empty: do NOT generate PDF, do NOT continue
  if (!salesTx.length) {
    await queueOutboundMessage(from, `📭 No sales found for *${dateLabel}*.`);
    break;
  }

  // ✅ 4) Use same service as old version for correct totals/summary
  // ✅ FIX: Pass actor._id so summary matches the restricted sales list
  const summary = await getDailySummary(actor._id as any, startUtc, endUtc);

  const totalFormatted = Number(summary?.totalRevenue || 0).toLocaleString(locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  });

  // Calculate Profit
  let totalProfit = 0;
  let hasCostData = false;

  salesTx.forEach((tx: any) => {
    if (tx.isUndone) return;
    (tx.items || []).forEach((it: any) => {
      const sp = Number(it.unitPrice || 0);
      const cp = Number(it.costPrice || 0);
      const q = Number(it.qty || 0);
      if (cp > 0) {
        totalProfit += (sp - cp) * q;
        hasCostData = true;
      }
    });
  });

  // ✅ 5) Build breakdown message (from salesTx — consistent with undone filter)
  let salesMsg = `📅 *${dateLabel} Sales Breakdown*${suffixReportScope(includeUndoneRequestedByOwner)}\n\n`;

  salesTx.forEach((tx) => {
    const transactingUser = tx.user as IUser;
    const local = toUserLocalDate(tx.timestamp, offsetMinutes);
    const dateTimeStr =
  local.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) +
  ' ' +
  local.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    const undoneTag = tx.isUndone ? ' ⚠️UNDONE' : '';
    
    let soldBy = '';
    if (transactingUser) {
      if (transactingUser.role === 'STAFF') soldBy = ` (Sold by ${transactingUser.name})`;
      else if (transactingUser.role === 'OWNER') soldBy = ` (Sold by ${transactingUser.businessName || 'Shop'})`;
    }

    // salesMsg += `--- Sale ID: ${tx._id} ---\n`; // Removed per request

    const itemsArr = tx.items || [];
    itemsArr.forEach((it: any) => {
      const qty = Number(it.qty || 0);
      const unitPrice = Number(it.unitPrice || 0);

      // ✅ fallback for line total
      let line =
        it.total != null && Number.isFinite(Number(it.total))
          ? Number(it.total)
          : qty * unitPrice;

      // ✅ FIX: If line is 0 (e.g. "total" price used) and it's a single item, use the transaction total
      if (line === 0 && itemsArr.length === 1 && (tx.totalMoney || 0) > 0) {
        line = Number(tx.totalMoney);
      }

      salesMsg += `• ${it.name} (${qty}${it.unit ? ' ' + it.unit : ''}) — ${symbol}${Number(line || 0).toLocaleString(locale)}${undoneTag}\n`;
    });
    salesMsg += `  Time: ${dateTimeStr}${soldBy}\n\n`;
  });

  salesMsg += `\n💰 *Total Money:* ${totalFormatted}`;
  if (hasCostData) {
    const pLabel = totalProfit >= 0 ? 'Profit' : 'Loss';
    const pVal = totalProfit.toLocaleString(locale, { style: 'currency', currency: code });
    salesMsg += `\n📈 *Est. ${pLabel}:* ${pVal}`;
  }
  salesMsg += `\n📉 *Total Transactions:* ${salesTx.length}`;

  await queueOutboundMessage(from, salesMsg);

  // ✅ Auto-send PDF for TYCOON users who enabled PDF reports
  if (String(shopUser?.planType || '').toUpperCase() === 'TYCOON' && shopUser?.settings?.pdfReportsEnabled === true) {
    try {
      await queueOutboundMessage(from, '📄 Generating your SALES PDF...');

      // ✅ Add "Generated date + time" in user's local timezone
      const nowLocal = toUserLocalDate(new Date(), offsetMinutes);
      const generatedAt =
        nowLocal.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: '2-digit' }) +
        ' ' +
        nowLocal.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

      // ✅ Label that appears in PDF header (depending on your pdf.service implementation)
      const pdfLabel =
        `Sales Report — ${dateLabel}${suffixReportScope(includeUndoneRequestedByOwner)}\n` +
        `Generated: ${generatedAt}`;

      const pdfFileName = await generatePdfReport(
        actor._id as any, // ✅ Generate PDF for actor (restricted scope)
        'SALES', // ✅ important: match sales report type
        pdfLabel,
        startUtc,
        endUtc
      );

      await queueOutboundMessage(from, `📄 PDF: ${REPORT_BASE_URL}${pdfFileName}`);
    } catch (e) {
      console.error('PDF gen error (REPORT_SALES):', e);
      await queueOutboundMessage(from, '⚠️ Could not generate PDF right now. Please try again.');
    }
  }

  break;
}


      case 'REPORT_STOCK': {
        await queueOutboundMessage(from, 'Checking inventory... 📦');

        const targetItem = parsed.items?.length ? parsed.items[0].name : null;
        const stockList = await getStockReport(shopId as any, targetItem);

        if (!stockList.length) {
          await queueOutboundMessage(from, 'Inventory empty or item not found.');
          break;
        }

        let stockMsg = `📦 *Current Stock Balance*\n\n`;
        let hasNegative = false;

        stockList.forEach((it: any) => {
          if (Number(it.quantity || 0) < 0) {
            hasNegative = true;
            stockMsg += `• ${it.name}: ⚠️ *${Math.abs(it.quantity)}* (Oversold/Not Recorded)\n`;
          } else {
            stockMsg += `• ${it.name}: *${it.quantity}* remaining\n`;
          }
        });

        if (hasNegative) stockMsg += `\n_Note: Some items show negative numbers. Please update me when you restock._`;

        await queueOutboundMessage(from, stockMsg);

        // PDF for stock: safest is FULL
        await sendPdfIfTycoon({
          user: actor, // ✅ Generate PDF for actor
          from,
          type: 'FULL',
          dateLabel: `${dateLabel} Stock${suffixReportScope(includeUndoneRequestedByOwner)}`,
          startUtc,
          endUtc,
        });

        break;
      }

      case 'REPORT_FULL': {
        await queueOutboundMessage(from, 'Generating comprehensive report... 📋');

        // ✅ FIX: Use actor._id so staff only see their own sales stats (but full stock)
        const fullData = await getFullSummary(actor._id as any, startUtc, endUtc);
        const revenueSummary = await getDailySummary(actor._id as any, startUtc, endUtc);

        let fullMsg = `📋 *${dateLabel} Business Summary*${suffixReportScope(includeUndoneRequestedByOwner)}\n\n`;
        fullMsg += `💰 *Revenue (${dateLabel}):* ${symbol}${Number(revenueSummary.totalRevenue || 0).toLocaleString(locale)}\n`;
        fullMsg += `📉 *Items Sold:* ${(revenueSummary.items || []).length}\n\n`;

        if (!fullData || fullData.length === 0) {
          fullMsg += `_No data found for this period._`;
        } else {
          fullMsg += `*Current Inventory Status:*\n\n`;

          fullData.forEach((item: any) => {
            const unit = item.unit || 'units';

            fullMsg += `🔹 *${String(item.name || '').toUpperCase()}*\n`;
            if (Number(item.soldPaid || 0) > 0) fullMsg += `   • Sold (Paid): ${item.soldPaid} ${unit}\n`;
            if (Number(item.soldCredit || 0) > 0) fullMsg += `   • Sold (Credit): ${item.soldCredit} ${unit} ⚠️\n`;

            if (Number(item.stock || 0) < 0) {
              fullMsg += `   • Stock Left: 0 ${unit} (⚠️ System shows -${Math.abs(item.stock)}. Please update stock!)\n`;
            } else {
              fullMsg += `   • Stock Left: ${item.stock} ${unit}\n`;
            }

            const itemRevenue =
              Number(item.revenue || 0) > 0 ? `${symbol}${Number(item.revenue).toLocaleString(locale)}` : null;
            if (itemRevenue) fullMsg += `   • Revenue: ${itemRevenue}\n`;

            fullMsg += `\n`;
          });

          fullMsg += `_End of Report_`;
        }

        await queueOutboundMessage(from, fullMsg);

        // ✅ PDF type = FULL
        await sendPdfIfTycoon({
          user: actor, // ✅ Generate PDF for actor
          from,
          type: 'FULL',
          dateLabel: `${dateLabel}${suffixReportScope(includeUndoneRequestedByOwner)}`,
          startUtc,
          endUtc,
        });

        break;
      }

      case 'DOWNLOAD_REPORT': {
        if (shopUser.planType !== 'TYCOON') {
          await queueOutboundMessage(from, '📄 PDF reports are available on *TYCOON* plan.');
          break;
        }

        const { startUtc, endUtc } = getUtcRangeForUser(offsetMinutes, startDate, endDate);

        // ✅ FIX: Use actor to determine scope
        const scope = actor.role === 'OWNER' ? 'SHOP' : 'OWN';
        const relevantIds = await getRelevantUserIds(actor, scope);

        // ✅ check first
        const count = await getSalesCountForPeriod(relevantIds, startUtc, endUtc, includeUndoneRequestedByOwner);

        if (count === 0) {
          await queueOutboundMessage(from, `📭 No sales found for *${dateLabel}*. No PDF generated.`);
          break;
        }

        // ✅ only now we tell them we’re generating
        await queueOutboundMessage(from, '📄 Generating PDF report...');

        try {
          // ✅ FIX: Generate PDF for actor
          const pdfFileName = await generatePdfReport(actor._id as any, 'FULL', dateLabel, startUtc, endUtc);
          await queueOutboundMessage(from, `✨ PDF: https://tallypadi.com/reports/${pdfFileName}`);
        } catch (e) {
          console.error(e);
          await queueOutboundMessage(from, '❌ Failed to generate PDF. Try again later.');
        }

        break;
      }

      case 'ADD_STAFF': {
        if (actor.role !== 'OWNER') {
          await queueOutboundMessage(from, '❌ Only the shop owner can add staff.');
          break;
        }

        const r = await addStaffUnderOwner(actor, (parsed as any).staffPhoneNumber || null, (parsed as any).staffName || null);
        await queueOutboundMessage(from, r.msg);
        break;
      }

      case 'SETTINGS':
      case 'CHANGE_LANGUAGE': {
        if (actor.role !== 'OWNER') {
          await queueOutboundMessage(from, '❌ Only the shop owner can change settings.');
          break;
        }

        const key = parsed?.settings_update?.key;
        const value = parsed?.settings_update?.value;

        if (!key) {
          await queueOutboundMessage(from, parsed.reply_text || 'Which setting do you want to change?');
          break;
        }

        const allowedKeys = ['closingTime', 'dailySummaryEnabled', 'language', 'pdfReportsEnabled', 'utcOffsetMinutes'];
        if (!allowedKeys.includes(String(key))) {
          await queueOutboundMessage(from, '❌ Unsupported setting.');
          break;
        }

        (actor.settings as any) = actor.settings || {};
        (actor.settings as any)[key] = value;
        await actor.save();

        await queueOutboundMessage(from, parsed.reply_text || '✅ Settings updated.');
        break;
      }

      
      case 'SHOW_SETTINGS': {
  // shopUser is owner||actor already in your code ✅
  const s = shopUser.settings || {};
  const lang = s.language || 'English';
  const closing = s.closingTime || '20:00';
  const daily = s.dailySummaryEnabled === true ? 'ON ✅' : 'OFF ❌';
  const pdf = s.pdfReportsEnabled === true ? 'ON ✅' : 'OFF ❌';

  const offMin = Number(s.utcOffsetMinutes ?? 60);
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const tz = `UTC${sign}${hh}:${mm}`;

  let msg =
    `⚙️ *Your Current Settings*\n\n` +
    `• Language: *${lang}*\n` +
    `• Closing Time: *${closing}*\n` +
    `• Daily Summary: *${daily}*\n` +
    `• PDF Reports: *${pdf}*\n` +
    `• Timezone: *${tz}*`;

  // ✅ Bank Details
  if (shopUser.bankDetails?.accountNumber) {
      msg += `\n\n🏦 *Bank Details:*\n` + 
             `• ${shopUser.bankDetails.bankName}\n` + 
             `• ${shopUser.bankDetails.accountNumber}\n` + 
             `• ${shopUser.bankDetails.accountName}`;
  } else {
      msg += `\n\n🏦 *Bank Details:* _Not Set_ (Reply "Update bank GTB 0123...")`;
  }

  // ✅ Staff List (If Owner)
  if (actor.role === 'OWNER') {
      const staffList = await User.find({ ownerId: actor._id }).limit(5);
      if (staffList.length > 0) {
          msg += `\n\n👥 *Staff (${staffList.length}):*\n` + 
                 staffList.map(s => `• ${s.name} (${s.phoneNumber})`).join('\n');
      } else {
          msg += `\n\n👥 *Staff:* _None_ (Reply "Add staff 080...")`;
      }
  }

  // ✅ Dynamic Buttons
  const btns: { id: string; title: string }[] = [];
  
  if (s.dailySummaryEnabled) btns.push({ id: 'CMD_SET_DAILY_OFF', title: '🔕 Stop Daily Summary' });
  else btns.push({ id: 'CMD_SET_DAILY_ON', title: '🔔 Enable Daily Summary' });

  if (s.pdfReportsEnabled) btns.push({ id: 'CMD_SET_PDF_OFF', title: '📄 Disable PDF' });
  else btns.push({ id: 'CMD_SET_PDF_ON', title: '📄 Enable PDF' });

  btns.push({ id: 'CMD_FAQ', title: '❓ FAQ / Help' });

  await queueOutboundButtons(from, msg, btns);
  break;
}

      case 'FAQ': {
          await queueOutboundMessage(from, "📚 *TallyPadi FAQ*\n\nHave questions? Check our help center:\nhttps://tallypadi.com/help");
          break;
      }


      case 'REPORT_DEBTS': {
        const debtors = await Debtor.find({ user: shopId }).sort({ totalDebt: -1 });

        if (!debtors.length) {
          await queueOutboundMessage(from, "I don't have any debtor.");
          break;
        }

        let msg = `📉 *Debtors List*:\n\n`;
        let totalOwed = 0;

        debtors.forEach((d: any) => {
          const debt = Number(d.totalDebt || 0);
          if (debt > 0) {
            msg += `• *${d.displayName}*: ${symbol}${debt.toLocaleString(locale)}\n`;
            totalOwed += debt;
          } else {
             msg += `• ${d.displayName}: _No debt_\n`;
          }
          if (d.lastProductStr) msg += `  _Last: ${d.lastProductStr}_\n`;
        });

        if (totalOwed > 0) {
          msg += `\n💰 *Total Outstanding:* ${symbol}${totalOwed.toLocaleString(locale)}`;
        } else {
          msg += `\n✨ Everyone is settled!`;
        }
        
        await queueOutboundMessage(from, msg);
        break;
      }

      case 'CREATE_ORDER': {
          // ✅ 1. Check clarification first (Debts Logic)
          if (parsed.needs_clarification) {
            await queueOutboundMessage(from, parsed.reply_text || "I need more details (Who, What, Price, Due Date).");
            break;
          }

          const { customer_name, total_money, amount_paid, order_params } = parsed;
          const deliveryDate = order_params?.delivery_date ? new Date(order_params.delivery_date) : null;

          // Double-check critical fields even if AI didn't flag (safety)
          if (!customer_name || !total_money || !deliveryDate || isNaN(deliveryDate.getTime())) {
             await queueOutboundMessage(from, "Missing details. Try: 'New order for Amina, dress 50k, delivery Friday'.");
             break;
          }

          try {
              const desc = order_params?.description || 
                           (parsed.items.length > 0 ? parsed.items.map((i: any) => i.name).join(', ') : 'Order');

              const order = await orderService.createOrder(shopId, {
                  customerName: customer_name,
                  description: desc,
                  price: total_money,
                  amountPaid: amount_paid || 0,
                  deliveryDate: deliveryDate,
                  status: 'PENDING'
              });

              const balStr = order.balance > 0 
                ? `💳 Bal: ${symbol}${order.balance.toLocaleString(locale)}`
                : `✅ Fully Paid`;

              await queueOutboundMessage(from, `✅ Order Recorded.\n\n👤 *${customer_name}*\n📝 ${desc}\n📅 Due: ${deliveryDate.toDateString()}\n💰 Price: ${symbol}${total_money.toLocaleString(locale)}\n${balStr}`);
          } catch (e) {
              console.error("Create Order Error:", e);
              await queueOutboundMessage(from, "❌ Failed to create order. Please try again.");
          }
          break;
      }

      case 'LIST_ORDERS': {
          await queueOutboundMessage(from, "🔍 Checking pending orders...");
          try {
              const { orders } = await orderService.getOrders(shopId, { status: 'PENDING' });
              
              if (!orders.length) {
                  await queueOutboundMessage(from, "✅ You have no pending orders.");
                  break;
              }
              
              let msg = "📋 *Orders*:\n\n";
              orders.forEach((o: any) => {
                  const dDate = new Date(o.deliveryDate);
                  const bal = Number(o.balance || 0);
                  const balDisplay = bal > 0 ? `💳 Owes ${symbol}${bal.toLocaleString(locale)}` : `✅ Paid`;
                  
                  // Simulating "Debts" style list
                  msg += `• *${o.customerName}* — ${o.description}\n`;
                  msg += `  📅 ${dDate.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}\n`;
                  msg += `  ${balDisplay}\n\n`;
              });
              
              await queueOutboundMessage(from, msg);
          } catch (e) {
              console.error("List Orders Error:", e);
              await queueOutboundMessage(from, "❌ Failed to retrieve orders.");
          }
          break;
      }

      case 'UPDATE_ORDER': {
          if (!parsed.customer_name) {
              await queueOutboundMessage(from, "Whose order? Reply 'Update order for Amina'.");
              break;
          }

          const { orders } = await orderService.getOrders(shopId, { search: parsed.customer_name, status: 'PENDING' });
          if (orders.length === 0) {
               await queueOutboundMessage(from, `⚠️ No pending order found for *${parsed.customer_name}*.`);
               break;
          }

          // Pick first match (Debts logic usually requires selection, but keeping simple for now)
          const order = orders[0];
          let updates: string[] = [];

          // 1. Handle Payment
          if (parsed.amount_paid && parsed.amount_paid > 0) {
            order.amountPaid = (order.amountPaid || 0) + parsed.amount_paid;
            order.balance = Math.max(0, order.price - order.amountPaid);
            updates.push(`💰 Paid ${symbol}${parsed.amount_paid.toLocaleString(locale)}`);
          }

          // 2. Handle Status (Completion)
          // Detect "done", "completed", "finished" via order_params or regex in prompt
          if (parsed.order_params?.status === 'COMPLETED') {
            order.status = 'COMPLETED';
            updates.push(`✅ Marked as COMPLETED`);
          }

          if (updates.length === 0) {
            await queueOutboundMessage(from, `ℹ️ Found order for ${order.customerName}. Tell me to "mark done" or "add payment".`);
            break;
          }

          await order.save();
          
          const finalBal = order.balance > 0 
            ? `💳 Remaining Bal: ${symbol}${order.balance.toLocaleString(locale)}`
            : `✅ Fully Paid`;

          await queueOutboundMessage(from, `Updated *${order.customerName}*:\n${updates.join('\n')}\n${finalBal}`);
          break;
      }

      case 'CANCEL_ORDER': {
          if (!parsed.customer_name) {
              await queueOutboundMessage(from, "Whose order? Reply 'Cancel order for Amina'.");
              break;
          }
          const { orders } = await orderService.getOrders(shopId, { search: parsed.customer_name, status: 'PENDING' });
           if (orders.length === 0) {
               await queueOutboundMessage(from, `⚠️ No pending order found for *${parsed.customer_name}*.`);
               break;
          }
          const order = orders[0];
          order.status = 'CANCELLED';
          await order.save();
          await queueOutboundMessage(from, `🗑️ Order for *${order.customerName}* has been CANCELLED.`);
          break;
      }

      case 'GET_SHOP_LINK': {
        const userToLink = owner || actor;
        if (!userToLink.shopSlug) {
           let attempts = 0;
           let saved = false;
           
           // Simple slugify: "My Shop!" -> "my-shop"
           const base = (userToLink.businessName || 'shop')
             .toLowerCase()
             .trim()
             .replace(/[\s\W-]+/g, '-')
             .replace(/^-+|-+$/g, '');

           while (!saved && attempts < 5) {
             const rand = Math.floor(1000 + Math.random() * 9000); // 4 digit
             userToLink.shopSlug = `${base}-${rand}`;
             try {
               await userToLink.save();
               saved = true;
             } catch (err: any) {
               if (err.code === 11000) {
                 attempts++;
                 continue; 
               }
               throw err;
             }
           }
           
           if (!saved) {
             await queueOutboundMessage(from, '⚠️ Could not generate a shop link right now. Please try again or set it in your dashboard settings.');
             break;
           }
        }
        const link = `https://tallypadi.com/shop/${userToLink.shopSlug}`;
        await queueOutboundMessage(from, `🛍️ Here is your shop link:\n${link}\n\nShare this with customers so they can view your inventory!`);
        break;
      }

      case 'HQ_DASHBOARD': {
          if (actor.role !== 'HQ') {
              // ✅ Shop Owner / Staff Dashboard (Fallback)
              const { startUtc, endUtc } = getUtcRangeForUser(offsetMinutes, startDate, endDate);
              
              // Parallel fetch for speed
              const [summary, pendingRes] = await Promise.all([
                  getDailySummary(actor._id as any, startUtc, endUtc),
                  orderService.getOrders(shopId, { status: 'PENDING' })
              ]);

              const msg = `🏪 *Shop Dashboard (${dateLabel})*\n\n` +
                          `💰 Revenue: ${symbol}${Number(summary.totalRevenue || 0).toLocaleString(locale)}\n` +
                          `🛒 Items Sold: ${(summary.items || []).length}\n` +
                          `📦 Pending Orders: ${pendingRes.orders.length}\n\n` +
                          `_Reply "full report" for detailed inventory status._`;
              
              await queueOutboundMessage(from, msg);
              break;
          }

          const stats = await hqService.getDashboardStats(String(actor._id));
          const { overview } = stats;

          const msg = `🏢 *HQ Dashboard (All Branches)*\n\n` +
                      `💰 Total Revenue: ${symbol}${overview.totalRevenue.toLocaleString(locale)}\n` +
                      `📉 Total Sales: ${overview.totalSales}\n` +
                      `📅 Today's Revenue: ${symbol}${overview.todayRevenue.toLocaleString(locale)}\n` +
                      `🏪 Active Branches: ${overview.activeBranches}\n\n` +
                      `*Recent Network Sales:*\n` +
                      (stats.recentNetworkSales.length ? 
                          stats.recentNetworkSales.map(s => `• ${s.branchName}: ${s.items} (${symbol}${Number(s.amount).toLocaleString(locale)})`).join('\n') 
                          : "_No recent sales_");
          
          await queueOutboundMessage(from, msg);
          break;
      }

      case 'HQ_COMPARE_BRANCHES': {
          if (actor.role !== 'HQ') {
              await queueOutboundMessage(from, "❌ Access denied. This command is for HQ accounts only.");
              break;
          }

          const comparison = await hqService.compareBranches(String(actor._id));
          if (!comparison.length) {
              await queueOutboundMessage(from, "No branch data available for comparison.");
              break;
          }

          let msg = `📊 *Branch Comparison (Last 7 Days)*\n\n`;
          comparison.forEach((c, i) => {
              msg += `${i+1}. *${c.branchName}*\n   💰 ${symbol}${c.revenue.toLocaleString(locale)} | 🛒 ${c.salesCount} sales\n\n`;
          });

          await queueOutboundMessage(from, msg);
          break;
      }

      case 'HQ_STOCK_TRANSFER': {
          if (actor.role !== 'HQ') {
              await queueOutboundMessage(from, "❌ Access denied. This command is for HQ accounts only.");
              break;
          }

          if (parsed.needs_clarification || !parsed.transfer_params?.from_branch || !parsed.transfer_params?.to_branch || !parsed.items.length) {
              await queueOutboundMessage(from, parsed.reply_text || "Please specify: 'Move [qty] [item] from [Branch A] to [Branch B]'");
              break;
          }

          const item = parsed.items[0];
          
          try {
              const result = await hqService.transferStock(
                  String(actor._id),
                  parsed.transfer_params.from_branch,
                  parsed.transfer_params.to_branch,
                  item.name,
                  item.qty
              );

              await queueOutboundMessage(from, `✅ Transfer Successful!\n\nMoved *${item.qty} ${item.name}*\nFrom: ${result.fromBranch}\nTo: ${result.toBranch}`);
          } catch (e: any) {
              await queueOutboundMessage(from, `❌ Transfer Failed: ${e.message}`);
          }
          break;
      }

      case 'UPDATE_BANK_DETAILS': {
          if (actor.role !== 'OWNER') {
              await queueOutboundMessage(from, "❌ Only the shop owner can update bank details.");
              break;
          }

          if (parsed.needs_clarification || !parsed.bank_details?.account_number || !parsed.bank_details?.bank_name) {
               await queueOutboundMessage(from, "Please provide Bank Name and Account Number. Example:\n'Update bank GTB 0123456789'");
               break;
          }

          actor.bankDetails = {
              bankName: parsed.bank_details.bank_name,
              accountNumber: parsed.bank_details.account_number,
              accountName: parsed.bank_details.account_name || actor.businessName // Fallback to shop name if not provided
          };
          await actor.save();

          await queueOutboundMessage(from, `✅ Bank details saved!\n\n🏦 ${actor.bankDetails.bankName}\n🔢 ${actor.bankDetails.accountNumber}\n👤 ${actor.bankDetails.accountName}`);
          break;
      }

      case 'CREATE_INVOICE': {
          // 1. Resolve Shop Owner (to get Bank Details & Business Name)
          const shopOwner = actor.role === 'OWNER' ? actor : (owner || actor);
          
          // 2. Check Bank Details
          if (!shopOwner.bankDetails?.accountNumber) {
              await queueOutboundMessage(from, "⚠️ Please save your bank details first.\nReply like: *Update bank GTB 0123456789*");
              break;
          }

          // 3. Check Clarification
          if (parsed.needs_clarification || !parsed.customer_name || !parsed.items?.length) {
              await queueOutboundMessage(from, parsed.reply_text || "I need details. Try: *Invoice for Dangote: 2 trucks of cement 5m*");
              break;
          }

          await queueOutboundMessage(from, "📄 Generating invoice...");

          try {
              // 4. Calculate Total
              let totalAmount = 0;
              const invoiceItems = parsed.items.map((i: any) => {
                  const t = (i.unit_price || 0) * i.qty; // ParsedItem only has unit_price
                  totalAmount += t;
                  return {
                      name: i.name,
                      qty: i.qty,
                      unitPrice: i.unit_price || 0,
                      total: t,
                      unit: i.unit
                  };
              });

              // Override total if explicitly provided and higher/different? 
              // Usually computed is safer, but if user said "Total 5m", we respect it if items sum up weirdly?
              // Let's stick to computed for consistency, or parsed.total_money if items have 0 price.
              if (totalAmount === 0 && parsed.total_money && parsed.total_money > 0) {
                  totalAmount = parsed.total_money;
                  // If single item, assign total to it
                  if (invoiceItems.length === 1) {
                      invoiceItems[0].total = totalAmount;
                      invoiceItems[0].unitPrice = totalAmount / invoiceItems[0].qty;
                  }
              }

              // 5. Create Invoice Record
              const inv = await Invoice.create({
                  user: actor._id, // Created by (Staff/Owner)
                  customerName: parsed.customer_name,
                  items: invoiceItems,
                  totalAmount: totalAmount,
                  invoiceNumber: `INV-${Date.now().toString().slice(-6)}`, // Simple unique-ish number
                  status: 'GENERATED',
                  bankDetailsSnapshot: shopOwner.bankDetails,
                  description: parsed.order_params?.description || 'Goods/Services'
              });

              // 6. Send PDF directly (via Queue to avoid storage issues)
              await queueInvoicePdf(from, String(inv._id));

              // 7. Send Interactive Buttons
              await sendWhatsAppButtons3(from, `Invoice for *${inv.customerName}* (${symbol}${totalAmount.toLocaleString(locale)})\nWhat next?`, [
                  { id: invoiceBtnId('PAID', String(inv._id)), title: '✅ Mark Paid' },
                  { id: invoiceBtnId('CANCEL', String(inv._id)), title: '🚫 Cancel' }
              ]);

          } catch (e) {
              console.error("Create Invoice Error:", e);
              await queueOutboundMessage(from, "❌ Failed to generate invoice. Please try again.");
          }
          break;
      }

      case 'HELP': {
        const helpText = parsed.reply_text || "🤖 *TallyPadi Help*\n\nHere are some things I can do:";
        
        await queueSaleResponse(
          from,
          helpText,
          "Your can choose other actions 👇",
          [
            { id: 'CMD_CREATE_INVOICE', title: 'Create Invoice' },
            { id: 'CMD_SHOW_SETTINGS', title: 'My Settings' },
            { id: 'CMD_SUPPORT', title: 'Contact Support' }
          ],
          `help_${messageId}`
        );
        break;
      }

      case 'SUPPORT': {
          await queueOutboundMessage(from, "Connecting you to a support agent... 🎧\nPlease state your issue.");
          // Trigger inbound flow to create ticket
          await supportService.handleInboundMessage(from, "Requesting Support", messageId, profileName);
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
    throw err;
  }
};
