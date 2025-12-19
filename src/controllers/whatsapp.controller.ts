// src/controllers/whatsapp.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';

import { env } from '../config/env';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { Debtor } from '../models/debtor.model';
import { AdminSettings } from '../models/adminSettings.model';

import { processTransaction } from '../services/transaction.service';
import { checkSubscriptionStatus } from '../services/billing.service';
import { messageQueue, queueOutboundMessage } from '../services/queue.service';
import { undoLastSale } from '../services/undo.service';

import { resolveDebtor, normName } from '../services/debtor.service';

// Reports / PDF (your existing services)
import {
  getDailySummary,
  getStockReport,
  getFullSummary,
  getTodayTransactions,
} from '../services/report.service';
import { generatePdfReport } from '../services/pdf.service';

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
// 🕒 User-local time helpers (fixes UTC display issues)
// =====================================================
function toUserLocalDate(d: any, offsetMinutes: number) {
  return new Date(new Date(d).getTime() + offsetMinutes * 60_000);
}
function toISODateForOffset(offsetMinutes: number): string {
  const now = new Date();
  const local = new Date(now.getTime() + offsetMinutes * 60_000);
  return local.toISOString().split('T')[0];
}

// Build a UTC-ish range that matches the user's local "today" or requested day range
function getUtcRangeForUser(offsetMinutes: number, startDate?: Date, endDate?: Date) {
  // If user provided explicit dates, keep them (your parser already gives ISO dates in UTC-ish)
  if (startDate && endDate) return { startUtc: startDate, endUtc: endDate };

  // Default: user's local today 00:00 -> 23:59:59.999, converted back to UTC-ish by subtracting offset
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
// - Default: exclude undone everywhere in reports
// - Only OWNER can explicitly request include undone histories
// =====================================================
function ownerRequestedUndoneHistory(rawText: string, parsed: any) {
  const s = String(rawText || '').toLowerCase();

  // Positive triggers (include undone)
  const wantsUndone =
    /\b(include|show|with)\b.*\b(undone|reversed|void|voided|cancelled|canceled|undo)\b/.test(s) ||
    /\b(undone|reversed|void|voided|cancelled|canceled|undo)\b.*\b(history|histories|sales|transactions|tx|records)\b/.test(s) ||
    /\bundo history\b/.test(s) ||
    /\bundone histories\b/.test(s);

  // Negative triggers (explicitly exclude) — just to be safe
  const excludeUndone =
    /\b(exclude|remove|hide|without)\b.*\b(undone|reversed|void|voided|cancelled|canceled|undo)\b/.test(s);

  // If your Gemini schema ever adds a flag later, we support it without breaking:
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

// =====================================================
// Media download (image/audio)
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

// =====================================================
// WhatsApp buttons (max 3)
// =====================================================
async function sendWhatsAppButtons3(to: string, bodyText: string, buttons: { id: string; title: string }[]) {
  const safeButtons = (buttons || []).slice(0, 3);

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: safeButtons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  };

  const url = `https://graph.facebook.com/v21.0/${env.whatsappPhoneNumberId}/messages`;
  await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${env.whatsappToken}`, 'Content-Type': 'application/json' },
    timeout: 20_000,
  });
}

// =====================================================
// Actor/Owner resolution (STAFF -> ownerId)
// =====================================================
async function resolveActorAndOwner(from: string) {
  const actor = await User.findOne({ phoneNumber: from });
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

function parseBtnText(rawText: string) {
  if (!rawText.startsWith('__BTN__:')) return null;
  const parts = rawText.split(':'); // __BTN__:ID:TITLE
  const btnId = parts[1] || '';
  const seg = btnId.split('|'); // SALEACT|ACTION|txId
  if (seg[0] !== 'SALEACT') return null;
  return { action: seg[1] || '', txId: seg[2] || '' };
}

// =====================================================
// Receipt builder (fixed TS ??/|| mixing)
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
// Undo by txId (safe + restores stock)
// =====================================================
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function undoSaleById(ownerId: any, txId: string, undoMessageId: string) {
  const tx = await Transaction.findOne({ _id: txId, user: ownerId, type: 'SALE' });
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
      { user: ownerId, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } },
      { $inc: { quantity: qty } }
    );
  }

  return { ok: true, message: `✅ Undone sale: ${items.length} item(s) restored back to stock.` };
}

// =====================================================
// Mark CREDIT by txId
// =====================================================
async function markSaleCredit(ownerId: any, txId: string) {
  const tx = await Transaction.findOne({ _id: txId, user: ownerId, type: 'SALE' });
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
async function attachCreditNameToLatest(shopUserId: any, rawName: string) {
  const name = String(rawName || '').trim();
  if (!name) return { ok: false, msg: 'Reply like: credit John' };

  const tx = await Transaction.findOne({
    user: shopUserId,
    type: 'SALE',
    isUndone: { $ne: true },
    paymentStatus: 'CREDIT',
    $or: [{ customerName: null }, { customerName: '' }, { customerName: { $exists: false } }],
  }).sort({ timestamp: -1 });

  if (!tx) return { ok: false, msg: 'No pending credit sale found.' };

  const res = await resolveDebtor(shopUserId, name);

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
      user: shopUserId,
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
// Simple allowlist (keeps your “previous logic” safe, but doesn’t change behavior)
// =====================================================
function allowlistParsed(parsed: any) {
  if (!parsed || typeof parsed !== 'object') return { intent: 'UNKNOWN', items: [], report_params: {}, settings_update: {} };
  parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
  parsed.report_params = parsed.report_params || { start_date: null, end_date: null };
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

      default:
        console.log(`Unsupported message type: ${msg.type}`);
        return res.sendStatus(200);
    }

    if (!text && !mediaId) return res.sendStatus(200);

    res.sendStatus(200);

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
// Staff add helper (keeps your flow intact)
// =====================================================
function normalizePhone(raw: string) {
  return String(raw || '').replace(/[^\d+]/g, '').trim();
}

async function addStaffUnderOwner(owner: any, staffPhoneRaw?: string | null) {
  const staffPhone = normalizePhone(staffPhoneRaw || '');
  if (!staffPhone) return { ok: false, msg: 'Reply with staff number (e.g. +2348123456789).' };

  if (String(owner.phoneNumber) === staffPhone) return { ok: false, msg: 'You cannot add your own number as staff.' };

  const existing = await User.findOne({ phoneNumber: staffPhone });
  if (existing) {
    if (existing.role !== 'STAFF') return { ok: false, msg: 'That number is already registered as a shop owner.' };

    existing.ownerId = owner._id;
    existing.businessName = owner.businessName;
    existing.subscriptionStatus = owner.subscriptionStatus;
    existing.planType = owner.planType;
    existing.registrationStage = 'COMPLETED';
    await existing.save();

    return { ok: true, msg: `✅ Staff linked: ${staffPhone}` };
  }

  await User.create({
    phoneNumber: staffPhone,
    role: 'STAFF',
    ownerId: owner._id,
    businessName: owner.businessName,
    name: 'Staff',
    countryCode: owner.countryCode || guessCountryFromPhone(staffPhone),
    registrationStage: 'COMPLETED',
    subscriptionStatus: owner.subscriptionStatus || 'trial',
    trialEndsAt: owner.trialEndsAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    planType: owner.planType || 'OGA_BOSS',
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
    staffPhone,
    `✅ You have been added as *STAFF* for *${owner.businessName || 'TallyPadi Shop'}*.\nYou can now record sales and view reports on WhatsApp.`
  );

  return { ok: true, msg: `✅ Staff added: ${staffPhone}` };
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

        planType: 'OGA_BOSS',
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

      await queueOutboundMessage(from, `Welcome to *Tallypadi*, ${profileName || 'Friend'}! 👋\n\nTo start, reply with your *EMAIL ADDRESS*.`);
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
    if (actor.role === 'OWNER') {
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

        const { symbol } = getUserCurrency(actor);

        await queueOutboundMessage(
          from,
          `✅ *Setup Complete!*\n\nTry:\n• "Sold 2 rice for ${symbol}5000"\n• "Restock 10 rice at ${symbol}2000"\n• "How much did I make today?"`
        );
        return;
      }
    }

    // ✅ suspension check (owner suspension blocks staff too)
    const shopUser = owner || actor;
    if (shopUser.subscriptionStatus === 'suspended') {
      await queueOutboundMessage(from, `🛑 Account suspended.\nReason: ${shopUser.suspensionReason || 'Security policy'}`);
      return;
    }

    // ✅ subscription check uses OWNER if staff
    const allowed = await checkSubscriptionStatus(shopUser);
    if (!allowed) return;

    // ✅ store history per actor (staff gets own context)
    actor.messageHistory = actor.messageHistory || [];
    if (actor.messageHistory.length >= MAX_HISTORY) actor.messageHistory.shift();
    actor.messageHistory.push(rawText);
    await actor.save();

    const { symbol, locale, code } = getUserCurrency(shopUser);
    const shopId = ownerId || actor._id;

    // ✅ Use user offset everywhere we display or compute “today”
    const offsetMinutes = shopUser?.settings?.utcOffsetMinutes ?? 60;
    const todayKey = toISODateForOffset(offsetMinutes);

    // =====================================================
    // ✅ BUTTON fast path (UNDO / RECEIPT / CREDIT)
    // =====================================================
    const btn = parseBtnText(rawText);
    if (btn?.txId && btn?.action) {
      if (btn.action === 'RECEIPT') {
        const tx = await Transaction.findOne({ _id: btn.txId, user: shopId }).lean();
        if (!tx) {
          await queueOutboundMessage(from, 'Sale not found for receipt.');
          return;
        }
        await queueOutboundMessage(from, buildReceiptText(tx, symbol, locale, shopUser.businessName, offsetMinutes));
        return;
      }

      if (btn.action === 'CREDIT') {
        const r = await markSaleCredit(shopId, btn.txId);
        await queueOutboundMessage(from, r.msg);
        return;
      }

      if (btn.action === 'UNDO') {
        const r = await undoSaleById(shopId, btn.txId, messageId);
        await queueOutboundMessage(from, r.message);
        return;
      }

      await queueOutboundMessage(from, 'Unknown action.');
      return;
    }

    // =====================================================
    // ✅ quick command: "credit John"
    // =====================================================
    const creditNameMatch = rawText.match(/^credit\s+(.+)$/i);
    if (creditNameMatch?.[1]) {
      const r = await attachCreditNameToLatest(shopId, creditNameMatch[1]);
      await queueOutboundMessage(from, r.msg);
      return;
    }

    // =====================================================
    // 🧠 PARSE WITH GEMINI (your existing service)
    // =====================================================
    const currentLang = (shopUser.settings?.language || 'English') as string;
    const contextHistory = actor.messageHistory || [];

    const { parseMessageWithGemini } = await import('../services/gemini.service');

    let parsed = await parseMessageWithGemini(rawText, currentLang, contextHistory, imageBuffer, imageMime);
    parsed = allowlistParsed(parsed);

    // =====================================================
    // ✅ Decide undone scope for reports
    // - Only OWNER can override to include undone histories
    // =====================================================
 const includeUndoneRequestedByOwner =
  actor.role === 'OWNER' && Boolean(parsed?.report_params?.include_undone);


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

      const todayLocal = toUserLocalDate(new Date(), offsetMinutes);
      const startLocal = toUserLocalDate(startDate, offsetMinutes);

      if (startLocal.toDateString() === todayLocal.toDateString()) dateLabel = "Today's";
      else dateLabel = startLocal.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
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

    // =====================================================
    // 🚦 ROUTING (ALL YOUR PREVIOUS INTENTS)
    // =====================================================
    switch (parsed.intent) {
      case 'SALE': {
        await processTransaction(shopId as any, parsed, messageId);

        await queueOutboundMessage(from, parsed.reply_text || '✅ Sale recorded.');

        const tx = await Transaction.findOne({ user: shopId, messageId }).lean();
        if (tx?._id) {
          const txId = String(tx._id);
          const body = `After sale:\nChoose action 👇`;

          try {
            await sendWhatsAppButtons3(from, body, [
              { id: saleBtnId('UNDO', txId), title: '↩️ Undo' },
              { id: saleBtnId('RECEIPT', txId), title: '🧾 Receipt' },
              { id: saleBtnId('CREDIT', txId), title: '💳 Credit' },
            ]);
          } catch (e) {
            console.error('❌ Failed to send buttons:', e);
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
        await processTransaction(shopId as any, parsed, messageId);
        await queueOutboundMessage(from, parsed.reply_text || '✅ Done.');
        break;
      }

      case 'UNDO_LAST_SALE': {
        const r = await undoLastSale(shopId, messageId);
        await queueOutboundMessage(from, r.message);
        break;
      }

      case 'REPORT_RECENT': {
        const limit = parsed.items?.[0]?.qty || 5;
        const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 10);

        await queueOutboundMessage(from, `🔎 Fetching last ${safeLimit} transactions...`);

        // ✅ default excludes undone, unless OWNER explicitly asks
        const recentTx = await Transaction.find({
          user: shopId,
          type: 'SALE',
          ...buildUndoneFilter(includeUndoneRequestedByOwner),
        })
          .sort({ createdAt: -1 })
          .limit(safeLimit)
          .lean();

        if (!recentTx.length) {
          await queueOutboundMessage(from, 'No sales found.');
          break;
        }

        let out = `🕒 *Last ${safeLimit} Sales*${suffixReportScope(includeUndoneRequestedByOwner)}:\n\n`;
        recentTx.forEach((t: any) => {
          const local = toUserLocalDate(t.timestamp, offsetMinutes);
          const timeStr = local.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          const money = `${symbol}${Number(t.totalMoney || 0).toLocaleString(locale)}`;
          const itemsStr = (t.items || []).map((i: any) => `${i.name} (${i.qty})`).join(', ');
          const undoneTag = t.isUndone ? ' ⚠️UNDONE' : '';
          out += `• *${itemsStr}* — ${money} (${timeStr})${undoneTag}\n`;
        });

        // If staff tries to ask for undone, they still won't get it — that’s intended.
        await queueOutboundMessage(from, out);
        break;
      }

      case 'REPORT_SALES': {
        await queueOutboundMessage(from, `Calculating ${dateLabel.toLowerCase()} report... ⏳`);

        // ✅ Always compute from Transaction so undone filtering is guaranteed
        const { startUtc, endUtc } = getUtcRangeForUser(offsetMinutes, startDate, endDate);

        const salesTx = await Transaction.find({
          user: shopId,
          type: 'SALE',
          timestamp: { $gte: startUtc, $lte: endUtc },
          ...buildUndoneFilter(includeUndoneRequestedByOwner),
        })
          .sort({ timestamp: 1 })
          .lean();

        const totalRevenue = salesTx.reduce((sum: number, tx: any) => sum + Number(tx.totalMoney || 0), 0);

        const totalFormatted = Number(totalRevenue || 0).toLocaleString(locale, {
          style: 'currency',
          currency: code,
          maximumFractionDigits: 0,
        });

        let salesMsg = `📅 *${dateLabel} Sales Breakdown*${suffixReportScope(includeUndoneRequestedByOwner)}\n\n`;

        if (salesTx.length > 0) {
          salesTx.forEach((tx: any) => {
            const local = toUserLocalDate(tx.timestamp, offsetMinutes);
            const timeStr = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
            const undoneTag = tx.isUndone ? ' ⚠️UNDONE' : '';

            (tx.items || []).forEach((it: any) => {
              const line = Number(it.total || (Number(it.qty || 0) * Number(it.unitPrice || 0)) || 0);
              salesMsg += `🕒 ${timeStr} • ${it.name} (${it.qty}${it.unit ? ' ' + it.unit : ''}) - ${symbol}${line.toLocaleString(locale)}${undoneTag}\n`;
            });
          });
        } else {
          salesMsg += `_No sales recorded._\n`;
        }

        salesMsg += `\n💰 *Total:* ${totalFormatted}`;
        await queueOutboundMessage(from, salesMsg);
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

        let stockMsg = `📦 *Current Stock*\n\n`;
        stockList.forEach((it: any) => {
          if (Number(it.quantity || 0) < 0) stockMsg += `• ${it.name}: ⚠️ *${Math.abs(it.quantity)}* (Oversold)\n`;
          else stockMsg += `• ${it.name}: *${it.quantity}* remaining\n`;
        });

        await queueOutboundMessage(from, stockMsg);
        break;
      }

      case 'REPORT_DEBTS': {
        await queueOutboundMessage(from, 'Fetching debtors list...');

        const list = await Debtor.find({ user: shopId })
          .sort({ totalDebt: -1, updatedAt: -1 })
          .limit(25)
          .lean();

        if (!list.length) {
          await queueOutboundMessage(from, '✅ No debtors yet.');
          break;
        }

        let msg = `📌 *Debtors List*\n\n`;
        list.forEach((d: any, idx: number) => {
          const amt = `${symbol}${Number(d.totalDebt || 0).toLocaleString(locale)}`;
          msg += `${idx + 1}) *${d.displayName}* — ${amt}\n`;
          if (d.lastProductStr) msg += `   • Last: ${d.lastProductStr}\n`;
        });

        await queueOutboundMessage(from, msg);
        break;
      }

      case 'REPORT_FULL': {
        await queueOutboundMessage(from, 'Generating summary... 📋');

        // ✅ Always compute from Transaction + Inventory so undone filtering is guaranteed
        const { startUtc, endUtc } = getUtcRangeForUser(offsetMinutes, startDate, endDate);

        const salesTx = await Transaction.find({
          user: shopId,
          type: 'SALE',
          timestamp: { $gte: startUtc, $lte: endUtc },
          ...buildUndoneFilter(includeUndoneRequestedByOwner),
        }).lean();

        // Aggregate sold counts
        const agg: Record<
          string,
          { name: string; soldPaid: number; soldCredit: number; soldTotal: number }
        > = {};

        for (const tx of salesTx) {
          const isCredit = String(tx.paymentStatus || '').toUpperCase() === 'CREDIT';
          for (const it of (tx.items || []) as any[]) {
            const nm = String(it.name || '').trim();
            if (!nm) continue;
            const qty = Number(it.qty || 0);
            if (!Number.isFinite(qty) || qty <= 0) continue;

            if (!agg[nm]) agg[nm] = { name: nm, soldPaid: 0, soldCredit: 0, soldTotal: 0 };
            if (isCredit) agg[nm].soldCredit += qty;
            else agg[nm].soldPaid += qty;
            agg[nm].soldTotal += qty;
          }
        }

        const revenue = salesTx.reduce((sum: number, tx: any) => sum + Number(tx.totalMoney || 0), 0);

        // Pull stock for items we saw (and also show top inventory if there were no sales)
        const aggNames = Object.keys(agg);
        let inventoryDocs: any[] = [];

        if (aggNames.length) {
          inventoryDocs = await Inventory.find({
            user: shopId,
            name: { $in: aggNames },
          }).lean();
        } else {
          // No sales: still show stock overview (limit 20)
          inventoryDocs = await Inventory.find({ user: shopId }).sort({ updatedAt: -1 }).limit(20).lean();
        }

        const stockMap: Record<string, number> = {};
        for (const inv of inventoryDocs) {
          stockMap[String(inv.name || '').trim()] = Number(inv.quantity ?? inv.stock ?? 0);
        }

        let fullMsg =
          `📋 *${dateLabel} Summary*${suffixReportScope(includeUndoneRequestedByOwner)}\n` +
          `💰 Revenue: ${symbol}${Number(revenue || 0).toLocaleString(locale)}\n\n`;

        if (!aggNames.length && inventoryDocs.length) {
          fullMsg += `📦 *Stock Snapshot*\n`;
          for (const inv of inventoryDocs) {
            const q = Number(inv.quantity ?? inv.stock ?? 0);
            fullMsg += `• ${inv.name}: ${q}\n`;
          }
          await queueOutboundMessage(from, fullMsg);
          break;
        }

        if (!aggNames.length) {
          fullMsg += `_No data._`;
          await queueOutboundMessage(from, fullMsg);
          break;
        }

        // Print items sorted by soldTotal desc
        const rows = Object.values(agg).sort((a, b) => (b.soldTotal || 0) - (a.soldTotal || 0));

        rows.forEach((it) => {
          const stock = stockMap[it.name] ?? 0;
          fullMsg +=
            `🔹 *${String(it.name).toUpperCase()}*\n` +
            `   • Sold: ${Number(it.soldPaid || 0) + Number(it.soldCredit || 0)}\n` +
            `   • Stock: ${stock}\n\n`;
        });

        await queueOutboundMessage(from, fullMsg);

        // ✅ PDF only for TYCOON (your existing rule)
        // NOTE: We pass an extra options arg safely (ignored if your pdf service doesn't use it yet).
        if (shopUser.planType === 'TYCOON') {
          try {
            const pdfAny = generatePdfReport as any;
            const pdfFileName = await pdfAny(
              shopId as any,
              'FULL',
              `${dateLabel}${suffixReportScope(includeUndoneRequestedByOwner)}`,
              startUtc,
              endUtc,
              { includeUndone: includeUndoneRequestedByOwner }
            );
            await queueOutboundMessage(from, `✨ PDF: https://tallypadi.com/reports/${pdfFileName}`);
          } catch (e) {
            console.error(e);
          }
        }

        break;
      }

      case 'DOWNLOAD_REPORT': {
        if (shopUser.planType !== 'TYCOON') {
          await queueOutboundMessage(from, '📄 PDF reports are available on *TYCOON* plan.');
          break;
        }

        await queueOutboundMessage(from, '📄 Generating PDF report...');

        const { startUtc, endUtc } = getUtcRangeForUser(offsetMinutes, startDate, endDate);

        try {
          const pdfAny = generatePdfReport as any;
          const pdfFileName = await pdfAny(
            shopId as any,
            'FULL',
            `${dateLabel}${suffixReportScope(includeUndoneRequestedByOwner)}`,
            startUtc,
            endUtc,
            { includeUndone: includeUndoneRequestedByOwner }
          );
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

        const r = await addStaffUnderOwner(actor, parsed.staffPhoneNumber || null);
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

      case 'HELP':
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
