import { Types, ClientSession } from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { User, IUser } from '../models/user.model';
import { isSubActive } from '../utils/permissions';
import { getRelevantUserIds } from './report.service';

export class SalesService {

  // --- Helpers ---
  private static toNumber(input: unknown): number | null {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string' && input.trim() !== '') {
      const n = Number(input);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  private static getCurrentDateString() {
    return new Date().toISOString().split('T')[0];
  }

  // --- 1. RECORD SALE (Optimized) ---
  static async recordSale(
    userId: string,
    itemsInput: any[],
    paymentMethod: string,
    session: ClientSession
  ) {
    // 1. Fetch User & Validate Subscription
    const user: any = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    const ownerIdForSub = (user.role === 'STAFF' && user.ownerId) ? user.ownerId : user._id;
    let ownerForSub = user;
    if (String(ownerIdForSub) !== String(user._id)) {
      ownerForSub = await User.findById(ownerIdForSub).session(session);
      if (!ownerForSub) throw new Error("Owner account invalid");
    }

    if (!isSubActive(ownerForSub)) {
      throw new Error("Subscription expired. Cannot record sales.");
    }

    const inventoryOwnerId = (user.role === 'STAFF' && user.ownerId) ? user.ownerId : userId;

    // 2. Normalize Items & Merge Duplicates
    const merged = new Map<string, { itemId: string; quantity: number; price: number }>();
    for (const x of itemsInput) {
      const itemId = String(x?.itemId || '').trim();
      const quantity = this.toNumber(x?.quantity);
      const price = this.toNumber(x?.price);

      if (!itemId || !quantity || quantity <= 0 || !price || price < 0) continue;

      const prev = merged.get(itemId);
      if (!prev) merged.set(itemId, { itemId, quantity, price });
      else {
        prev.quantity += quantity;
        prev.price = price; // Latest price wins or specialized logic
      }
    }
    const finalItems = Array.from(merged.values());
    if (!finalItems.length) throw new Error("No valid items to sell");

    // 3. Fetch Inventory Details (Batch)
    const itemIds = finalItems.map(i => i.itemId);
    const inventoryItems = await Inventory.find({
      _id: { $in: itemIds },
      user: inventoryOwnerId
    }).session(session);

    const inventoryMap = new Map(inventoryItems.map(i => [String(i._id), i]));

    // 4. Validate Stock & Prepare Bulk Operations
    const bulkOps: any[] = [];
    const txItems: any[] = [];
    let totalMoney = 0;

    for (const it of finalItems) {
      const invItem = inventoryMap.get(it.itemId);
      if (!invItem) {
        throw new Error(`Item not found: ${it.itemId}`);
      }

      if ((invItem.quantity || 0) < it.quantity) {
        throw new Error(`Insufficient stock for '${invItem.name}'. Available: ${invItem.quantity}, Requested: ${it.quantity}`);
      }

      // Add to bulk update (atomic decrement with condition)
      bulkOps.push({
        updateOne: {
          filter: { _id: it.itemId, quantity: { $gte: it.quantity } },
          update: { $inc: { quantity: -it.quantity } }
        }
      });

      const lineTotal = it.quantity * it.price;
      totalMoney += lineTotal;

      txItems.push({
        itemId: invItem._id,
        name: invItem.name,
        qty: it.quantity,
        quantity: it.quantity,
        unit: 'pc', // Default or fetch from invItem if available
        unitPrice: it.price,
        price: it.price,
        costPrice: invItem.costPrice || 0,
        total: lineTotal
      });
    }

    // 5. Execute Bulk Write
    if (bulkOps.length > 0) {
      const bulkResult = await Inventory.bulkWrite(bulkOps, { session });
      if (bulkResult.modifiedCount !== finalItems.length) {
        // Concurrency check failed (stock changed between read and write)
        throw new Error("Transaction failed: Stock modified during processing. Please try again.");
      }
    }

    // 6. Create Transaction
    const createdTx = await Transaction.create([{
      user: userId,
      type: 'SALE',
      paymentStatus: 'PAID',
      paymentMethod: String(paymentMethod || 'CASH').toUpperCase(),
      items: txItems,
      totalMoney,
      date: this.getCurrentDateString(),
      timestamp: new Date()
    } as any], { session });

    return createdTx[0];
  }

  // --- 2. GET SALES HISTORY (Paginated) ---
  static async getHistory(
    userId: string,
    queryDetails: { startDate?: string; endDate?: string; page?: number; limit?: number }
  ) {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN';
    const relevantIds = await getRelevantUserIds(user, scope);

    const { startDate, endDate, page = 1, limit = 20 } = queryDetails;
    const skip = (page - 1) * limit;

    const query: any = {
      user: { $in: relevantIds },
      type: 'SALE',
      $or: [ // Hide undone
        { isUndone: { $exists: false } },
        { isUndone: false },
        { isUndone: 0 },
        { isUndone: null },
      ],
    };

    if (startDate || endDate) {
      const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
      const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;

      query.timestamp = {};
      if (start) query.timestamp.$gte = start;
      if (end) query.timestamp.$lte = end;
      if (!Object.keys(query.timestamp).length) delete query.timestamp;
    }

    const [transactions, totalCount] = await Promise.all([
      Transaction.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'name businessName role')
        .lean(),
      Transaction.countDocuments(query)
    ]);

    const formatted = transactions.map((t: any) => {
      const total = Number(t.totalMoney || 0);
      const paid = Number(t.amountPaid ?? t.paidAmount ?? t.paid ?? 0);
      
      // Calculate balance safely
      const balance = t.balance !== undefined ? Math.max(Number(t.balance), 0) : Math.max(total - paid, 0);

      let paymentStatus = 'PAID';
      if (balance > 0 && paid > 0) paymentStatus = 'PART_PAYMENT';
      else if (balance > 0) paymentStatus = 'CREDIT';

      let profit = 0;
      if (Array.isArray(t.items)) {
        t.items.forEach((i: any) => {
          const q = Number(i.qty ?? i.quantity ?? 0);
          const p = Number(i.unitPrice ?? i.price ?? 0);
          const c = Number(i.costPrice ?? 0);
          profit += (p - c) * q;
        });
      }

      return {
        id: t._id,
        timestamp: t.timestamp,
        date: t.timestamp || t.date,
        totalAmount: total,
        profit,
        paidAmount: paid,
        balance,
        paymentStatus,
        soldBy: (t.user && (t.user as any).role === 'STAFF') ? (t.user as any).name : 'Owner',
        items: (t.items || []).map((i: any) => ({
          name: i.name,
          quantity: i.qty ?? i.quantity ?? 0,
          price: i.unitPrice ?? i.price ?? 0,
        })),
      };
    });

    return {
      data: formatted,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    };
  }

  // --- 3. PROCESS RETURN (Optimized) ---
  static async processReturn(
    userId: string,
    payload: { originalSaleId: string; items: { itemId: string; quantity: number }[] },
    session: ClientSession
  ) {
    const { originalSaleId, items } = payload;
    
    // 1. Fetch Original Sale
    const originalSale = await Transaction.findById(originalSaleId).session(session);
    if (!originalSale) throw new Error("Original sale not found");

    const user: any = await User.findById(userId).session(session);
    const inventoryOwnerId = (user?.role === 'STAFF' && user?.ownerId) ? user.ownerId : userId;

    // 2. Calculate Already Returned Quantities
    const existingRefunds = await Transaction.find({ 
      type: 'REFUND', 
      'meta.originalSaleId': originalSaleId 
    }).session(session);

    const returnedMap = new Map<string, number>();
    for (const ref of existingRefunds) {
      for (const item of ref.items) {
        const key = item.itemId ? String(item.itemId) : String(item.name);
        returnedMap.set(key, (returnedMap.get(key) || 0) + (item.qty ?? 0));
      }
    }

    // 3. Validate Returns & Prepare Bulk Update
    const bulkOps: any[] = [];
    const returnItems: any[] = [];
    let refundTotal = 0;

    for (const returnItem of items) {
      const qty = Number(returnItem.quantity);
      if (qty <= 0) continue;

      const originalItem = originalSale.items.find((i: any) => 
        (i.itemId && String(i.itemId) === String(returnItem.itemId)) || 
        (i._id && String(i._id) === String(returnItem.itemId)) || 
        i.name === returnItem.itemId // fallback
      );

      if (!originalItem) throw new Error(`Item ${returnItem.itemId} not found in original sale`);

      const key = originalItem.itemId ? String(originalItem.itemId) : String(originalItem.name);
      const originalQty = Number(originalItem.qty ?? 0);
      const alreadyReturned = returnedMap.get(key) || 0;

      if (qty + alreadyReturned > originalQty) {
        throw new Error(`Cannot return ${qty} of ${originalItem.name}. Sold: ${originalQty}, Returned: ${alreadyReturned}`);
      }

      // Restore Inventory (Increment)
      if (originalItem.itemId) {
        bulkOps.push({
          updateOne: {
            filter: { _id: originalItem.itemId, user: inventoryOwnerId },
            update: { $inc: { quantity: qty } }
          }
        });
      }

      const unitPrice = Number(originalItem.unitPrice || 0);
      refundTotal += qty * unitPrice;
      
      returnItems.push({
        itemId: originalItem.itemId,
        name: originalItem.name,
        qty: qty,
        quantity: qty,
        unit: originalItem.unit || 'pc',
        unitPrice: unitPrice,
        price: unitPrice,
        total: qty * unitPrice
      });
    }

    if (bulkOps.length > 0) {
      await Inventory.bulkWrite(bulkOps, { session });
    }

    // 4. Create Refund Transaction
    await Transaction.create([{
      user: userId,
      type: 'REFUND',
      totalMoney: refundTotal,
      items: returnItems,
      date: this.getCurrentDateString(),
      timestamp: new Date(),
      meta: { originalSaleId }
    } as any], { session });

    return { success: true, refundTotal, itemsReturned: returnItems.length };
  }
}
