import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';

export const undoLastSale = async (userId: any, undoMessageId: string) => {
  // Find last SALE that is not undone
  const lastSale = await Transaction.findOne({
    user: userId,
    type: 'SALE',
    isUndone: { $ne: true },
  }).sort({ timestamp: -1 });

  if (!lastSale) {
    return { ok: false, message: "No sale found to undo." };
  }

  // Mark transaction as undone (so reports can ignore it)
  lastSale.isUndone = true;
  lastSale.undoneAt = new Date();
  lastSale.undoneByMessageId = undoMessageId;
  await lastSale.save();

  // Reverse inventory changes: add back quantities
  // Assumes lastSale.items = [{ name, qty, unit_price, unit? ... }]
  const items: any[] = (lastSale as any).items || [];

  for (const it of items) {
    const name = String(it.name || '').trim();
    const qty = Number(it.qty || 0);

    if (!name || qty <= 0) continue;

    await Inventory.updateOne(
      { user: userId, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } },
      { $inc: { quantity: qty } }
    );
  }

  return {
    ok: true,
    message: `✅ Undone last sale: ${items.length} item(s) restored back to stock.`,
  };
};

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
