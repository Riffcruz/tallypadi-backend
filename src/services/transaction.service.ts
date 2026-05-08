import { Types } from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { DailyStats } from '../models/dailyStats.model';
import { User } from '../models/user.model';
import { ParsedResult } from './gemini.service';
import { queueOutboundMessage } from './queue.service';
import { ProcessedMessage } from '../models/processedMessage.model';
import { DraftRestock } from '../models/draftRestock.model';

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

function toNumber(v: unknown): number {
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
async function findExistingItem(userId: Types.ObjectId, rawName: string, smartMatchingEnabled: boolean = true) {
  const clean = normalizeItemName(rawName);
  const root = rootItemName(rawName) || clean;

  // 0) SKU exact match (highest priority — guaranteed unambiguous)
  if (/^P-[A-Z0-9]{4}$/i.test(rawName.trim())) {
    const bySku = await Inventory.findOne({ user: userId, sku: rawName.trim().toUpperCase() });
    if (bySku) return { status: 'found' as const, inv: bySku };
  }

  // 1) exact match (case-insensitive via regex since name might not be pure lowercase in DB if added via UI)
  const exactRx = new RegExp(`^${escapeRegex(clean)}$`, 'i');
  const exact = await Inventory.findOne({ user: userId, name: exactRx });
  if (exact) return { status: 'found' as const, inv: exact };

  if (!smartMatchingEnabled) {
    return { status: 'none' as const, inv: null, rootName: clean || rawName };
  }

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
  messageId: string,
  actor?: Record<string, unknown> | null // ✅ NEW: pass actor from message handler so we can enforce OWNER-only actions
) => {
  // ✅ 0) CLAIM LOCK FIRST (prevents double inventory update)
  try {
    await ProcessedMessage.create({
      user: userId,
      messageId,
      status: 'PROCESSING',
    });
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as Record<string, unknown>).code === 11000) {
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

    // ✅ Who sent this message (OWNER vs STAFF)
    const actorRole = String(actor?.role || '').toUpperCase(); // 'OWNER' | 'STAFF' | ''
    const isActorOwner = actorRole === 'OWNER'; // only reliable if you pass actor in

    // ✅ Get user settings
    const smartMatchingEnabled = user?.settings?.smartMatchingEnabled !== false;

    // =========================================================
    // ✅ PRICE CHECK (read-only)
    // =========================================================
    if (parsed.intent === 'PRICE_CHECK') {
      const itemName = String(parsed.items?.[0]?.name || '').trim();
      if (!itemName) {
        parsed.reply_text = 'Please tell me the item name. Example: *price of rice*';
        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      const cleanName = normalizeItemName(itemName);
      const resolved = await findExistingItem(userId, cleanName, smartMatchingEnabled);

      if (resolved.status === 'ambiguous') {
        const options = (resolved.options || []).slice(0, 6).map((n, i) => `${i + 1}) ${n}`).join('\n');
        parsed.reply_text =
          `I found multiple items that match *"${cleanName}"*.\n` +
          `Which one did you mean?\n\n${options}\n\n` +
          `Reply with the full item name.`;

        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      const inv = resolved.status === 'found' ? resolved.inv : null;
      if (!inv) {
        parsed.reply_text =
          `I couldn't find *${itemName}* in your inventory.\n` +
          `To set a price, type: *${itemName} price is 1000*`;
        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      const price = Number(inv.lastUnitPrice || 0);
      const qty = Number(inv.quantity || 0);

      parsed.reply_text =
        price > 0
          ? `💰 *${inv.name}* price is *${price.toLocaleString()}*.\n📦 Stock: *${qty}*`
          : `⚠️ No saved price for *${inv.name}* yet.\nSet it like: *${inv.name} price is 1000*`;

      await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
      return;
    }

    // =========================================================
    // ✅ DEFINE PRICE (update lastUnitPrice, do NOT touch stock)
    // =========================================================
    if (parsed.intent === 'DEFINE_PRICE') {
      const itemName = String(parsed.items?.[0]?.name || '').trim();
      const unitPrice = toNumber(parsed.items?.[0]?.unit_price);

      if (!itemName || unitPrice <= 0) {
        parsed.reply_text = 'To set price, type like: *rice price is 1200*';
        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      const cleanName = normalizeItemName(itemName);
      const resolved = await findExistingItem(userId, cleanName, smartMatchingEnabled);

      if (resolved.status === 'ambiguous') {
        const options = (resolved.options || []).slice(0, 6).map((n, i) => `${i + 1}) ${n}`).join('\n');
        parsed.reply_text =
          `I found multiple items that match *"${cleanName}"*.\n` +
          `Which one did you mean?\n\n${options}\n\n` +
          `Reply with the full item name.`;

        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      let inv = resolved.status === 'found' ? resolved.inv : null;

      // If not found, create item (price-first workflow)
      if (!inv) {
        const rootName = ('rootName' in resolved ? resolved.rootName : null) || rootItemName(cleanName) || cleanName;
        if (!rootName) {
          parsed.reply_text = 'Please tell me the item name clearly. Example: *rice price is 1200*';
          await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
          return;
        }

        inv = new Inventory({
          user: userId,
          name: rootName,
          quantity: 0,
          lastUnitPrice: 0,
        });
      }

      inv.lastUnitPrice = unitPrice;
      await inv.save();

      parsed.reply_text = `✅ Price updated: *${inv.name}* is now *${unitPrice.toLocaleString()}* each.`;

      await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
      return;
    }

    // =========================================================
    // ✅ DELETED STOCK (OWNER ONLY)
    // - default behavior: HARD DELETE the inventory item
    // - if you prefer "clear only", swap deleteOne -> quantity=0 and save
    // =========================================================
    if (parsed.intent === 'DELETED_STOCK') {
      if (!isActorOwner) {
        parsed.reply_text = '❌ Only the shop owner can delete stock items.';
        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      const itemName = String(parsed.items?.[0]?.name || '').trim();
      if (!itemName) {
        parsed.reply_text = 'Tell me the item to delete. Example: *delete rice*';
        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      const cleanName = normalizeItemName(itemName);
      const resolved = await findExistingItem(userId, cleanName, smartMatchingEnabled);

      if (resolved.status === 'ambiguous') {
        const options = (resolved.options || []).slice(0, 6).map((n, i) => `${i + 1}) ${n}`).join('\n');
        parsed.reply_text =
          `I found multiple items that match *"${cleanName}"*.\n` +
          `Which one did you mean?\n\n${options}\n\n` +
          `Reply with the full item name.`;

        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      const inv = resolved.status === 'found' ? resolved.inv : null;
      if (!inv) {
        parsed.reply_text = `I couldn't find *${itemName}* in your inventory.`;
        await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
        return;
      }

      // ✅ Hard delete (removes from inventory list)
      await Inventory.deleteOne({ _id: inv._id, user: userId });

      parsed.reply_text = `🗑️ Deleted *${inv.name}* from inventory.`;

      await ProcessedMessage.updateOne({ user: userId, messageId }, { $set: { status: 'DONE' } });
      return;
    }

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
        debtorId = created._id as Types.ObjectId;
        displayName = created.displayName;
        debtorKey = created.debtorKey;
      } else {
        debtorId = res.debtorId as Types.ObjectId;
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
      const oldDebtor = await Debtor.findByIdAndUpdate(debtorId, { $inc: { totalDebt: -amt } });
      const oldBalance = oldDebtor ? toNumber(oldDebtor.totalDebt) : 0;

      if (r.applied <= 0) {
        if (oldBalance > 0) {
           const newBalance = oldBalance - amt;
           const status = newBalance <= 0 ? "✨ Fully settled!" : `📉 Remaining: ${newBalance.toLocaleString()}`;
           parsed.reply_text = `✅ Payment recorded for *${displayName}*.\n${status}`;
        } else {
           parsed.reply_text = `I did not see any outstanding debt for *${displayName}*.\nRecorded as credit (overpayment).`;
        }
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
        debtorId = created._id as Types.ObjectId;
        customerName = created.displayName;
        customerKey = created.debtorKey;
      } else {
        debtorId = res.debtorId as Types.ObjectId;
        customerName = res.displayName;
        customerKey = res.debtorKey;
      }
    }


    // =========================================================
    // ✅ PASS 1: VALIDATE ALL ITEMS BEFORE DB MUTATIONS
    // =========================================================
    const finalItems: Record<string, unknown>[] = [];
    const ambiguousDraftItems: Array<{
      rawName: string; qty: number; cost_price: number; unit_price: number; options: string[];
    }> = [];
    let calculatedTotal = 0;

    for (const item of parsed.items || []) {
      const qty = toNumber(item.qty);
      const allowZero = parsed.intent === 'SET_STOCK'; // allow qty=0 only for SET_STOCK
      if (allowZero ? qty < 0 : qty <= 0) continue;

      const inputName = String(item.name || '').trim();
      const cleanName = normalizeItemName(inputName || 'unknown_item');
      if (!cleanName) continue;

      // ✅ SMART RESOLVE (merge common roots, protect specifics)
      const resolved = await findExistingItem(userId, cleanName, smartMatchingEnabled);

      // If ambiguous, stop and ask user (prevents bad merges / dirty inventory)
      if (resolved.status === 'ambiguous') {
        const options = (resolved.options || []).slice(0, 6).map((n, i) => `${i + 1}) ${n}`).join('\n');
        
        if ((parsed.items || []).length === 1) {
            parsed.reply_text =
              `I found multiple items that match *"${cleanName}"*.\n` +
              `Which one did you mean?\n\n${options}\n\n` +
              `Reply with the full item name (e.g. "used tire" or "new tire").`;

            await ProcessedMessage.updateOne(
              { user: userId, messageId },
              { $set: { status: 'DONE' } }
            );
            return;
        } else {
            // For bulk: collect for the magic draft link instead of skipping silently
            ambiguousDraftItems.push({
              rawName: inputName,
              qty: toNumber(item.qty),
              cost_price: toNumber(item.cost_price),
              unit_price: toNumber(item.unit_price),
              options: resolved.options || [],
            });
            continue;
        }
      }

      let inv = resolved.status === 'found' ? resolved.inv : null;

      // If item doesn't exist, create it using ROOT name (clean inventory)
      if (!inv) {
        const rootName = ('rootName' in resolved ? resolved.rootName : null) || rootItemName(cleanName) || cleanName;
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
      let effectiveCostPrice = toNumber(inv.costPrice);

      const msgPrice = item.unit_price == null ? null : toNumber(item.unit_price);
      const msgCostPrice = item.cost_price == null ? null : toNumber(item.cost_price);

      // ✅ NEW: Back-calculate unit price if only Total Money is given for a single item
      let derivedUnitPrice: number | null = null;
      if (parsed.items.length === 1 && parsed.total_money != null && parsed.total_money > 0 && msgPrice == null && qty > 0) {
          derivedUnitPrice = parsed.total_money / qty;
      }

      // LOGIC:
      // If RESTOCK:
      // - parsed.cost_price -> Updates Cost Price
      // - parsed.unit_price -> Updates Selling Price (lastUnitPrice)
      
      if (type === 'RESTOCK') {
        if (msgCostPrice !== null && msgCostPrice > 0) {
           effectiveCostPrice = msgCostPrice;
           inv.costPrice = msgCostPrice; // Update Cost Price
        }
        if (msgPrice !== null && msgPrice > 0) {
           effectiveUnitPrice = msgPrice;
           inv.lastUnitPrice = msgPrice; // Update Selling Price
        }
      } else if (type === 'SALE') {
        if (msgPrice !== null && msgPrice > 0) {
          effectiveUnitPrice = msgPrice;
          inv.lastUnitPrice = msgPrice; // Update Last Selling Price
        } else if (derivedUnitPrice !== null && derivedUnitPrice > 0) {
          effectiveUnitPrice = derivedUnitPrice;
          inv.lastUnitPrice = derivedUnitPrice; // ✅ Update Last Selling Price from derived
        } else {
          effectiveUnitPrice = toNumber(inv.lastUnitPrice);
        }
      } else {
        // Other types (ADJUSTMENT/SET_STOCK)
         if (msgPrice !== null && msgPrice > 0) {
           // Ambiguous... assume selling price update for now?
           // Or just ignore. Let's update selling price to be safe.
           effectiveUnitPrice = msgPrice;
           inv.lastUnitPrice = msgPrice;
         } else {
           effectiveUnitPrice = toNumber(inv.lastUnitPrice);
         }
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
      const lineTotal = (type === 'RESTOCK' ? effectiveCostPrice : effectiveUnitPrice) * qty; // For restock, total is cost. For sale, total is revenue.
      
      // Wait, 'calculatedTotal' is used for 'totalMoney' of the transaction.
      // For RESTOCK, totalMoney represents "Amount Spent".
      // For SALE, totalMoney represents "Amount Received".
      // This is consistent.
      calculatedTotal += lineTotal;

      finalItems.push({
        // ✅ Name consistency: always use the official DB name
        name: inv.name,
        itemId: inv._id, // ✅ Store ID for robust undo
        qty,
        unit: (item.unit || 'pcs').toString(),
        unitPrice: effectiveUnitPrice,
        costPrice: effectiveCostPrice, // ✅ Snapshot Cost
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
      user: actor ? actor._id as Types.ObjectId : userId, // ✅ Record the actual actor (Staff) for audit trails
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

    // ✅ NOTIFY OWNER OF STAFF SALE (if enabled & active)
    if (type === 'SALE' && actorRole === 'STAFF') {
       try {
          // Re-fetch owner to check latest settings/activity
          const owner = await User.findById(userId).select('+settings +lastSeen +phoneNumber');
          
          if (owner?.settings?.staffTransactionReport && owner.phoneNumber) {
             const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
             const isOwnerActive = owner.lastSeen && owner.lastSeen >= oneDayAgo;

             if (isOwnerActive) {
                const itemsStr = finalItems.map(i => `${i.qty} ${i.name}`).join(', ');
                const staffName = (actor && actor.name ) ? String(actor.name) : 'Staff';
                const msg = `👤 *Staff Sale Alert*\n\n*${staffName}* sold:\n${itemsStr}\n\n💰 Total: ${finalTotalMoney.toLocaleString()}`;
                
                await queueOutboundMessage(owner.phoneNumber, msg);
             }
          }
       } catch (e) {
          console.error('Failed to send staff sale alert:', e);
       }
    }

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

    // ── Create Magic Draft Link for ambiguous items ──────────────────────────
    if (ambiguousDraftItems.length > 0) {
      const draft = await DraftRestock.create({
        user: userId,
        messageId,
        status: 'PENDING',
        items: ambiguousDraftItems,
        successCount: finalItems.length,
      });

      const appUrl = process.env.APP_URL || 'https://tallypadi.com';
      const draftUrl = `${appUrl}/draft/${draft._id}`;

      const successMsg = finalItems.length > 0
        ? `✅ *${finalItems.length} item(s)* saved successfully!\n\n`
        : '';

      const itemNames = ambiguousDraftItems.map(i => `• ${i.rawName} (${i.qty}pcs)`).join('\n');
      parsed.reply_text =
        `${successMsg}` +
        `⚠️ *${ambiguousDraftItems.length} item(s) need clarification* because the names match multiple products in your shop:\n\n` +
        `${itemNames}\n\n` +
        `👉 *Tap this link to quickly fix them (expires in 24hrs):*\n${draftUrl}`;
    }

    await ProcessedMessage.updateOne(
      { user: userId, messageId },
      { $set: { status: 'DONE' } }
    );
  } catch (err: unknown) {
    console.error('❌ processTransaction error:', err);

    await ProcessedMessage.updateOne(
      { user: userId, messageId },
      { $set: { status: 'FAILED', error: err instanceof Error ? err.message : String(err) } }
    );

    throw err;
  }
};

// =========================================================
// ✅ STOCK DEDUCTION HELPER (Exported)
// =========================================================
export const deductStockForItems = async (userId: Types.ObjectId, items: {name: string, qty: number}[]) => {
  for (const item of items) {
    const qty = Number(item.qty);
    if (qty <= 0) continue;

    const inputName = String(item.name || '').trim();
    const cleanName = normalizeItemName(inputName);
    if (!cleanName) continue;

    // Use existing logic to find/resolve item
    const resolved = await findExistingItem(userId, cleanName, smartMatchingEnabled);

    // If ambiguous, we skip to avoid deducting wrong item.
    if (resolved.status === 'ambiguous') {
         console.log(`[deductStock] Ambiguous match for ${cleanName}, skipping deduction.`);
         continue; 
    }

    let inv = resolved.status === 'found' ? resolved.inv : null;

    // If not found, create new (tracking negative stock)
    if (!inv) {
        const rootName = ('rootName' in resolved ? resolved.rootName : null) || rootItemName(cleanName) || cleanName;
        if (!rootName) continue;

        inv = new Inventory({
          user: userId,
          name: rootName,
          quantity: 0,
          lastUnitPrice: 0,
        });
    }

    inv.quantity = Number(inv.quantity || 0) - qty;
    await inv.save();
  }
};

/**
 * ✅ Get historical prices for an item
 */
export async function getHistoricalPrices(userId: Types.ObjectId, itemName: string) {
  const clean = normalizeItemName(itemName);
  // Find candidates (using root name logic or broad search)
  // Actually, we can just search transactions with regex on item name.
  // But transactions store the *snapshot* name.
  // Best to resolve to Inventory ID first if possible?
  // Transaction items store `itemId`.
  
  const resolved = await findExistingItem(userId, clean, smartMatchingEnabled);
  let query: Record<string, unknown> = { user: userId, 'items.name': { $regex: new RegExp(escapeRegex(clean), 'i') } };

  if (resolved.status === 'found') {
      query = { user: userId, 'items.itemId': 'inv' in resolved ? resolved.inv._id : null };
  }

  // 1. Cost Prices (from RESTOCK)
  const restocks = await Transaction.find({ ...query, type: 'RESTOCK' })
      .sort({ timestamp: -1 })
      .limit(20)
      .select('items');
  
  const costSet = new Set<number>();
  restocks.forEach(tx => {
      tx.items.forEach(i => {
          // Check if item matches (if query was regex)
          if (resolved.status !== 'found' && !normalizeItemName(i.name).includes(clean)) return;
          if (i.costPrice && i.costPrice > 0) costSet.add(i.costPrice);
      });
  });

  // 2. Selling Prices (from SALE or RESTOCK updates)
  // We can look at 'unitPrice' in SALES
  const sales = await Transaction.find({ ...query, type: 'SALE' })
      .sort({ timestamp: -1 })
      .limit(20)
      .select('items');

  const sellSet = new Set<number>();
  
  // Also add current inventory price
  if (resolved.status === 'found') {
      const inv = 'inv' in resolved ? resolved.inv : null;
      if (inv && inv.lastUnitPrice > 0) sellSet.add(inv.lastUnitPrice);
  }

  sales.forEach(tx => {
      tx.items.forEach(i => {
          if (resolved.status !== 'found' && !normalizeItemName(i.name).includes(clean)) return;
          if (i.unitPrice && i.unitPrice > 0) sellSet.add(i.unitPrice);
      });
  });

  return {
      costPrices: Array.from(costSet).sort((a, b) => b - a).slice(0, 3), // Top 3 unique prices
      sellingPrices: Array.from(sellSet).sort((a, b) => b - a).slice(0, 3)
  };
}
