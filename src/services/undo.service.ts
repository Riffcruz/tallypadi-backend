import { Types } from 'mongoose';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { Debtor } from '../models/debtor.model';

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function restoreStock(userId: Types.ObjectId, items: any[]) {
  for (const it of items || []) {
    const name = String(it?.name || '').trim();
    const qty = Number(it?.qty || 0);
    if (!name || !Number.isFinite(qty) || qty <= 0) continue;

    // IMPORTANT: use your actual stock field (you used `quantity` earlier)
    await Inventory.updateOne(
      { user: userId, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } },
      { $inc: { quantity: qty } }
    );
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

  return { ok: true, message: '✅ Sale undone successfully (transaction reversed + stock restored).' };
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
