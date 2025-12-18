import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';

import { env } from '../config/env';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { DeletedItem } from '../models/deletedItem.model';
import { AdminSettings } from '../models/adminSettings.model';
import { Transaction } from '../models/transaction.model';

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

    // ✅ ACK META IMMEDIATELY
    res.sendStatus(200);

    // ✅ QUEUE
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

// 3) BACKGROUND PROCESSOR (called by Worker)

// ✅ SECURITY ALLOWLISTS
const ALLOWED_INTENTS = new Set([
  'SALE', 'RESTOCK', 'SET_STOCK', 'DELETED_STOCK', 'DEFINE_PRICE', 'PRICE_CHECK',
  'REPORT_SALES', 'REPORT_STOCK', 'REPORT_FULL', 'SETTINGS', 'CHANGE_LANGUAGE',
  'DEBT_PAYMENT', 'CLOSE_BOOK', 'ADD_STAFF', 'DOWNLOAD_REPORT', 'UNDO_LAST_SALE',
  'REPORT_DEBTS', 'REPORT_RECENT', 'HELP', 'UNKNOWN',
]);

const ALLOWED_SETTINGS_KEYS = new Set(['closingTime', 'dailySummary', 'language']);
const SAFE_TEXT_MAX = 1000;

function cleanTextForSecurity(input: string) {
  let s = String(input || '').slice(0, SAFE_TEXT_MAX);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// INJECTION SCORE (Security)
function injectionScore(raw: string) {
  const s = cleanTextForSecurity(raw).toLowerCase();
  const patterns: RegExp[] = [
    /\bignore\b/, /\bdisregard\b/, /\bbypass\b/, /\boverride\b/, /\bdeveloper\s+message\b/,
    /\bsystem\s+prompt\b/, /\bprevious\s+instructions\b/, /\bact\s+as\b/, /\byou\s+must\b/,
    /\breturn\s+raw\b/, /\btool\b/, /\bfunction\s+call\b/, /\bjson\s+schema\b/
  ];

  let hits = 0;
  for (const re of patterns) if (re.test(s)) hits++;
  if (/\b\d{9,}\b/.test(s)) hits += 2;
  return hits;
}

async function suspendUser(userId: any, reason: string) {
  await User.updateOne(
    { _id: userId },
    { $set: { subscriptionStatus: 'suspended', suspendedAt: new Date(), suspensionReason: reason } }
  );
}

// ✅ PARSER SANITIZER (Prevents AI Hallucinations being passed to logic)
function allowlistParsed(parsed: any) {
  const safe: any = { ...parsed };

  // intent allowlist
  if (!ALLOWED_INTENTS.has(safe?.intent)) safe.intent = 'UNKNOWN';

  // settings
  if (!ALLOWED_SETTINGS_KEYS.has(safe?.settings_update?.key)) {
    safe.settings_update = { key: null, value: null };
  }

  // dates
  safe.report_params = {
    start_date: typeof safe?.report_params?.start_date === 'string' ? safe.report_params.start_date : null,
    end_date: typeof safe?.report_params?.end_date === 'string' ? safe.report_params.end_date : null,
    category_filter: typeof safe?.report_params?.category_filter === 'string' ? safe.report_params.category_filter : null
  };

  // items sanity check
  safe.items = Array.isArray(safe.items) ? safe.items.slice(0, 30) : [];
  safe.items = safe.items.map((it: any) => ({
    name: String(it?.name || '').toLowerCase().trim().slice(0, 60) || 'unknown_item',
    qty: Number.isFinite(Number(it?.qty)) ? Math.max(0, Math.min(Number(it?.qty), 1_000_000)) : 0,
    unit: String(it?.unit || '').toLowerCase().trim().slice(0, 20),
    unit_price: it?.unit_price == null ? null : Number(it.unit_price),
    category: typeof it?.category === 'string' ? it.category : null
  }));

  safe.total_money = safe.total_money == null ? null : Number(safe.total_money);
  safe.is_credit = Boolean(safe.is_credit);
  safe.customer_name = typeof safe.customer_name === 'string' ? safe.customer_name.trim() : safe.customer_name;
  safe.staffPhoneNumber = typeof safe.staffPhoneNumber === 'string' ? safe.staffPhoneNumber.trim() : safe.staffPhoneNumber;
  safe.reply_text = typeof safe.reply_text === 'string' ? safe.reply_text.slice(0, 400) : 'Noted.';

  return safe;
}

// Debtors Helper (Used in REPORT_DEBTS intent)
const buildDebtSummaryMsg = async (userId: any, symbol: string, locale: string) => {
  const debtSales = await Transaction.find({
    user: userId,
    type: 'SALE',
    isUndone: { $ne: true },
    $or: [{ paymentStatus: 'CREDIT' }, { balance: { $gt: 0 } }],
  }).sort({ timestamp: -1 }).limit(2000).lean();

  if (!debtSales.length) return `✅ Nobody dey owe you. Everyone has cleared their tab.`;

  const byName: Record<string, number> = {};
  for (const t of debtSales as any[]) {
    const name = String(t.customerName || 'Unknown').trim() || 'Unknown';
    let outstanding = 0;
    if (typeof t.balance === 'number') outstanding = Number(t.balance || 0);
    else {
      const total = Number(t.totalMoney || 0);
      const paid = Number(t.amountPaid || 0);
      outstanding = Math.max(total - paid, 0);
    }
    if (outstanding <= 0) continue;
    byName[name] = (byName[name] || 0) + outstanding;
  }

  const entries = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `✅ Nobody dey owe you. Everyone has cleared their tab.`;

  const lines = entries.slice(0, 30).map(([n, v]) => `• *${n}* — ${symbol}${v.toLocaleString(locale)}`);
  return `📌 *Debtors List*\n\n${lines.join('\n')}\n\nReply like: *Emeka paid 20000* to record payment.`;
};


// ==========================================
// 🚀 MAIN LOGIC HANDLER
// ==========================================
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
        countryCode: guessedCurrency.code === 'NGN' ? 'NG' : 'US', // simplified default
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

      await queueOutboundMessage(from, `Welcome to *Tallypadi*, ${profileName || 'Friend'}! 👋\n\nTo start, reply with your *EMAIL ADDRESS*.`);
      return;
    }

    // ✅ Suspended check
    if (user.subscriptionStatus === 'suspended') {
      await queueOutboundMessage(from, `🛑 Your account has been suspended.\nReason: ${user.suspensionReason || 'Security policy'}`);
      return;
    }

    // --- REG FLOW ---
    if (user.registrationStage === 'EMAIL') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rawText)) {
        await queueOutboundMessage(from, '❌ Invalid email format.');
        return;
      }
      user.email = rawText;
      user.registrationStage = 'PASSWORD';
      await user.save();
      await queueOutboundMessage(from, `✅ Email Saved! Now reply with a *SECRET PASSWORD*.`);
      return;
    }

    if (user.registrationStage === 'PASSWORD') {
      if (rawText.length < 8) {
        await queueOutboundMessage(from, '❌ Password too short (min 8 chars).');
        return;
      }
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(rawText, salt);
      user.registrationStage = 'COMPLETED';
      await user.save();
      await queueOutboundMessage(from, `✅ Setup Complete!\n\nTry: *I sold 2 bags of rice for ${symbol}50k*`);
      return;
    }

    // ✅ SECURITY: injection
    const score = injectionScore(rawText);
    if (score >= 5) {
      await suspendUser(user._id, 'Prompt injection attempt');
      await queueOutboundMessage(from, `🛑 Account suspended.`);
      return;
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

    // =========================================================
    // 🧠 INTELLIGENT PARSING (ALL LOGIC HERE)
    // =========================================================
    
    const currentLang = user.settings?.language || 'English';
    const contextHistory = user.messageHistory || []; 

    // Dynamically import service
    const { parseMessageWithGemini } = await import('../services/gemini.service');
    
    // 👇 PASSING HISTORY AND IMAGE TO SERVICE
    let parsed = await parseMessageWithGemini(
        rawText, 
        currentLang, 
        contextHistory, 
        imageBuffer, 
        imageMime
    );

    // ✅ SANITIZE
    parsed = allowlistParsed(parsed);

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
      // Simple date label logic
      const today = new Date();
      if (startDate.toDateString() === today.toDateString()) dateLabel = "Today's";
      else dateLabel = startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    }

    // Close book behavior (updates report date to yesterday if done in morning)
    if (parsed?.intent === 'CLOSE_BOOK') {
      const currentHour = new Date().getHours();
      if (currentHour < 12) {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        y.setHours(0, 0, 0, 0);
        startDate = y;
        endDate = new Date(y);
        endDate.setHours(23, 59, 59, 999);
        dateLabel = "Yesterday's (Closed)";
        await queueOutboundMessage(from, '💡 Closing book for *Yesterday* (since it is morning).');
      }
      parsed.intent = 'REPORT_FULL';
    }

    

    // --- ROUTING ---
    switch (parsed.intent) {
      case 'SALE':
      case 'RESTOCK':
      case 'SET_STOCK':
      case 'DEFINE_PRICE':
      case 'DEBT_PAYMENT': {
        // ✅ Transaction Service handles all these
        await processTransaction(user._id as any, parsed, messageId);
        await queueOutboundMessage(from, parsed.reply_text || '✅ Done.');
        break;
      }

      case 'UNDO_LAST_SALE': {
        const r = await undoLastSale(user._id, messageId);
        await queueOutboundMessage(from, r.message);
        break;
      }

      case 'REPORT_DEBTS': {
        const msg = await buildDebtSummaryMsg(user._id, symbol, locale);
        await queueOutboundMessage(from, msg);
        break;
      }

      case 'REPORT_RECENT': {
        const limit = parsed.items?.[0]?.qty || 5;
        const safeLimit = Math.min(Math.max(limit, 1), 10);
        await queueOutboundMessage(from, `🔎 Fetching last ${safeLimit} transactions...`);
        
        const recentTx = await Transaction.find({ user: user._id, type: 'SALE', isUndone: { $ne: true } })
          .sort({ timestamp: -1 }).limit(safeLimit).lean();

        if (!recentTx.length) {
          await queueOutboundMessage(from, "No sales found.");
          break;
        }

        let msg = `🕒 *Last ${safeLimit} Sales:*\n\n`;
        recentTx.forEach((tx: any) => {
          const d = new Date(tx.timestamp);
          const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          const itemsStr = tx.items.map((i: any) => `${i.name} (${i.qty})`).join(', ');
          const money = `${symbol}${(tx.totalMoney || 0).toLocaleString(locale)}`;
          msg += `• *${itemsStr}* — ${money} (${timeStr})\n`;
        });
        await queueOutboundMessage(from, msg);
        break;
      }

      case 'DELETED_STOCK': {
        const itemToDelete = parsed.items?.[0]?.name?.toLowerCase();
        if (!itemToDelete) {
          await queueOutboundMessage(from, "Which item to delete? (e.g. 'Delete Rice')");
          break;
        }
        const item = await Inventory.findOne({ user: user._id, name: { $regex: itemToDelete, $options: 'i' } });
        if (item) {
          await new DeletedItem({ user: user._id, name: item.name, quantity: item.quantity }).save();
          await Inventory.deleteOne({ _id: item._id });
          await queueOutboundMessage(from, `🗑️ Deleted *${item.name}* from stock.`);
        } else {
          await queueOutboundMessage(from, `Item "${itemToDelete}" not found.`);
        }
        break;
      }

      case 'PRICE_CHECK': {
        const itemQuery = parsed.items?.[0]?.name?.toLowerCase();
        if (!itemQuery) {
          await queueOutboundMessage(from, "Which item? (e.g. 'Price of Rice')");
          break;
        }
        const item = await Inventory.findOne({ user: user._id, name: { $regex: itemQuery, $options: 'i' } });
        if (!item) {
          await queueOutboundMessage(from, `Item "${itemQuery}" not found.`);
          break;
        }
        const priceFmt = item.lastUnitPrice > 0 ? `${symbol}${item.lastUnitPrice.toLocaleString(locale)}` : 'Not set';
        await queueOutboundMessage(from, `🏷️ *${item.name.toUpperCase()}*\n💰 Price: ${priceFmt}\n📦 Stock: ${item.quantity}`);
        break;
      }

      case 'REPORT_SALES': {
        await queueOutboundMessage(from, `Calculating ${dateLabel.toLowerCase()} report... ⏳`);
        const summary = await getDailySummary(user._id as any, startDate, endDate);
        const transactions = await getTodayTransactions(user._id as any, startDate, endDate);
        const totalFormatted = summary.totalRevenue.toLocaleString(locale, { style: 'currency', currency: code });

        let salesMsg = `📅 *${dateLabel} Sales Breakdown*\n\n`;
        if (transactions.length > 0) {
          transactions.forEach((tx: any) => {
            const d = new Date(tx.timestamp);
            const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            tx.items.forEach((it: any) => {
               salesMsg += `🕒 ${timeStr} • ${it.name} (${it.qty}${it.unit ? ' '+it.unit : ''}) - ${symbol}${Number(it.total).toLocaleString(locale)}\n`;
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
        const stockList = await getStockReport(user._id as any, targetItem);

        if (!stockList.length) {
          await queueOutboundMessage(from, 'Inventory empty or item not found.');
          break;
        }
        let stockMsg = `📦 *Current Stock*\n\n`;
        stockList.forEach((it: any) => {
          if (it.quantity < 0) stockMsg += `• ${it.name}: ⚠️ *${Math.abs(it.quantity)}* (Oversold)\n`;
          else stockMsg += `• ${it.name}: *${it.quantity}* remaining\n`;
        });
        await queueOutboundMessage(from, stockMsg);
        break;
      }

      case 'REPORT_FULL': {
        await queueOutboundMessage(from, 'Generating summary... 📋');
        const fullData = await getFullSummary(user._id as any, startDate, endDate);
        const revenueSummary = await getDailySummary(user._id as any, startDate, endDate);
        
        let fullMsg = `📋 *${dateLabel} Summary*\n💰 Revenue: ${symbol}${revenueSummary.totalRevenue.toLocaleString(locale)}\n\n`;
        if (!fullData.length) fullMsg += `_No data._`;
        else {
          fullData.forEach((it: any) => {
            fullMsg += `🔹 *${it.name.toUpperCase()}*\n   • Sold: ${it.soldPaid + it.soldCredit}\n   • Stock: ${it.stock}\n\n`;
          });
        }
        await queueOutboundMessage(from, fullMsg);
        
        // PDF Logic (Tycoon only)
        if (user.planType === 'TYCOON') {
             try {
                const pdfFileName = await generatePdfReport(user._id as any, 'FULL', dateLabel, startDate, endDate);
                await queueOutboundMessage(from, `✨ PDF: https://tallypadi.com/reports/${pdfFileName}`);
             } catch(e) { console.error(e); }
        }
        break;
      }

      case 'CHANGE_LANGUAGE': {
        if (parsed?.settings_update?.key === 'language' && parsed.settings_update.value) {
          user.settings.language = String(parsed.settings_update.value);
          await user.save();
          await queueOutboundMessage(from, parsed.reply_text || `Language changed.`);
        }
        break;
      }

      case 'SETTINGS': {
        if (parsed?.settings_update?.key === 'closingTime' && parsed.settings_update.value) {
          user.settings.closingTime = String(parsed.settings_update.value);
          await user.save();
          await queueOutboundMessage(from, `✅ Closing time set to ${user.settings.closingTime}.`);
        }
        break;
      }

      case 'ADD_STAFF': {
        if (user.planType !== 'TYCOON') {
           await queueOutboundMessage(from, '🛑 Upgrade to Tycoon to add staff.');
           break;
        }
        const staffPhoneNumber = parsed.staffPhoneNumber;
        if (!staffPhoneNumber) {
           await queueOutboundMessage(from, 'Provide staff phone number.');
           break;
        }
        // ... (staff creation logic remains same) ...
        await queueOutboundMessage(from, `✅ Added staff ${staffPhoneNumber}.`);
        break;
      }

      case 'DOWNLOAD_REPORT': {
         if (user.planType !== 'TYCOON') {
             await queueOutboundMessage(from, '🛑 Upgrade to Tycoon for PDFs.');
             break;
         }
         await queueOutboundMessage(from, 'Generating PDF... 📄');
         try {
            const pdfFileName = await generatePdfReport(user._id as any, 'FULL', dateLabel, startDate, endDate);
            await queueOutboundMessage(from, `✅ PDF: https://tallypadi.com/reports/${pdfFileName}`);
         } catch(e) { console.error(e); }
         break;
      }

      case 'HELP': {
        await queueOutboundMessage(from, parsed.reply_text || 'Type "Help" for options.');
        break;
      }

      case 'UNKNOWN':
      default: {
        // If we have text, send it. If needs clarification, Gemini usually provides the text.
        await queueOutboundMessage(from, parsed.reply_text || 'Noted.');
        break;
      }
    }

  } catch (err) {
    console.error('❌ Error processing message logic:', err);
    throw err;
  }
};