import { Types } from 'mongoose';
import { Transaction } from '../models/transaction.model';

export async function applyPaymentToDebts(
  shopUserId: string | Types.ObjectId,
  debtorId: Types.ObjectId,
  amount: number
) {
  let remaining = Number(amount || 0);
  let applied = 0;
  let clearedCount = 0;

  if (!debtorId || remaining <= 0) {
    return { applied: 0, remaining, clearedCount: 0 };
  }

  const debts = await Transaction.find({
    user: shopUserId,
    type: 'SALE',
    paymentStatus: 'CREDIT',
    isUndone: { $ne: true },
    balance: { $gt: 0 },
    debtorId: debtorId,
  }).sort({ timestamp: 1 }); // oldest first

  for (const tx of debts) {
    if (remaining <= 0) break;

    const bal = Number(tx.balance || 0);
    if (bal <= 0) continue;

    const pay = Math.min(bal, remaining);

    tx.amountPaid = Number(tx.amountPaid || 0) + pay;
    tx.balance = bal - pay;

    if (tx.balance <= 0) {
      tx.balance = 0;
      tx.paymentStatus = 'PAID';
      tx.settledAt = new Date();
      clearedCount += 1;
    }

    await tx.save();

    remaining -= pay;
    applied += pay;
  }

  return { applied, remaining, clearedCount };
}
