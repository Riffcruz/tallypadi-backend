import { Transaction } from '../models/transaction.model';

const normName = (s?: string | null) =>
  String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

export async function applyPaymentToDebts(
  userId: any,
  customerNameRaw: string,
  amount: number
) {
  const customerKey = normName(customerNameRaw);
  let remaining = amount;

  const debts = await Transaction.find({
    user: userId,
    type: 'SALE',
    paymentStatus: 'CREDIT',
    isUndone: { $ne: true },
    balance: { $gt: 0 },
    customerName: { $exists: true, $ne: null },
  }).sort({ timestamp: 1 });

  let applied = 0;
  let clearedCount = 0;

  for (const tx of debts) {
    if (remaining <= 0) break;
    if (normName(tx.customerName) !== customerKey) continue;

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
