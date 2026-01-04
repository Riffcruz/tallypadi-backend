import { Types } from 'mongoose';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { Debtor } from '../models/debtor.model';
import { DailyStats } from '../models/dailyStats.model';

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function restoreStock(userId: Types.ObjectId, items: any[]) {
  for (const it of items || []) {
    const name = String(it?.name || '').trim();
    const qty = Number(it?.qty || 0);
    const itemId = it?.itemId;

    if (!Number.isFinite(qty) || qty <= 0) continue;

    // ✅ Robust Restore: Use ID if available, else Name
    if (itemId) {
      await Inventory.updateOne(
        { _id: itemId, user: userId },
        { $inc: { quantity: qty } }
      );
    } else if (name) {
      // Legacy fallback
      await Inventory.updateOne(
        { user: userId, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } },
        { $inc: { quantity: qty } }
      );
    }
  }
}

async function reverseDebtIfAny(tx: any) {
  const debtorId = tx?.debtorId;
  if (!debtorId) return;

  // How much debt did this sale add?
  // CREDIT: balance == totalMoney
  // PARTIAL: balance is what remains
  // PAID: 0 debt
  let debtAdded = 0;

  if (tx.paymentStatus === 'CREDIT') {
    debtAdded = Number(tx.balance ?? tx.totalMoney ?? 0);
  } else if (tx.paymentStatus === 'PARTIAL') {
    debtAdded = Number(tx.balance ?? 0);
  } else {
    debtAdded = 0;
  }

  if (!Number.isFinite(debtAdded) || debtAdded <= 0) return;

  await Debtor.updateOne(
    { _id: debtorId },
    {
      $inc: { totalDebt: -debtAdded },
      // optional: clear lastProductStr if you want, but usually leave it
    }
  );
}

/**
 * Undo a specific sale transaction by ID.
 * - Marks tx as undone (keeps audit trail)
 * - Restores stock
 * - Reverses debtor totalDebt (if CREDIT/PARTIAL)
 * - Reverses DailyStats (if PAID)
 */
export async function undoSaleById(userId: Types.ObjectId, txId: string, undoneByMessageId: string) {
  const tx = await Transaction.findOne({ _id: txId, user: userId, type: 'SALE' });
  if (!tx) return { ok: false, message: 'Sale not found.' };
  if (tx.isUndone) return { ok: false, message: 'Already undone.' };

  tx.isUndone = true;
  tx.undoneAt = new Date();
  tx.undoneByMessageId = undoneByMessageId;
  await tx.save();

  await restoreStock(userId, (tx as any).items || []);
  await reverseDebtIfAny(tx);

  // ✅ Reverse Daily Stats if it was a PAID sale
  if (tx.paymentStatus === 'PAID' && (tx.totalMoney || 0) > 0 && tx.date) {
    await DailyStats.updateOne(
      { user: userId, date: tx.date },
      { $inc: { totalRevenue: -tx.totalMoney, totalTransactions: -1 } }
    );
  }

  return { ok: true, message: '✅ Sale undone successfully (transaction reversed + stock restored).' };
}

/**
 * Undo a specific PAYMENT transaction.
 * - Reverses the payment (adds debt back to debtor)
 * - Reverses DailyStats (deducts revenue)
 */
export async function undoPaymentById(userId: Types.ObjectId, txId: string, undoneByMessageId: string) {
  const tx = await Transaction.findOne({ _id: txId, user: userId, type: 'PAYMENT_RECEIVED' });
  if (!tx) return { ok: false, message: 'Payment record not found.' };
  if (tx.isUndone) return { ok: false, message: 'Payment already undone.' };

  tx.isUndone = true;
  tx.undoneAt = new Date();
  tx.undoneByMessageId = undoneByMessageId;
  await tx.save();

  const amount = Number(tx.totalMoney || tx.amountPaid || 0);

  // 1. Add debt back to debtor
  if (tx.debtorId && amount > 0) {
    await Debtor.updateOne(
      { _id: tx.debtorId },
      { $inc: { totalDebt: amount } }
    );
  }

  // 2. Remove revenue from DailyStats
  if (amount > 0 && tx.date) {
    await DailyStats.updateOne(
      { user: userId, date: tx.date },
      { $inc: { totalRevenue: -amount, totalTransactions: -1 } }
    );
  }

  return { ok: true, message: `✅ Payment undone. Debt of ${amount} restored.` };
}

/**
 * Undo the last transaction (SALE or PAYMENT)
 */
export async function undoLastTransaction(userId: Types.ObjectId, undoneByMessageId: string) {
  const tx = await Transaction.findOne({
    user: userId,
    type: { $in: ['SALE', 'PAYMENT_RECEIVED'] },
    isUndone: { $ne: true },
  }).sort({ timestamp: -1 });

  if (!tx) return { ok: false, message: 'No recent transaction found to undo.' };

  if (tx.type === 'SALE') {
    return undoSaleById(userId, String(tx._id), undoneByMessageId);
  } else if (tx.type === 'PAYMENT_RECEIVED') {
    return undoPaymentById(userId, String(tx._id), undoneByMessageId);
  }

  return { ok: false, message: 'Unknown transaction type.' };
}

/**
 * Undo the last sale for a shop.
 */
export async function undoLastSale(userId: Types.ObjectId, undoneByMessageId: string) {
  const tx = await Transaction.findOne({
    user: userId,
    type: 'SALE',
    isUndone: { $ne: true },
  }).sort({ timestamp: -1 });

  if (!tx) return { ok: false, message: 'No sale found to undo.' };

  return undoSaleById(userId, String(tx._id), undoneByMessageId);
}
