import { Types } from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { DailyStats } from '../models/dailyStats.model';
import { User } from '../models/user.model';
import { ParsedResult } from './gemini.service';
import { queueOutboundMessage } from './queue.service';
import { ProcessedMessage } from '../models/processedMessage.model';

import { applyPaymentToDebts } from './debt.service';
import { resolveDebtor, normName } from './debtor.service';
import { Debtor } from '../models/debtor.model';

function normalizeItemName(name: string) {
  return String(name || '')
    .replace(/\s*\(.*?\)\s*$/, '') // remove "(...)" at end
    .toLowerCase()
    .trim();
}

function toNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toISODateForOffset(offsetMinutes: number): string {
  const now = new Date();
  const localTime = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  return localTime.toISOString().split('T')[0];
}

export const processTransaction = async (
  userId: Types.ObjectId,
  parsed: ParsedResult,
  messageId: string
) => {
  // ✅ 0) CLAIM LOCK FIRST (prevents double inventory update)
  try {
    await ProcessedMessage.create({
      user: userId,
      messageId,
      status: 'PROCESSING',
    });
  } catch (e: any) {
    if (e?.code === 11000) {
      console.log(`⚠️ Duplicate message detected (${messageId}). Skipping safely.`);
      return;
    }
    throw e;
  }

  try {
    // --- TIME / USER ---
    const user = await User.findById(userId).lean();
    const offset = user?.settings?.utcOffsetMinutes ?? 60;
    const todayString = toISODateForOffset(offset);
    const now = new Date();

    // =========================================================
    // ✅ DEBT PAYMENT (PAYMENT_RECEIVED + apply to credit sales)
    // =========================================================
    if (parsed.intent === 'DEBT_PAYMENT') {
      const rawName = String(parsed.customer_name || '').trim();
      const amt = toNumber(parsed.total_money);

      if (!rawName || amt <= 0) {
        parsed.reply_text = "To record payment, type like: *Emeka paid 20000*";
        await ProcessedMessage.updateOne(
          { user: userId, messageId },
          { $set: { status: 'DONE' } }
        );
        return;
      }

      // resolve debtor
      const res = await resolveDebtor(userId, rawName);

      if (res.status === 'suggest') {
        const list = res.options
          .map((o, i) => `${i + 1}) ${o.displayName}`)
          .join('\n');
        parsed.reply_text =
          `I see similar names. Reply the correct number:\n\n${list}\n\nOr type the full name again (add surname).`;

        await ProcessedMessage.updateOne(
          { user: userId, messageId },
          { $set: { status: 'DONE' } }
        );
        return;
      }

      let debtorId: Types.ObjectId | null = null;
      let displayName = rawName;
      let debtorKey = normName(rawName);

      if (res.status === 'new') {
        const created = await Debtor.create({
          user: userId,
          displayName: res.displayName,
          debtorKey: res.debtorKey,
          aliases: [res.debtorKey],
        });
        debtorId = created._id as any;
        displayName = created.displayName;
        debtorKey = created.debtorKey;
      } else {
        debtorId = res.debtorId as any;
        displayName = res.displayName;
        debtorKey = res.debtorKey;
      }

      // record payment event (audit)
      await Transaction.create({
        user: userId,
        type: 'PAYMENT_RECEIVED',
        paymentStatus: 'PAID',
        items: [],
        totalMoney: amt,
        debtorId,
        customerName: displayName,
        customerKey: debtorKey,
        amountPaid: amt,
        balance: 0,
        settledAt: now,
        messageId,
        timestamp: now,
        date: todayString,
      });

      // apply payment to credit sales for that debtor
      const r = await applyPaymentToDebts(userId, debtorId as Types.ObjectId, amt);

      // update stats (money received today)
      await DailyStats.findOneAndUpdate(
        { user: userId, date: todayString },
        { $inc: { totalRevenue: r.applied || 0, totalTransactions: 1 } },
        { upsert: true }
      );

      if (r.applied <= 0) {
        parsed.reply_text = `I no see any outstanding debt for *${displayName}*.`;
      } else if (r.remaining > 0) {
        parsed.reply_text =
          `✅ Payment recorded for *${displayName}*.\n` +
          `Applied: *${r.applied.toLocaleString()}*\n` +
          `Extra: *${r.remaining.toLocaleString()}* (no more debt to match).`;
      } else {
        parsed.reply_text =
          `✅ Payment recorded for *${displayName}*.\n` +
          `Applied: *${r.applied.toLocaleString()}*\n` +
          (r.clearedCount > 0 ? `Cleared debts: *${r.clearedCount}*` : `Noted.`);
      }

      await ProcessedMessage.updateOne(
        { user: userId, messageId },
        { $set: { status: 'DONE' } }
      );
      return;
    }

    // =========================================================
    // Map intents -> transaction type
    // =========================================================
    let type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT';
    if (parsed.intent === 'SALE') type = 'SALE';
    else if (parsed.intent === 'RESTOCK') type = 'RESTOCK';
    else if (parsed.intent === 'SET_STOCK') type = 'ADJUSTMENT';
    else type = 'ADJUSTMENT';

    // =========================================================
    // Resolve debtor for CREDIT SALE
    // =========================================================
    let debtorId: Types.ObjectId | null = null;
    let customerName: string | null = null;
    let customerKey: string | null = null;

    const isCreditSale = type === 'SALE' && Boolean(parsed.is_credit);

    if (isCreditSale) {
      const rawName = String(parsed.customer_name || '').trim();
      if (!rawName) {
        parsed.reply_text = "Who dey owe you? Reply like: *Sold 2 rice to Emeka on credit*";
        await ProcessedMessage.updateOne(
          { user: userId, messageId },
          { $set: { status: 'DONE' } }
        );
        return;
      }

      const res = await resolveDebtor(userId, rawName);

      if (res.status === 'suggest') {
        const list = res.options
          .map((o, i) => `${i + 1}) ${o.displayName}`)
          .join('\n');
        parsed.reply_text =
          `I see similar names. Reply the correct number:\n\n${list}\n\nOr type the full name again (add surname).`;

        await ProcessedMessage.updateOne(
          { user: userId, messageId },
          { $set: { status: 'DONE' } }
        );
        return;
      }

      if (res.status === 'new') {
        const created = await Debtor.create({
          user: userId,
          displayName: res.displayName,
          debtorKey: res.debtorKey,
          aliases: [res.debtorKey],
        });
        debtorId = created._id as any;
        customerName = created.displayName;
        customerKey = created.debtorKey;
      } else {
        debtorId = res.debtorId as any;
        customerName = res.displayName;
        customerKey = res.debtorKey;
      }
    }

    // =========================================================
    // INVENTORY UPDATES (per item)
    // =========================================================
    for (const item of parsed.items || []) {
      const qty = toNumber(item.qty);
      if (qty <= 0) continue;

      const cleanName = normalizeItemName(item.name || 'unknown_item');
      if (!cleanName) continue;

      let inv = await Inventory.findOne({ user: userId, name: cleanName });
      if (!inv) {
        inv = new Inventory({
          user: userId,
          name: cleanName,
          quantity: 0,
          lastUnitPrice: 0,
        });
      }

      const uPrice = item.unit_price == null ? null : toNumber(item.unit_price);
      if (uPrice != null && uPrice > 0) {
        inv.lastUnitPrice = uPrice;
      }

      if (type === 'SALE') {
        inv.quantity = toNumber(inv.quantity) - qty;
      } else if (type === 'RESTOCK') {
        // ✅ always add (even from negative)
        inv.quantity = toNumber(inv.quantity) + qty;
      } else {
        // ADJUSTMENT (SET_STOCK)
        inv.quantity = qty;
      }

      await inv.save();

      // ✅ LOW STOCK ALERT (use queueOutboundMessage)
      // keep it simple: only on SALE, when stock is 1..5
      if (type === 'SALE' && inv.quantity <= 5 && inv.quantity > 0 && user?.phoneNumber) {
        await queueOutboundMessage(
          user.phoneNumber,
          `⚠️ *Low Stock Alert:* ${inv.name} is running low (${inv.quantity} left). Restock soon!`
        );
      }
    }

    // =========================================================
    // RECORD TRANSACTION
    // =========================================================
    const totalMoney = parsed.total_money ?? null;
    const totalNum = toNumber(totalMoney);

    const items = (parsed.items || []).slice(0, 30).map((i) => {
      const name = normalizeItemName(i.name || 'unknown_item');
      const qty = toNumber(i.qty);
      const unitPrice = i.unit_price == null ? null : toNumber(i.unit_price);
      return {
        name,
        qty,
        unit: (i.unit || 'pcs').toString(),
        unitPrice,
        total: unitPrice != null && qty > 0 ? unitPrice * qty : null,
      };
    });

    const paymentStatus =
      type === 'SALE' ? (parsed.is_credit ? 'CREDIT' : 'PAID') : 'PAID';

    const isCredit = paymentStatus === 'CREDIT';

    await Transaction.create({
      user: userId,
      type,
      paymentStatus,
      items,
      totalMoney,

      // ✅ debtor linkage only for credit sales
      debtorId: isCreditSale ? debtorId : null,
      customerName: isCreditSale ? customerName : null,
      customerKey: isCreditSale ? customerKey : null,

      // ✅ debt tracking only meaningful for sales
      amountPaid: type === 'SALE' ? (isCredit ? 0 : totalNum) : 0,
      balance: type === 'SALE' ? (isCredit ? totalNum : 0) : 0,
      settledAt: type === 'SALE' ? (isCredit ? null : now) : null,

      messageId,
      timestamp: now,
      date: todayString,
    });

    // =========================================================
    // DAILY STATS (only count PAID sales as revenue)
    // =========================================================
    if (type === 'SALE' && paymentStatus === 'PAID' && totalNum > 0) {
      await DailyStats.findOneAndUpdate(
        { user: userId, date: todayString },
        { $inc: { totalRevenue: totalNum, totalTransactions: 1 } },
        { upsert: true }
      );
    }

    await ProcessedMessage.updateOne(
      { user: userId, messageId },
      { $set: { status: 'DONE' } }
    );
  } catch (err: any) {
    console.error('❌ processTransaction error:', err);

    await ProcessedMessage.updateOne(
      { user: userId, messageId },
      { $set: { status: 'FAILED', error: String(err?.message || err) } }
    );

    throw err;
  }
};
