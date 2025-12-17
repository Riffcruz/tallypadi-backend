import { Transaction } from '../models/transaction.model';
import { applyPaymentToDebts } from './debt.service';

export async function processTransaction(userId: any, parsed: any, messageId: string) {
  const intent = parsed.intent;

  // --- SALE (PAID or CREDIT) ---
  if (intent === 'SALE') {
    const isCredit = Boolean(parsed.is_credit);
    const customerName = isCredit ? String(parsed.customer_name || '').trim() : null;

    if (isCredit && !customerName) {
      parsed.reply_text = "Who dey owe you? Reply like: *Sold 2 rice to Emeka on credit*";
      return;
    }

    const totalMoney = parsed.total_money ?? null;
    const totalNum = Number(totalMoney || 0);

    await Transaction.create({
      user: userId,
      type: 'SALE',
      paymentStatus: isCredit ? 'CREDIT' : 'PAID',
      items: parsed.items || [],
      totalMoney,
      customerName: isCredit ? customerName : null,

      // ✅ debt tracking
      amountPaid: isCredit ? 0 : totalNum,
      balance: isCredit ? totalNum : 0,
      settledAt: isCredit ? null : new Date(),

      messageId,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date(),
    });

    return;
  }

  // --- DEBT PAYMENT ---
  if (intent === 'DEBT_PAYMENT') {
    const customerName = String(parsed.customer_name || '').trim();
    const amt = Number(parsed.total_money || 0);

    if (!customerName || !amt || amt <= 0) {
      parsed.reply_text = "To record payment, type like: *Emeka paid 20000*";
      return;
    }

    // record payment event (audit)
    await Transaction.create({
      user: userId,
      type: 'PAYMENT_RECEIVED',
      paymentStatus: 'PAID',
      items: [],
      totalMoney: amt,
      customerName,

      amountPaid: amt,
      balance: 0,
      settledAt: new Date(),

      messageId,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date(),
    });

    // ✅ apply payment
    const r = await applyPaymentToDebts(userId, customerName, amt);

    if (r.applied <= 0) {
      parsed.reply_text = `I no see any outstanding debt for *${customerName}*.`;
      return;
    }

    if (r.remaining > 0) {
      parsed.reply_text =
        `✅ Payment recorded for *${customerName}*.\n` +
        `Applied: *${r.applied.toLocaleString()}*\n` +
        `Extra: *${r.remaining.toLocaleString()}* (no more debt to match).`;
      return;
    }

    parsed.reply_text =
      `✅ Payment recorded for *${customerName}*.\n` +
      `Applied: *${r.applied.toLocaleString()}*\n` +
      (r.clearedCount > 0 ? `Cleared debts: *${r.clearedCount}*` : `Some debts still remain.`);
    return;
  }

  // ...keep your RESTOCK / SET_STOCK / etc
}
