import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import { env } from '../config/env';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { DeletedItem } from '../models/deletedItem.model';
import { parseMessageWithGemini } from '../services/gemini.service';
// 🟢 NEW IMPORT: Import the function to queue outbound messages
import { queueOutboundMessage } from '../services/queue.service'; 
// 🔴 REMOVED: import { sendWhatsAppText } from '../services/whatsapp.service'; // We queue instead of sending directly

import { processTransaction } from '../services/transaction.service';
import { getDailySummary, getStockReport, getFullSummary, getTodayTransactions } from '../services/report.service';
import { generatePdfReport } from '../services/pdf.service';
import { messageQueue } from '../services/queue.service';
import { checkSubscriptionStatus } from '../services/billing.service';
import { AdminSettings } from '../models/adminSettings.model';

// 🌍 CURRENCY CONFIGURATION
const COUNTRY_CURRENCIES: { [key: string]: { symbol: string, code: string, locale: string } } = {
  'NG': { symbol: '₦', code: 'NGN', locale: 'en-NG' },
  'US': { symbol: '$', code: 'USD', locale: 'en-US' },
  'GB': { symbol: '£', code: 'GBP', locale: 'en-GB' },
  'EU': { symbol: '€', code: 'EUR', locale: 'en-IE' },
  'GH': { symbol: '₵', code: 'GHS', locale: 'en-GH' },
  'KE': { symbol: 'KSh', code: 'KES', locale: 'en-KE' },
  'ZA': { symbol: 'R', code: 'ZAR', locale: 'en-ZA' },
  'IN': { symbol: '₹', code: 'INR', locale: 'en-IN' },
  'CA': { symbol: 'C$', code: 'CAD', locale: 'en-CA' },
  // Fallback
  'DEFAULT': { symbol: '₦', code: 'NGN', locale: 'en-NG' }
};

// 🟢 HELPER: Get Currency Settings based on User
const getUserCurrency = (user: any) => {
    let countryCode = user.countryCode; 

    if (!countryCode && user.phoneNumber) {
        const phone = user.phoneNumber.replace('+', '');
        if (phone.startsWith('234')) countryCode = 'NG';
        else if (phone.startsWith('1')) countryCode = 'US';
        else if (phone.startsWith('44')) countryCode = 'GB';
        else if (phone.startsWith('233')) countryCode = 'GH';
        else if (phone.startsWith('254')) countryCode = 'KE';
        else if (phone.startsWith('27')) countryCode = 'ZA';
        else if (phone.startsWith('91')) countryCode = 'IN';
    }

    return COUNTRY_CURRENCIES[countryCode] || COUNTRY_CURRENCIES['DEFAULT'];
};

// HELPER: Fetch Image Data from Meta (Used by Worker)
const getMediaBuffer = async (mediaId: string): Promise<{ data: string; mimeType: string } | null> => {
  try {
    const urlRes = await axios.get(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${env.whatsappToken}` }
    });
    const mediaUrl = urlRes.data.url;

    const mediaRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${env.whatsappToken}` },
      responseType: 'arraybuffer'
    });

    const base64Data = Buffer.from(mediaRes.data).toString('base64');
    return { data: base64Data, mimeType: mediaRes.headers['content-type'] };
  } catch (error) {
    console.error('❌ Failed to download media:', error);
    return null;
  }
};

// 1. VERIFY WEBHOOK
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

// 2. FAST RECEIVER (Pushes to Queue)
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      return res.sendStatus(200);
    }

    const value = body.entry[0].changes[0].value;
    const msg = value.messages[0];
    const from = msg.from; 
    const messageId = msg.id;
    
    // 🟢 EXTRACT PROFILE NAME (Robust)
    const contacts = value.contacts;
    const profileName = contacts && contacts[0]?.profile?.name ? contacts[0].profile.name : undefined;

    if (profileName) {
        console.log(`👤 Captured Profile Name for ${from}: ${profileName}`);
    } else {
        console.log(`⚠️ No Profile Name found in webhook for ${from}`);
    }

    let text: string = '';
    let mediaId: string | undefined = undefined;
    let isVoiceMessage = false;

    switch (msg.type) {
        case 'text':
            text = msg.text.body;
            break;
        case 'image':
            text = msg.image.caption || "Analyze this image";
            mediaId = msg.image.id;
            break;
        case 'audio':
            text = "Analyze this audio";
            mediaId = msg.audio.id;
            isVoiceMessage = true;
            break;
        default:
            console.log(`Unsupported message type received: ${msg.type}`);
            return res.sendStatus(200);
    }

    if (!text && !mediaId) {
        console.log("Ignoring message with no text or media ID.");
        return res.sendStatus(200);
    }

    // 🚀 QUEUE IT!
    await messageQueue.add('process-message', { 
        from, 
        text, 
        messageId, 
        mediaId,
        isVoiceMessage,
        profileName // 🟢 Passing it to queue
    });

    console.log(`📥 Queued message from ${from}`);
    return res.sendStatus(200);

  } catch (err) {
    console.error('❌ Error in webhook receiver:', err);
    return res.sendStatus(500);
  }
};

// 3. BACKGROUND PROCESSOR (Called by Worker)
export const handleMessageLogic = async (from: string, text: string, messageId: string, mediaId?: string, isVoiceMessage?: boolean, profileName?: string) => {
  try {
    console.log(`⚡ Processing Logic for ${from}: "${text}"`);
    if (profileName) console.log(`👤 Profile Name Available: ${profileName}`);

    // --- FETCH GLOBAL SETTINGS ---
    const globalSettings = await AdminSettings.findOne();
    const MAX_HISTORY = globalSettings?.limits?.maxMessageHistory || 5;
    const MAX_STAFF = globalSettings?.limits?.maxStaffAccounts || 5;

    // --- FETCH IMAGE IF EXISTS ---
    let imageBuffer = undefined;
    let imageMime = undefined;
    if (mediaId) {
        const media = await getMediaBuffer(mediaId);
        if (media) {
            imageBuffer = media.data;
            imageMime = media.mimeType;
        }
    }

    // --- USER AUTHENTICATION ---
    let user = await User.findOne({ phoneNumber: from });

    // 🟢 GET CURRENCY SYMBOL & LOCALE FOR THIS SESSION
    const currency = getUserCurrency({ phoneNumber: from }); // Get based on phone number guess for new users
    const { symbol, locale, code } = getUserCurrency(user || { phoneNumber: from }); // Re-fetch based on full user object if available

    if (!user) {
      // Logic to auto-detect country code for new user
      
      // Derive shop name from profile name if available, otherwise default
      const initialShopName = profileName || "My Shop";
      
      user = await User.create({ 
        phoneNumber: from, 
        businessName: initialShopName,
        name: profileName, // 🟢 Also save to name field
        countryCode: currency.code === 'NGN' ? 'NG' : (currency.code === 'USD' ? 'US' : 'NG'), // Simple guess save
        registrationStage: 'EMAIL',
        settings: { dailySummaryEnabled: false, closingTime: '20:00', utcOffsetMinutes: 60, language: 'English', pdfReportsEnabled: false }
      });
      
      // Personalized welcome message
      const shopNote = profileName 
          ? `I've used your WhatsApp name (*${profileName}*) as your shop name.` 
          : `I've set your shop name to *"${user.businessName}"*`;

      const welcomeMsg = `Welcome to *Tallypadi*, ${profileName || 'Friend'}! 👋\n\n${shopNote}\n\nTo start, please reply with your **EMAIL ADDRESS** (for account recovery).`;
      await queueOutboundMessage(from, welcomeMsg); // 🟢 QUEUE RESPONSE
      return;
    }

    if (user.registrationStage === 'EMAIL') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(text)) {
            await queueOutboundMessage(from, "❌ Invalid email format. Please enter a valid email address."); // 🟢 QUEUE RESPONSE
            return;
        }
        const existingUser = await User.findOne({ email: text });
        if (existingUser) {
            await queueOutboundMessage(from, "This email is already registered. Please use a different email."); // 🟢 QUEUE RESPONSE
            return;
        }
        user.email = text;
        user.registrationStage = 'PASSWORD';
        await user.save();
        await queueOutboundMessage(from, "✅ Email Saved! Now, please reply with a **SECRET PASSWORD** (min 8 chars) to secure your account.\n\nYou can also login to the dashboard here:\n👉 https://tallypadi.com/login"); // 🟢 QUEUE RESPONSE
        return;
    }

    if (user.registrationStage === 'PASSWORD') {
      if (text.length < 8) {
        await queueOutboundMessage(from, "❌ Password too short. Please use at least 8 characters."); // 🟢 QUEUE RESPONSE
        return;
      }
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(text, salt);
      user.registrationStage = 'COMPLETED';
      await user.save();
      await queueOutboundMessage(from, `✅ Password Saved! \n\nYou can now start using Tallypadi.\nTry saying: *'I sold 2 bags of rice for ${symbol}50k'*`); // 🟢 QUEUE RESPONSE
      return;
    }

    if (isVoiceMessage && user.planType !== 'TYCOON') {
        await queueOutboundMessage(from, "🎤 Voice messages are only available for **Tycoon Plan** subscribers. Upgrade to use this feature!"); // 🟢 QUEUE RESPONSE
        return;
    }

    if (user.registrationStage === 'COMPLETED') {
        const isAllowed = await checkSubscriptionStatus(user);
        if (!isAllowed) return; 

        if (user.messageHistory.length >= MAX_HISTORY) {
            user.messageHistory.shift(); 
        }
        user.messageHistory.push(text); 
        await user.save();
    }

    // --- AI PROCESSING ---
    const currentLang = user.settings?.language || 'English';
    const parsed = await parseMessageWithGemini(text, currentLang, imageBuffer, imageMime);

    // --- DATE PARSING LOGIC ---
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let dateLabel = "Today's";

    if (parsed.report_params?.start_date) {
        startDate = new Date(parsed.report_params.start_date);
        if (parsed.report_params.end_date) {
            endDate = new Date(parsed.report_params.end_date);
        } else {
             endDate = new Date(startDate);
             endDate.setHours(23, 59, 59, 999);
        }

        const today = new Date();
        const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
        
        if (startDate.toDateString() === today.toDateString()) {
            dateLabel = "Today's";
        } else if (startDate.toDateString() === yesterday.toDateString()) {
            dateLabel = "Yesterday's";
        } else {
            const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays > 20) dateLabel = "Monthly";
            else if (diffDays > 1) dateLabel = "Weekly";
            else dateLabel = startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        }
    }

    if (parsed.intent === 'CLOSE_BOOK') {
        const currentHour = new Date().getHours();
        if (currentHour < 12) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            
            const yesterdayEnd = new Date(yesterday);
            yesterdayEnd.setHours(23, 59, 59, 999);
            
            startDate = yesterday;
            endDate = yesterdayEnd;
            dateLabel = "Yesterday's (Closed)";
            await queueOutboundMessage(from, "💡 You are replying late! I will close the book for **Yesterday**."); // 🟢 QUEUE RESPONSE
        } else {
            dateLabel = "Today's";
        }
        parsed.intent = 'REPORT_FULL';
    }

    // --- ROUTING ---
    switch (parsed.intent) {
        case 'SALE':
        case 'RESTOCK':
        case 'SET_STOCK':
        case 'DEFINE_PRICE':
            await processTransaction(user._id as any, parsed, messageId);
            await queueOutboundMessage(from, parsed.reply_text); // 🟢 QUEUE RESPONSE
            break;
        
        case 'DELETED_STOCK':
            const itemToDelete = parsed.items[0]?.name?.toLowerCase();
            if (!itemToDelete) {
                await queueOutboundMessage(from, "Which item you wan delete? (e.g. 'Delete Rice')"); // 🟢 QUEUE RESPONSE
            } else {
                const item = await Inventory.findOne({
                    user: user._id,
                    name: { $regex: itemToDelete, $options: 'i' }
                });
                if (item) {
                    const deletedItem = new DeletedItem({
                        user: user._id,
                        name: item.name,
                        quantity: item.quantity,
                    });
                    await deletedItem.save();
                    await Inventory.deleteOne({ _id: item._id });
                    await queueOutboundMessage(from, `🗑️ Deleted *${item.name}* from your stock.`); // 🟢 QUEUE RESPONSE
                } else {
                    await queueOutboundMessage(from, `I no see "${itemToDelete}" inside your shop list o.`); // 🟢 QUEUE RESPONSE
                }
            }
            break;

        case 'DEBT_PAYMENT':
            await processTransaction(user._id as any, parsed, messageId);
            const amt = parsed.total_money ? `${symbol}${parsed.total_money.toLocaleString(locale)}` : 'the payment';
            const name = parsed.customer_name ? ` from ${parsed.customer_name}` : '';
            await queueOutboundMessage(from, `✅ Payment Recorded! Received ${amt}${name}.`); // 🟢 QUEUE RESPONSE
            break;

        case 'PRICE_CHECK':
            const itemQuery = parsed.items[0]?.name?.toLowerCase();
            if (!itemQuery) {
                await queueOutboundMessage(from, "Which item price you wan check? (e.g. 'Price of Rice')"); // 🟢 QUEUE RESPONSE
            } else {
                const item = await Inventory.findOne({ 
                    user: user._id, 
                    name: { $regex: itemQuery, $options: 'i' } 
                });
                if (item) {
                    const priceFmt = item.lastUnitPrice > 0 
                        ? `${symbol}${item.lastUnitPrice.toLocaleString(locale)}` 
                        : "Not set yet";
                    await queueOutboundMessage(from, `🏷️ *Price Check: ${item.name.toUpperCase()}*\n\n💰 Last recorded price: *${priceFmt}*\n📦 Stock Level: *${item.quantity}*`); // 🟢 QUEUE RESPONSE
                } else {
                    await queueOutboundMessage(from, `I no see "${itemQuery}" inside your shop list o.`); // 🟢 QUEUE RESPONSE
                }
            }
            break;

        case 'REPORT_SALES':
            await queueOutboundMessage(from, `Calculating ${dateLabel.toLowerCase()} report... ⏳`); // 🟢 QUEUE RESPONSE
            
            const summary = await getDailySummary(user._id as any, startDate, endDate);
            // 🟢 DYNAMIC CURRENCY
            const totalFormatted = summary.totalRevenue.toLocaleString(locale, { style: 'currency', currency: code, maximumFractionDigits: 0 });

            const transactions = await getTodayTransactions(user._id as any, startDate, endDate);

            let salesMsg = `📅 *${dateLabel} Sales Breakdown*\n\n`; 

            if (transactions.length > 0) {
              const transactionsByUser = transactions.reduce((acc, t) => {
                const userId = (t.user as any)._id.toString();
                if (!acc[userId]) {
                  acc[userId] = { user: t.user, transactions: [] };
                }
                acc[userId].transactions.push(t);
                return acc;
              }, {} as Record<string, { user: any; transactions: any[] }>);

              for (const userId in transactionsByUser) {
                const userData = transactionsByUser[userId].user;
                const userTransactions = transactionsByUser[userId].transactions;
                const userIdentifier = userData.businessName || userData.phoneNumber;
                salesMsg += `*Transactions by ${userIdentifier}:*\n`;

                userTransactions.forEach((t) => {
                  const date = new Date(t.timestamp);
                  const hours = date.getHours().toString().padStart(2, '0');
                  const minutes = date.getMinutes().toString().padStart(2, '0');
                  const timeStr = `${hours}:${minutes}`;
                  const dateStr = dateLabel === "Today's" ? "" : `(${date.getDate()}/${date.getMonth()+1}) `;

                  t.items.forEach((item: any) => {
                     // 🟢 DYNAMIC CURRENCY
                     const itemTotal = item.total ? `${symbol}${item.total.toLocaleString(locale, { maximumFractionDigits: 0 })}` : '(No Price)';
                     const unitLabel = item.unit ? ` ${item.unit}` : '';
                     salesMsg += `   🕒 ${dateStr}${timeStr} • ${item.name} (${item.qty}${unitLabel}) - ${itemTotal}\n`;
                  });
                });
                salesMsg += `\n`;
              }
            } else {
              salesMsg += `_No sales recorded for ${dateLabel.toLowerCase()}._\n\n`;
            }

            salesMsg += `💰 *Total Money:* ${totalFormatted}\n`;
            salesMsg += `📉 *Total Transactions:* ${transactions.length}`;
            
            await queueOutboundMessage(from, salesMsg); // 🟢 QUEUE RESPONSE

            if (user.planType === 'TYCOON') {
                try {
                    const pdfFileName = await generatePdfReport(user._id as any, 'SALES', dateLabel, startDate, endDate);
                    const downloadLink = `https://tallypadi.com/reports/${pdfFileName}`;
                    await queueOutboundMessage(from, `✨ Tycoon Feature: Download your sales report as PDF here: ${downloadLink}\n\nLink expires in 24 hours.`); // 🟢 QUEUE RESPONSE
                } catch (pdfError) {
                    console.error('❌ Error generating PDF for sales report:', pdfError);
                }
            }
            break;

        case 'REPORT_STOCK':
            await queueOutboundMessage(from, "Checking inventory... 📦"); // 🟢 QUEUE RESPONSE
            const targetItem = parsed.items && parsed.items.length > 0 ? parsed.items[0].name : null;
            const stockList = await getStockReport(user._id as any, targetItem);

            if (stockList.length === 0) {
               await queueOutboundMessage(from, "Your inventory is empty or item not found."); // 🟢 QUEUE RESPONSE
            } else {
               let stockMsg = `📦 *Current Stock Balance* 📦\n\n`;
               let hasNegative = false;
               stockList.forEach(item => {
                 if (item.quantity < 0) {
                    hasNegative = true;
                    stockMsg += `• ${item.name}: ⚠️ *${Math.abs(item.quantity)}* (Oversold/Not Recorded)\n`;
                 } else {
                    stockMsg += `• ${item.name}: *${item.quantity}* remaining\n`;
                 }
               });
               if (hasNegative) {
                   stockMsg += `\n_Note: Some items show negative numbers. Please update me when you restock._`;
               }
               await queueOutboundMessage(from, stockMsg); // 🟢 QUEUE RESPONSE
            }
            break;

        case 'REPORT_FULL':
            await queueOutboundMessage(from, "Generating comprehensive report... 📋"); // 🟢 QUEUE RESPONSE
            const fullData = await getFullSummary(user._id as any, startDate, endDate);
            const revenueSummary = await getDailySummary(user._id as any, startDate, endDate);
            
            // 🟢 DYNAMIC CURRENCY
            let fullMsg = `📋 *${dateLabel} Business Summary* 📋\n\n`;
            fullMsg += `💰 *Revenue (${dateLabel}):* ${symbol}${revenueSummary.totalRevenue.toLocaleString(locale)}\n`;
            fullMsg += `📉 *Items Sold:* ${revenueSummary.items.length}\n\n`;

            if (fullData.length === 0) {
                fullMsg += "_No data found for this period._";
            } else {
                fullMsg += `*Current Inventory Status:*\n`;
                fullData.forEach(item => {
                    const unit = item.unit || 'units';
                    // 🟢 DYNAMIC CURRENCY
                    const revenue = item.revenue > 0 ? `${symbol}${item.revenue.toLocaleString(locale)}` : 'Price: Not provided';
                    
                    fullMsg += `🔹 *${item.name.toUpperCase()}*\n`;
                    if (item.soldPaid > 0) fullMsg += `   • Sold (Paid): ${item.soldPaid} ${unit}\n`;
                    if (item.soldCredit > 0) fullMsg += `   • Sold (Credit): ${item.soldCredit} ${unit} ⚠️\n`;
                    
                    if (item.stock < 0) {
                        fullMsg += `   • Stock Left: 0 ${unit} (⚠️ System shows -${Math.abs(item.stock)}. Please update stock!)\n`;
                    } else {
                        fullMsg += `   • Stock Left: ${item.stock} ${unit}\n`;
                    }
                    
                    // 🟢 DYNAMIC CURRENCY
                    const itemRevenue = item.revenue > 0 ? `${symbol}${item.revenue.toLocaleString(locale)}` : null;
                    if (itemRevenue) fullMsg += `   • Revenue: ${itemRevenue}\n`;
                    fullMsg += `\n`;
                });
                fullMsg += `_End of Report_`;
            }
            await queueOutboundMessage(from, fullMsg); // 🟢 QUEUE RESPONSE

            if (user.planType === 'TYCOON') {
                try {
                    const pdfFileName = await generatePdfReport(user._id as any, 'FULL', dateLabel, startDate, endDate);
                    const downloadLink = `https://tallypadi.com/reports/${pdfFileName}`;
                    await queueOutboundMessage(from, `✨ Tycoon Feature: Download your comprehensive report as PDF here: ${downloadLink}\n\nLink expires in 24 hours.`); // 🟢 QUEUE RESPONSE
                } catch (pdfError) {
                    console.error('❌ Error generating PDF for full report:', pdfError);
                }
            }
            break;

        case 'CHANGE_LANGUAGE':
            if (parsed.settings_update.key === 'language' && parsed.settings_update.value) {
                user.settings.language = parsed.settings_update.value as string;
                await user.save();
                await queueOutboundMessage(from, parsed.reply_text || `Language changed to ${parsed.settings_update.value}`); // 🟢 QUEUE RESPONSE
            } else {
                await queueOutboundMessage(from, parsed.reply_text || "Okay."); // 🟢 QUEUE RESPONSE
            }
            break;

        case 'SETTINGS':
            if (parsed.settings_update.key === 'closingTime' && parsed.settings_update.value) {
              user.settings.closingTime = parsed.settings_update.value as string;
              await user.save();
              await queueOutboundMessage(from, `✅ Done! Closing time set to ${user.settings.closingTime}.`); // 🟢 QUEUE RESPONSE
            } else {
              await queueOutboundMessage(from, parsed.reply_text); // 🟢 QUEUE RESPONSE
            }
            break;

        case 'ADD_STAFF':
            if (user.planType !== 'TYCOON') {
                await queueOutboundMessage(from, "🛑 Staff accounts are for **Tycoon Plan** users only. Upgrade now to add your sales boy/girl."); // 🟢 QUEUE RESPONSE
                break;
            }

            const staffPhoneNumber = parsed.staffPhoneNumber;
            if (!staffPhoneNumber) {
                await queueOutboundMessage(from, "Please provide the phone number of the staff you want to add."); // 🟢 QUEUE RESPONSE
                break;
            }

            const staffCount = await User.countDocuments({ ownerId: user._id });
            if (staffCount >= MAX_STAFF) {
                await queueOutboundMessage(from, `You have reached the maximum staff limit (${MAX_STAFF}).`); // 🟢 QUEUE RESPONSE
                break;
            }

            const existingStaff = await User.findOne({ phoneNumber: staffPhoneNumber });
            if (existingStaff) {
                await queueOutboundMessage(from, "This user is already registered on Tallypadi."); // 🟢 QUEUE RESPONSE
                break;
            }

            const newStaff = await User.create({
                phoneNumber: staffPhoneNumber,
                role: 'STAFF',
                ownerId: user._id, 
                planType: 'TYCOON', 
                registrationStage: 'COMPLETED'
            });

            await queueOutboundMessage(from, `✅ Successfully added ${newStaff.phoneNumber} as your staff.`); // 🟢 QUEUE RESPONSE
            await queueOutboundMessage(newStaff.phoneNumber, `🔔 You have been added as a staff member by ${user.phoneNumber}. You can now record sales for their shop.`); // 🟢 QUEUE RESPONSE
            break;

        case 'DOWNLOAD_REPORT':
            if (user.planType !== 'TYCOON') {
                await queueOutboundMessage(from, "📄 PDF reports are a **Tycoon Plan** feature. Upgrade your plan to unlock this functionality!"); // 🟢 QUEUE RESPONSE
                break;
            }

            await queueOutboundMessage(from, "Generating your PDF report... This may take a moment. 📄"); // 🟢 QUEUE RESPONSE

            let pdfReportType: 'SALES' | 'FULL' = 'FULL'; 
            if (parsed.intent === 'DOWNLOAD_REPORT' && parsed.reply_text.toLowerCase().includes('sales')) {
                pdfReportType = 'SALES';
            } else if (parsed.intent === 'DOWNLOAD_REPORT' && parsed.reply_text.toLowerCase().includes('summary')) {
                pdfReportType = 'FULL';
            } else if (parsed.intent === 'DOWNLOAD_REPORT' && parsed.report_params?.start_date && parsed.report_params?.end_date) {
                pdfReportType = 'SALES';
            }
            
            try {
                const pdfFileName = await generatePdfReport(user._id as any, pdfReportType, dateLabel, startDate, endDate);
                const downloadLink = `https://tallypadi.com/reports/${pdfFileName}`; 
                await queueOutboundMessage(from, `✅ Your PDF report is ready: ${downloadLink}\n\nLink expires in 24 hours.`); // 🟢 QUEUE RESPONSE
            } catch (pdfError) {
                console.error('❌ Error generating PDF:', pdfError);
                await queueOutboundMessage(from, "Sorry, I encountered an error while generating your PDF report. Please try again later."); // 🟢 QUEUE RESPONSE
            }
            break;

        default:
            await queueOutboundMessage(from, parsed.reply_text); // 🟢 QUEUE RESPONSE
            break;
    }
  } catch (err) {
    console.error('❌ Error processing message logic:', err);
  }
};