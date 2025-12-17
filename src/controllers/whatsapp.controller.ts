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
import { getDailySummary, getStockReport, getFullSummary, getTodayTransactions } from '../services/report.service';
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
    // still ACK 200 to prevent Meta retry storms
    return res.sendStatus(200);
  }
};

// ✅ debtors list helper (requires Transaction.customerName field)
const buildDebtSummary = async (userId: any, symbol: string, locale: string) => {
  const debtSales = await Transaction.find({
    user: userId,
    type: 'SALE',
    paymentStatus: 'CREDIT',
    totalMoney: { $gt: 0 },
  })
    .sort({ timestamp: -1 })
    .limit(500)
    .lean();

  if (!debtSales.length) return `✅ Nobody dey owe you.`;

  const byName: Record<string, number> = {};

  for (const t of debtSales as any[]) {
    const name = String(t.customerName || 'Unknown').trim() || 'Unknown';
    const amt = Number(t.totalMoney || 0);
    byName[name] = (byName[name] || 0) + amt;
  }

  const lines = Object.entries(byName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([n, v]) => `• *${n}* — ${symbol}${v.toLocaleString(locale)}`);

  return `📌 *Debtors List*\n\n${lines.join('\n')}\n\nReply: *Emeka paid 20k* to record payment.`;
};

// 3) BACKGROUND PROCESSOR (called by Worker)
export const handleMessageLogic = async (
  from: string,
  text: string,
  messageId: string,
  mediaId?: string,
  isVoiceMessage?: boolean,
  profileName?: string
) => {
  try {
    console.log(`⚡ Processing Logic for ${from}: "${text}"`);

    // --- GLOBAL SETTINGS (with safe fallback) ---
    let MAX_HISTORY = 5;
    let MAX_STAFF = 5;
    try {
      const globalSettings = await AdminSettings.findOne().lean();
      MAX_HISTORY = globalSettings?.limits?.maxMessageHistory || 5;
      MAX_STAFF = globalSettings?.limits?.maxStaffAccounts || 5;
    } catch (e) {
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
        countryCode: guessedCurrency.code === 'NGN' ? 'NG' : guessedCurrency.code === 'USD' ? 'US' : 'NG',
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

    // --- REG FLOW ---
    if (user.registrationStage === 'EMAIL') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(text)) {
        await queueOutboundMessage(from, '❌ Invalid email format. Please enter a valid email address.');
        return;
      }

      const existingUser = await User.findOne({ email: text });
      if (existingUser) {
        await queueOutboundMessage(from, 'This email is already registered. Please use a different email.');
        return;
      }

      user.email = text;
      user.registrationStage = 'PASSWORD';
      await user.save();

      await queueOutboundMessage(
        from,
        `✅ Email Saved! Now reply with a *SECRET PASSWORD* (min 8 chars).\n\nLogin: https://tallypadi.com/login`
      );
      return;
    }

    if (user.registrationStage === 'PASSWORD') {
      if (text.length < 8) {
        await queueOutboundMessage(from, '❌ Password too short. Please use at least 8 characters.');
        return;
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(text, salt);
      user.registrationStage = 'COMPLETED';
      await user.save();

      await queueOutboundMessage(from, `✅ Password Saved!\n\nTry: *I sold 2 bags of rice for ${symbol}50k*`);
      return;
    }

    // --- PLAN RULES ---
    if (isVoiceMessage && user.planType !== 'TYCOON') {
      await queueOutboundMessage(from, '🎤 Voice messages are only available for *Tycoon Plan* users. Upgrade to use this feature!');
      return;
    }

    // --- SUB CHECK + HISTORY ---
    if (user.registrationStage === 'COMPLETED') {
      const isAllowed = await checkSubscriptionStatus(user);
      if (!isAllowed) return;

      user.messageHistory = user.messageHistory || [];
      if (user.messageHistory.length >= MAX_HISTORY) user.messageHistory.shift();
      user.messageHistory.push(text);
      await user.save();
    }

    // ✅ QUICK DEBT LIST COMMAND (no Gemini)
    const low = (text || '').toLowerCase().trim();

// ✅ 1) Debt / Debtors list
const isDebtCmd =
  low === 'debt' ||
  low.includes('debtors') ||
  /\b(debt|debts|debtor|debtors|owing|owes|owe|gbese|bashi|ugwo)\b/.test(low) ||
  low.includes('dey owe') ||
  low.includes('who dey owe') ||
  low.includes('who is owing') ||
  low.includes('who owes');
  const isPaymentPhrase = /\b(paid|pay|payment|settle|settled|i paid|don pay)\b/.test(low);

if (isDebtCmd && !isPaymentPhrase) {
  const msg = await buildDebtSummary(user._id, symbol, locale);
  await queueOutboundMessage(from, msg);
  return;
}

// ✅ 2) Undo last sale
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
    const parsed: any = await parseMessageWithGemini(text, currentLang, imageBuffer, imageMime);
    

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
        // ✅ records SALE, CREDIT sales, and customer_name if your Transaction model + processTransaction are updated (see below)
        await processTransaction(user._id as any, parsed, messageId);
        await queueOutboundMessage(from, parsed.reply_text || '✅ Done.');
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
        // ✅ records PAYMENT_RECEIVED and customer_name (if processTransaction is updated)
        await processTransaction(user._id as any, parsed, messageId);

        const amt = parsed.total_money ? `${symbol}${Number(parsed.total_money).toLocaleString(locale)}` : 'the payment';
        const nm = parsed.customer_name ? ` from ${parsed.customer_name}` : '';
        await queueOutboundMessage(from, `✅ Payment Recorded! Received ${amt}${nm}.`);
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

        const priceFmt = item.lastUnitPrice > 0 ? `${symbol}${item.lastUnitPrice.toLocaleString(locale)}` : 'Not set yet';
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

      default:
        await queueOutboundMessage(from, parsed.reply_text || 'Noted.');
        break;
    }
  } catch (err) {
    console.error('❌ Error processing message logic:', err);
    throw err; // ✅ let BullMQ retry
  }
};
