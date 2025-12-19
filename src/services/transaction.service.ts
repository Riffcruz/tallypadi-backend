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

// ==========================================
// 🔧 HELPERS
// ==========================================
function normalizeItemName(name: string) {
  return String(name || '')
    .replace(/\s*\(.*?\)\s*$/, '') // remove "(...)" at end
    .toLowerCase()
    .trim();
}

// root normalizer to merge "bags of rice" -> "rice"
function rootItemName(name: string) {
  let n = normalizeItemName(name);

  // strip filler words
  n = n.replace(/\b(of|the|a|an|my|your|pls|please|abeg)\b/g, ' ');

  // strip container/unit words that cause duplicates
  n = n.replace(/\b(bags?|bag|pcs?|pieces?|cartons?|carton|packs?|pack|sachets?|sachet|bottles?|bottle|rolls?|roll)\b/g, ' ');
  n = n.replace(/\b(liters?|ltrs?|kg|gms?|grams?)\b/g, ' ');

  // cleanup spaces
  n = n.replace(/\s+/g, ' ').trim();

  // simple singularization
  if (n.endsWith('s') && !n.endsWith('ss') && n.length > 3) {
    const protectedWords = ['rice', 'beans', 'gas', 'flour', 'semovita', 'wheat', 'indomie', 'coke'];
    if (!protectedWords.includes(n)) n = n.slice(0, -1);
  }

  return n || '';
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

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ✅ SMART RESOLVER
 * 1) exact match (normalized)
 * 2) root match where input contains inventory name OR inventory name contains input
 * 3) only auto-merge if EXACTLY ONE match
 * 4) if multiple matches, return { status: 'ambiguous', options: [...] }
 */
async function findExistingItem(userId: Types.ObjectId, rawName: string) {
  const clean = normalizeItemName(rawName);
  const root = rootItemName(rawName) || clean;

  // 1) exact match
  const exact = await Inventory.findOne({ user: userId, name: clean });
  if (exact) return { status: 'found' as const, inv: exact };

  // If root is empty, stop
  if (!root) return { status: 'none' as const, inv: null };

  // 2) get candidates by root regex (limit to avoid heavy scans)
  const rx = new RegExp(escapeRegex(root), 'i');
  const candidates = await Inventory.find({ user: userId, name: { $regex: rx } })
    .limit(25);

  // Also check reverse containment (inventory name contained in input)
  const inputNorm = root; // already normalized-ish
  const matches = candidates.filter((c) => {
    const invName = normalizeItemName(c.name);
    return invName === inputNorm || invName.includes(inputNorm) || inputNorm.includes(invName);
  });

  // If none matched, try a broader fallback: search by clean text too (still limited)
  if (matches.length === 0 && clean && clean !== root) {
    const rx2 = new RegExp(escapeRegex(clean), 'i');
    const more = await Inventory.find({ user: userId, name: { $regex: rx2 } })
      .limit(25);

    const matches2 = more.filter((c) => {
      const invName = normalizeItemName(c.name);
      return invName === clean || invName.includes(clean) || clean.includes(invName);
    });

    if (matches2.length === 1) return { status: 'found' as const, inv: matches2[0] };
    if (matches2.length > 1) {
      return { status: 'ambiguous' as const, inv: null, options: matches2.map(x => x.name) };
    }
    return { status: 'none' as const, inv: null, rootName: root };
  }

  // 3) decide based on match count
  if (matches.length === 1) return { status: 'found' as const, inv: matches[0] };

  if (matches.length > 1) {
    return { status: 'ambiguous' as const, inv: null, options: matches.map(x => x.name) };
  }

  // 4) none found: return rootName so we create clean root item
  return { status: 'none' as const, inv: null, rootName: root };
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

      // ✅ SYNC FRONTEND: Update Debtor balance immediately
      await Debtor.findByIdAndUpdate(debtorId, { $inc: { totalDebt: -amt } });

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
    // INVENTORY UPDATES + PRICE CALCULATIONS
    // =========================================================
    const finalItems: any[] = [];
    let calculatedTotal = 0;

    for (const item of parsed.items || []) {
      const qty = toNumber(item.qty);
      if (qty <= 0) continue;

      const inputName = String(item.name || '').trim();
      const cleanName = normalizeItemName(inputName || 'unknown_item');
      if (!cleanName) continue;

      // ✅ SMART RESOLVE (merge common roots, protect specifics)
      const resolved = await findExistingItem(userId, cleanName);

      // If ambiguous, stop and ask user (prevents bad merges / dirty inventory)
      if (resolved.status === 'ambiguous') {
        const options = (resolved.options || []).slice(0, 6).map((n, i) => `${i + 1}) ${n}`).join('\n');
        parsed.reply_text =
          `I found multiple items that match *"${cleanName}"*.\n` +
          `Which one did you mean?\n\n${options}\n\n` +
          `Reply with the full item name (e.g. "used tire" or "new tire").`;

        await ProcessedMessage.updateOne(
          { user: userId, messageId },
          { $set: { status: 'DONE' } }
        );
        return;
      }

      let inv = resolved.status === 'found' ? (resolved as any).inv : null;

      // If item doesn't exist, create it using ROOT name (clean inventory)
      if (!inv) {
        const rootName = (resolved as any).rootName || rootItemName(cleanName) || cleanName;
        if (!rootName) continue;

        inv = new Inventory({
          user: userId,
          name: rootName,
          quantity: 0,
          lastUnitPrice: 0,
        });
      }

      // Determine Price: Message price > DB Last Price > 0
      let effectiveUnitPrice = 0;
      const msgPrice = item.unit_price == null ? null : toNumber(item.unit_price);

      if (msgPrice !== null && msgPrice > 0) {
        effectiveUnitPrice = msgPrice;
        inv.lastUnitPrice = msgPrice; // Update DB with new price
      } else {
        effectiveUnitPrice = toNumber(inv.lastUnitPrice);
      }

      // Update Stock
      if (type === 'SALE') {
        inv.quantity = toNumber(inv.quantity) - qty;
      } else if (type === 'RESTOCK') {
        inv.quantity = toNumber(inv.quantity) + qty;
      } else {
        inv.quantity = qty; // SET_STOCK
      }

      await inv.save();

      // ✅ LOW STOCK ALERT
      if (type === 'SALE' && inv.quantity <= 5 && inv.quantity > 0 && user?.phoneNumber) {
        await queueOutboundMessage(
          user.phoneNumber,
          `⚠️ *Low Stock Alert:* ${inv.name} is running low (${inv.quantity} left). Restock soon!`
        );
      }

      // ✅ Add to final list with calculated totals
      const lineTotal = effectiveUnitPrice * qty;
      calculatedTotal += lineTotal;

      finalItems.push({
        // ✅ Name consistency: always use the official DB name
        name: inv.name,
        qty,
        unit: (item.unit || 'pcs').toString(),
        unitPrice: effectiveUnitPrice,
        total: lineTotal
      });
    }

    // =========================================================
    // RECORD TRANSACTION
    // =========================================================

    // If parsed.total_money is missing, use calculatedTotal
    let finalTotalMoney = parsed.total_money != null ? toNumber(parsed.total_money) : calculatedTotal;

    // Safety: If it's a SALE and total is 0, but we calculated something from DB, use that.
    if (type === 'SALE' && finalTotalMoney === 0 && calculatedTotal > 0) {
      finalTotalMoney = calculatedTotal;
    }

    const paymentStatus =
      type === 'SALE' ? (parsed.is_credit ? 'CREDIT' : 'PAID') : 'PAID';

    const isCredit = paymentStatus === 'CREDIT';

    // ✅ Robust paid/balance logic
    const amountPaid = type === 'SALE' ? (isCredit ? 0 : finalTotalMoney) : 0;
    const balance = type === 'SALE' ? (isCredit ? finalTotalMoney : 0) : 0;

    await Transaction.create({
      user: userId,
      type,
      paymentStatus,
      items: finalItems,
      totalMoney: finalTotalMoney,

      debtorId: isCreditSale ? debtorId : null,
      customerName: isCreditSale ? customerName : null,
      customerKey: isCreditSale ? customerKey : null,

      amountPaid,
      balance,
      settledAt: type === 'SALE' ? (isCredit ? null : now) : null,

      messageId,
      timestamp: now,
      date: todayString,
    });

    // ✅ SYNC FRONTEND: Update Debtor balance if CREDIT SALE
    if (isCreditSale && debtorId) {
      await Debtor.findByIdAndUpdate(debtorId, {
        $inc: { totalDebt: finalTotalMoney },
        $set: { lastProductStr: finalItems.map(i => `${i.qty} ${i.name}`).join(', ') }
      });
    }

    // =========================================================
    // DAILY STATS (only count PAID sales as revenue)
    // =========================================================
    if (type === 'SALE' && paymentStatus === 'PAID' && finalTotalMoney > 0) {
      await DailyStats.findOneAndUpdate(
        { user: userId, date: todayString },
        { $inc: { totalRevenue: finalTotalMoney, totalTransactions: 1 } },
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