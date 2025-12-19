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
// Security: Parsed allowlist (prevents weird Gemini output)
// =====================================================
function allowlistParsed(parsed: any) {
  const safe: any = {};

  const allowedIntents = new Set([
    'SALE',
    'RESTOCK',
    'SET_STOCK',
    'DEFINE_PRICE',
    'DEBT_PAYMENT',
    'UNDO_LAST_SALE',

    'REPORT_RECENT',
    'REPORT_SALES',
    'REPORT_STOCK',
    'REPORT_FULL',

    'CLOSE_BOOK',
    'HELP',
    'UNKNOWN',
  ]);

  safe.intent = allowedIntents.has(parsed?.intent) ? parsed.intent : 'UNKNOWN';
  safe.is_credit = Boolean(parsed?.is_credit);

  safe.items = Array.isArray(parsed?.items)
    ? parsed.items.slice(0, 20).map((i: any) => ({
        name: String(i?.name || '').slice(0, 120),
        qty: Number(i?.qty || 0),
        unit: String(i?.unit || 'pcs').slice(0, 20),
        unit_price: i?.unit_price == null ? null : Number(i.unit_price),
      }))
    : [];

  safe.total_money = parsed?.total_money == null ? null : Number(parsed.total_money);

  safe.report_params = {
    start_date: parsed?.report_params?.start_date ? String(parsed.report_params.start_date) : null,
    end_date: parsed?.report_params?.end_date ? String(parsed.report_params.end_date) : null,
  };

  safe.reply_text = String(parsed?.reply_text || '').slice(0, 1500);
  safe.customer_name = parsed?.customer_name ? String(parsed.customer_name).slice(0, 120) : null;

  return safe;
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
async function sendWhatsAppButtons3(
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
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

  // OWNER
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
// Receipt builder (fix ?? + || mix)
// =====================================================
function buildReceiptText(tx: any, symbol: string, locale: string, businessName?: string) {
  const d = new Date(tx.timestamp);
  const when = `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;

  const items = (tx.items || [])
    .map((i: any) => {
      const calc = Number(i.qty || 0) * Number(i.unitPrice || 0);
      const lineTotal = Number((i.total ?? calc) || 0); // ✅ safe precedence

      return `• ${i.qty}${i.unit ? ` ${i.unit}` : ''} ${i.name} — ${symbol}${lineTotal.toLocaleString(locale)}`;
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

  return `🧾 *${businessName || 'Receipt'}*\n📅 ${when}\n\n${items || '_No items_'}\n\n💰 Total: ${total}\n${statusLine}`;
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
  if ((tx as any).isUndone) return { ok: false, message: 'Already undone.' };

  (tx as any).isUndone = true;
  (tx as any).undoneAt = new Date();
  (tx as any).undoneByMessageId = undoMessageId;
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
  if ((tx as any).isUndone) return { ok: false, msg: 'That sale was already undone.' };

  (tx as any).paymentStatus = 'CREDIT';
  (tx as any).amountPaid = 0;
  (tx as any).balance = Number((tx as any).totalMoney || 0);
  (tx as any).settledAt = null;
  await tx.save();

  const needsName = !(tx as any).customerName;
  return {
    ok: true,
    msg: needsName
      ? `💳 Marked as CREDIT.\n\nWho owes you? Reply like: *credit John*`
      : `💳 Marked as CREDIT for *${(tx as any).customerName}*.`,
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
      msg:
        `I see similar names. Reply the correct number:\n\n${list}\n\n` +
        `Or type the full name again (add surname).`,
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

  (tx as any).debtorId = debtorId;
  (tx as any).customerName = displayName;
  (tx as any).customerKey = debtorKey;
  await tx.save();

  await Debtor.findByIdAndUpdate(debtorId, {
    $inc: { totalDebt: Number((tx as any).totalMoney || 0) },
    $set: { lastProductStr: ((tx as any).items || []).map((i: any) => `${i.qty} ${i.name}`).join(', ') },
  });

  return { ok: true, msg: `✅ Credit linked to *${displayName}*.` };
}

// =====================================================
// Date helpers (user-local by utcOffsetMinutes)
// =====================================================
function localNow(offsetMinutes: number) {
  const now = new Date();
  return new Date(now.getTime() + offsetMinutes * 60 * 1000);
}

function localDayRange(offsetMinutes: number, which: 'today' | 'yesterday') {
  const ln = localNow(offsetMinutes);
  if (which === 'yesterday') ln.setDate(ln.getDate() - 1);

  const startLocal = new Date(ln);
  startLocal.setHours(0, 0, 0, 0);

  const endLocal = new Date(ln);
  endLocal.setHours(23, 59, 59, 999);

  // Convert local-range back to UTC Date objects
  const startUtc = new Date(startLocal.getTime() - offsetMinutes * 60 * 1000);
  const endUtc = new Date(endLocal.getTime() - offsetMinutes * 60 * 1000);

  return { startUtc, endUtc };
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

      await queueOutboundMessage(
        from,
        `Welcome to *Tallypadi*, ${profileName || 'Friend'}! 👋\n\nTo start, reply with your *EMAIL ADDRESS*.`
      );
      return;
    }

    // ✅ staff safety
    if (actor.role === 'STAFF') {
      if (!owner || !ownerId) {
        await queueOutboundMessage(from, `❌ This staff account has no owner linked. Ask owner to re-add you.`);
        return;
      }
      // staff must not be blocked by registration stage
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

    // ✅ shopUser (owner if staff)
    const shopUser = owner || actor;
    const shopId = ownerId || actor._id;

    // ✅ suspension check (owner suspension blocks staff too)
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
    const utcOffsetMinutes = shopUser.settings?.utcOffsetMinutes ?? 60;

    // =====================================================
    // ✅ BUTTON fast path
    // =====================================================
    const btn = parseBtnText(rawText);
    if (btn?.txId && btn?.action) {
      if (btn.action === 'RECEIPT') {
        const tx = await Transaction.findOne({ _id: btn.txId, user: shopId }).lean();
        if (!tx) return void (await queueOutboundMessage(from, 'Sale not found for receipt.'));
        await queueOutboundMessage(from, buildReceiptText(tx, symbol, locale, shopUser.businessName));
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
    // 🧠 PARSE WITH GEMINI
    // =====================================================
    const currentLang = shopUser.settings?.language || 'English';
    const contextHistory = actor.messageHistory || [];

    const { parseMessageWithGemini } = await import('../services/gemini.service');

    let parsed = await parseMessageWithGemini(rawText, currentLang, contextHistory, imageBuffer, imageMime);
    parsed = allowlistParsed(parsed);

    // --- DATE PARSING (user-local range by utcOffset) ---
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let dateLabel = "Today's";

    // default to TODAY range
    const todayRange = localDayRange(utcOffsetMinutes, 'today');
    startDate = todayRange.startUtc;
    endDate = todayRange.endUtc;

    // if Gemini supplied date(s), use them (treat them as date-only)
    if (parsed?.report_params?.start_date) {
      const s = new Date(parsed.report_params.start_date);
      if (!Number.isNaN(s.getTime())) {
        // interpret as local date start/end, then convert to UTC
        const local = new Date(s);
        local.setHours(0, 0, 0, 0);

        const endLocal = parsed.report_params.end_date ? new Date(parsed.report_params.end_date) : new Date(s);
        endLocal.setHours(23, 59, 59, 999);

        startDate = new Date(local.getTime() - utcOffsetMinutes * 60 * 1000);
        endDate = new Date(endLocal.getTime() - utcOffsetMinutes * 60 * 1000);

        const localToday = localNow(utcOffsetMinutes);
        const localTodayKey = localToday.toDateString();

        const localStartKey = new Date(s.getTime()).toDateString();
        dateLabel = localStartKey === localTodayKey
          ? "Today's"
          : new Date(s).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      }
    }

    if (parsed?.intent === 'CLOSE_BOOK') {
      // if morning in user-local time, close yesterday
      const localT = localNow(utcOffsetMinutes);
      const currentHour = localT.getHours();

      if (currentHour < 12) {
        const y = localDayRange(utcOffsetMinutes, 'yesterday');
        startDate = y.startUtc;
        endDate = y.endUtc;
        dateLabel = "Yesterday's (Closed)";
        await queueOutboundMessage(from, '💡 Closing book for *Yesterday* (since it is morning).');
      } else {
        // afternoon/evening -> close today
        const t = localDayRange(utcOffsetMinutes, 'today');
        startDate = t.startUtc;
        endDate = t.endUtc;
        dateLabel = "Today's (Closed)";
        await queueOutboundMessage(from, '💡 Closing book for *Today*.');
      }

      parsed.intent = 'REPORT_FULL';
    }

    // =====================================================
    // 🚦 ROUTING
    // =====================================================
    switch (parsed.intent) {
      case 'SALE': {
        // ✅ record sale under OWNER shop
        await processTransaction(shopId as any, parsed, messageId);

        // send normal reply
        await queueOutboundMessage(from, parsed.reply_text || '✅ Sale recorded.');

        // ✅ fetch the saved sale by messageId
        const tx = await Transaction.findOne({ user: shopId, messageId }).lean();

        if (tx?._id) {
          const txId = String(tx._id);

          const body =
            `After sale:\n` +
            `✅ Confirm (auto)\n` +
            `Choose action 👇`;

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
      case 'DEFINE_PRICE':
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
        const limit = Number(parsed.items?.[0]?.qty || 5);
        const safeLimit = Math.min(Math.max(limit, 1), 10);
        await queueOutboundMessage(from, `🔎 Fetching last ${safeLimit} transactions...`);

        const recentTx = await Transaction.find({
          user: shopId,
          type: 'SALE',
          isUndone: { $ne: true },
        })
          .sort({ timestamp: -1 })
          .limit(safeLimit)
          .lean();

        if (!recentTx.length) {
          await queueOutboundMessage(from, 'No sales found.');
          break;
        }

        let out = `🕒 *Last ${safeLimit} Sales:*\n\n`;
        recentTx.forEach((t: any) => {
          const d = new Date(t.timestamp);
          const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          const money = `${symbol}${Number(t.totalMoney || 0).toLocaleString(locale)}`;
          const itemsStr = (t.items || []).map((i: any) => `${i.name} (${i.qty})`).join(', ');
          out += `• *${itemsStr}* — ${money} (${timeStr})\n`;
        });

        await queueOutboundMessage(from, out);
        break;
      }

      case 'REPORT_SALES': {
        await queueOutboundMessage(from, `Calculating ${dateLabel.toLowerCase()} report... ⏳`);
        const summary = await getDailySummary(shopId as any, startDate, endDate);
        const transactions = await getTodayTransactions(shopId as any, startDate, endDate);

        const totalFormatted = Number(summary.totalRevenue || 0).toLocaleString(locale, {
          style: 'currency',
          currency: code,
          maximumFractionDigits: 0,
        });

        let salesMsg = `📅 *${dateLabel} Sales Breakdown*\n\n`;
        if (transactions.length > 0) {
          transactions.forEach((tx: any) => {
            const d = new Date(tx.timestamp);
            const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            (tx.items || []).forEach((it: any) => {
              const calc = Number(it.qty || 0) * Number(it.unitPrice || 0);
              const lineTotal = Number((it.total ?? calc) || 0);

              salesMsg += `🕒 ${timeStr} • ${it.name} (${it.qty}${it.unit ? ' ' + it.unit : ''}) - ${symbol}${lineTotal.toLocaleString(locale)}\n`;
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

      case 'REPORT_FULL': {
        await queueOutboundMessage(from, 'Generating summary... 📋');

        const fullData = await getFullSummary(shopId as any, startDate, endDate);
        const revenueSummary = await getDailySummary(shopId as any, startDate, endDate);

        let fullMsg = `📋 *${dateLabel} Summary*\n💰 Revenue: ${symbol}${Number(
          revenueSummary.totalRevenue || 0
        ).toLocaleString(locale)}\n\n`;

        if (!fullData.length) fullMsg += `_No data._`;
        else {
          fullData.forEach((it: any) => {
            fullMsg += `🔹 *${String(it.name).toUpperCase()}*\n   • Sold: ${Number(it.soldPaid || 0) + Number(it.soldCredit || 0)}\n   • Stock: ${it.stock}\n\n`;
          });
        }

        await queueOutboundMessage(from, fullMsg);

        if (shopUser.planType === 'TYCOON') {
          try {
            const pdfFileName = await generatePdfReport(shopId as any, 'FULL', dateLabel, startDate, endDate);
            await queueOutboundMessage(from, `✨ PDF: https://tallypadi.com/reports/${pdfFileName}`);
          } catch (e) {
            console.error(e);
          }
        }
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
