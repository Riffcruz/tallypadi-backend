import { Types } from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { DailyStats } from '../models/dailyStats.model';
import { User } from '../models/user.model';
import { ParsedResult } from './gemini.service';
import { notificationQueue } from './queue.service';
import { ProcessedMessage } from '../models/processedMessage.model';

function normalizeName(name: string) {
  return name.replace(/\s*\(.*?\)\s*$/, '').toLowerCase().trim();
}

export const processTransaction = async (
  userId: Types.ObjectId,
  parsed: ParsedResult,
  messageId: string
) => {
  // ✅ 0) CLAIM LOCK FIRST (prevents double inventory update)
  let lockCreated = false;
  try {
    await ProcessedMessage.create({
      user: userId,
      messageId,
      status: 'PROCESSING'
    });
    lockCreated = true;
  } catch (e: any) {
    // Duplicate lock => already processing or processed
    if (e?.code === 11000) {
      console.log(`⚠️ Duplicate message detected (${messageId}). Skipping safely.`);
      return;
    }
    throw e;
  }

  try {
    // --- TIME CALCULATION ---
    const user = await User.findById(userId);
    const offset = user?.settings?.utcOffsetMinutes ?? 60;

    const now = new Date();
    const localTime = new Date(now.getTime() + offset * 60 * 1000);
    const todayString = localTime.toISOString().split('T')[0];

    // ✅ Handle DEBT PAYMENT
    if (parsed.intent === 'DEBT_PAYMENT') {
      await Transaction.create({
        user: userId,
        type: 'PAYMENT_RECEIVED',
        paymentStatus: 'PAID',
        totalMoney: parsed.total_money,
        messageId,
        items: [],
        timestamp: now,
        date: todayString
      });

      // optional stats update (keep your behavior)
      if (parsed.total_money) {
        await DailyStats.findOneAndUpdate(
          { user: userId, date: todayString },
          { $inc: { totalRevenue: parsed.total_money, totalTransactions: 1 } },
          { upsert: true }
        );
      }

      await ProcessedMessage.updateOne({ messageId }, { $set: { status: 'DONE' } });
      return;
    }

    // Map intents
    let type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT';
    if (parsed.intent === 'SALE') type = 'SALE';
    else if (parsed.intent === 'RESTOCK') type = 'RESTOCK';
    else if (parsed.intent === 'SET_STOCK') type = 'ADJUSTMENT';
    else type = 'ADJUSTMENT';

    // --- Apply inventory updates per item ---
    for (const item of parsed.items || []) {
      const qty = Number(item.qty || 0);
      if (!qty || qty <= 0) continue;

      const cleanName = normalizeName(item.name || 'unknown_item');
      if (!cleanName) continue;

      let inv = await Inventory.findOne({ user: userId, name: cleanName });

      if (!inv) {
        inv = new Inventory({
          user: userId,
          name: cleanName,
          quantity: 0,
          lastUnitPrice: 0
        });
      }

      if (item.unit_price && Number(item.unit_price) > 0) {
        inv.lastUnitPrice = Number(item.unit_price);
      }

      if (type === 'SALE') {
        inv.quantity = inv.quantity - qty;
      } else if (type === 'RESTOCK') {
        // ✅ Fix: always add (even if negative stock)
        inv.quantity = inv.quantity + qty;
      } else {
        // ADJUSTMENT
        inv.quantity = qty;
      }

      await inv.save();

      // LOW STOCK ALERT
      if (type === 'SALE' && inv.quantity <= 5 && inv.quantity > 0) {
        if (user) {
          await notificationQueue.add('daily-summary', {
            phoneNumber: user.phoneNumber,
            message: `⚠️ *Low Stock Alert:* ${inv.name} is running low (${inv.quantity} left). Restock soon!`
          });
        }
      }
    }

    // Record transaction
    await Transaction.create({
      user: userId,
      type,
      paymentStatus: parsed.is_credit ? 'CREDIT' : 'PAID',
      items: (parsed.items || []).slice(0, 30).map((i) => {
        const name = normalizeName(i.name || 'unknown_item');
        const qty = Number(i.qty || 0);
        const unitPrice = i.unit_price == null ? null : Number(i.unit_price);
        return {
          name,
          qty,
          unit: i.unit || 'pcs',
          unitPrice,
          total: unitPrice != null && qty > 0 ? unitPrice * qty : null
        };
      }),
      totalMoney: parsed.total_money,
      messageId,
      timestamp: now,
      date: todayString
    });

    if (type === 'SALE' && parsed.total_money) {
      await DailyStats.findOneAndUpdate(
        { user: userId, date: todayString },
        { $inc: { totalRevenue: parsed.total_money, totalTransactions: 1 } },
        { upsert: true }
      );
    }

    await ProcessedMessage.updateOne({ messageId }, { $set: { status: 'DONE' } });
  } catch (err: any) {
    console.error('❌ processTransaction error:', err);

    // Mark lock FAILED (so you can later build a “retry failed” repair job)
    await ProcessedMessage.updateOne(
      { messageId },
      { $set: { status: 'FAILED', error: String(err?.message || err) } }
    );

    // Optional: if you prefer automatic retries to re-run inventory updates,
    // delete the lock here instead of FAILED:
    // if (lockCreated) await ProcessedMessage.deleteOne({ messageId });

    throw err;
  }
};
