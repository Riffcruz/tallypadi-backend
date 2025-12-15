import { Types } from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { DailyStats } from '../models/dailyStats.model';
import { User } from '../models/user.model';
import { ParsedResult } from './gemini.service';
import { notificationQueue } from './queue.service';

export const processTransaction = async (
    userId: Types.ObjectId, 
    parsed: ParsedResult,
    messageId: string 
) => {
  
  // 1. IDEMPOTENCY CHECK
  const existingTransaction = await Transaction.findOne({ messageId });
  if (existingTransaction) {
      console.log(`⚠️ Duplicate message detected (${messageId}). Skipping.`);
      return; 
  }

  // --- TIME CALCULATION ---
  const user = await User.findById(userId);
  const offset = user?.settings?.utcOffsetMinutes ?? 60;
  
  const now = new Date();
  const localTime = new Date(now.getTime() + offset * 60 * 1000);
  const todayString = localTime.toISOString().split('T')[0];

  // 2. HANDLE DEBT PAYMENT
  if (parsed.intent === 'DEBT_PAYMENT') {
      await Transaction.create({
          user: userId,
          type: 'PAYMENT_RECEIVED',
          paymentStatus: 'PAID',
          totalMoney: parsed.total_money,
          messageId: messageId,
          items: [],
          timestamp: now,
          date: todayString
      });
      
      if (parsed.total_money) {
          await DailyStats.findOneAndUpdate(
              { user: userId, date: todayString },
              { $inc: { totalRevenue: parsed.total_money, totalTransactions: 1 } },
              { upsert: true }
          );
      }
      return; 
  }

  // Map intents
  let type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT';
  if (parsed.intent === 'SALE') type = 'SALE';
  else if (parsed.intent === 'RESTOCK') type = 'RESTOCK';
  else type = 'ADJUSTMENT'; 

  for (const item of parsed.items) {
    const cleanName = item.name.replace(/\s*\(.*?\)\s*$/, "").toLowerCase().trim();
    
    let inv = await Inventory.findOne({ user: userId, name: cleanName });

    if (!inv) {
      // Initialize with baseUnit logic (defaulting to 'pcs' or whatever unit was sent if it's the first time)
      inv = new Inventory({ 
          user: userId, 
          name: cleanName, 
          quantity: 0, 
          lastUnitPrice: 0,
          // If you updated the model for unit conversion, initialize those fields here too
          // totalBaseQuantity: 0, 
          // baseUnit: item.unit || 'pcs' 
      });
    }

    if (item.unit_price && item.unit_price > 0) {
        inv.lastUnitPrice = item.unit_price;
    }

    // --- QUANTITY LOGIC (Simplified for now, add conversion logic here if model supports it) ---
    // If you implemented the unit conversion model update:
    // 1. Check item.unit against inv.conversions
    // 2. Calculate quantityChange = item.qty * conversionRatio
    // 3. Update inv.totalBaseQuantity
    
    // For standard logic (current schema):
    if (type === 'SALE') {
      inv.quantity = inv.quantity - item.qty;
    } else if (type === 'RESTOCK') {
      if (inv.quantity < 0) {
        inv.quantity = item.qty;
      } else {
        inv.quantity = inv.quantity + item.qty;
      }
    } else if (type === 'ADJUSTMENT') {
      inv.quantity = item.qty;
    }
    
    await inv.save();

    // 🟢 LOW STOCK ALERT
    if (type === 'SALE' && inv.quantity <= 5 && inv.quantity > 0) {
        if (user) {
            await notificationQueue.add('daily-summary', { 
                phoneNumber: user.phoneNumber,
                message: `⚠️ *Low Stock Alert:* ${inv.name} is running low (${inv.quantity} left). Restock soon!`
            });
        }
    }
  }

  // Record Transaction
  await Transaction.create({
    user: userId,
    type,
    paymentStatus: parsed.is_credit ? 'CREDIT' : 'PAID',
    items: parsed.items.map((i) => ({
      name: i.name.replace(/\s*\(.*?\)\s*$/, "").toLowerCase().trim(),
      qty: i.qty,
      unit: i.unit || 'pcs', 
      unitPrice: i.unit_price,
      total: i.unit_price && i.qty ? i.unit_price * i.qty : null,
    })),
    totalMoney: parsed.total_money,
    messageId: messageId,
    timestamp: now,
    date: todayString
  });

  if (type === 'SALE' && parsed.total_money) {
      await DailyStats.findOneAndUpdate(
          { user: userId, date: todayString },
          { 
              $inc: { totalRevenue: parsed.total_money, totalTransactions: 1 } 
          },
          { upsert: true } 
      );
  }
};