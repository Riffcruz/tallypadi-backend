import mongoose, { Types, ClientSession } from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { User, IUser } from '../models/user.model';
import { isSubActive } from '../utils/permissions';
import { getRelevantUserIds } from './report.service';

import { queuePushNotification } from './queue.service';
import { Customer } from '../models/customer.model';
import { activityService } from './activity.service';

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
    customerId: string | null = null,
    discountAmount: number = 0,
    session: ClientSession
  ) {
    // 1. Fetch User & Validate Subscription
    const user = await User.findById(userId).session(session) as (mongoose.Document & IUser & { ownerId?: mongoose.Types.ObjectId, role?: string }) | null;
    if (!user) throw new Error("User not found");

    const ownerIdForSub = (user.role === 'STAFF' && user.ownerId) ? user.ownerId : user._id;
    let ownerForSub: (mongoose.Document & IUser & { ownerId?: mongoose.Types.ObjectId, role?: string }) | null = user;
    if (user.role === 'STAFF' && user.ownerId) {
      ownerForSub = await User.findById(ownerIdForSub).session(session) as (mongoose.Document & IUser & { ownerId?: mongoose.Types.ObjectId, role?: string }) | null;
    }
    if (!ownerForSub) {
      throw new Error("Owner account invalid");
    }

    if (!isSubActive(ownerForSub)) {
      throw new Error("Subscription expired. Cannot record sales.");
    }

    const inventoryOwnerId = (user.role === 'STAFF' && user.ownerId) ? user.ownerId : userId;

    // 2. Normalize Items & Merge Duplicates
    const merged = new Map<string, { itemId: string; quantity: number; price: number | null }>();
    for (const x of itemsInput) {
      const itemId = String(x?.itemId || x?.id || x?._id || x?.productId || x?.inventoryId || '').trim();
      const quantity = this.toNumber(x?.quantity ?? x?.qty ?? x?.sellQty);
      const price = this.toNumber(x?.price ?? x?.unitPrice ?? x?.sellPrice ?? x?.lastUnitPrice);

      if (!itemId || quantity === null || quantity <= 0 || (price !== null && price < 0)) continue;

      const prev = merged.get(itemId);
      if (!prev) merged.set(itemId, { itemId, quantity, price });
      else {
        prev.quantity += quantity;
        if (price !== null) prev.price = price; // Latest explicit price wins.
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
    const bulkOps: mongoose.AnyBulkWriteOperation<any>[] = [];
    const txItems: Record<string, unknown>[] = [];
    const lowStockAlerts: Array<{ itemId: string; name: string; previousStock: number; currentStock: number }> = [];
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

      // Low Stock Alert Logic
      const newStock = (invItem.quantity || 0) - it.quantity;
      if (invItem.quantity >= 5 && newStock < 5) {
         lowStockAlerts.push({
           itemId: invItem._id.toString(),
           name: invItem.name,
           previousStock: invItem.quantity || 0,
           currentStock: newStock,
         });
      }

      const salePrice = it.price ?? this.toNumber(invItem.lastUnitPrice) ?? 0;
      if (salePrice < 0) {
        throw new Error(`Invalid selling price for '${invItem.name}'`);
      }

      const lineTotal = it.quantity * salePrice;
      totalMoney += lineTotal;

      txItems.push({
        itemId: invItem._id,
        name: invItem.name,
        qty: it.quantity,
        quantity: it.quantity,
        unit: 'pc', // Default or fetch from invItem if available
        unitPrice: salePrice,
        price: salePrice,
        costPrice: invItem.costPrice || 0,
        total: lineTotal
      });
    }

    const finalDiscount = discountAmount > 0 ? discountAmount : 0;
    const finalAmountPaid = totalMoney > finalDiscount ? totalMoney - finalDiscount : 0;

    // Loyalty Points Calculation / Redemption
    let pointsEarned = 0;
    
    // --- PAY WITH POINTS LOGIC ---
    if (paymentMethod === 'POINTS') {
      if (!customerId) throw new Error("A Customer must be selected to pay with points.");
      if (!ownerForSub.settings?.royalty?.enabled) throw new Error("Royalty program is disabled.");
      
      const pointValue = ownerForSub.settings.royalty.redemptionValuePerPoint || 1;
      const pointsRequired = Math.ceil(finalAmountPaid / pointValue);
      
      const customer = await Customer.findById(customerId).session(session);
      if (!customer) throw new Error("Customer not found.");
      if ((customer.royaltyPoints || 0) < pointsRequired) {
        throw new Error(`Insufficient points. Customer has ${customer.royaltyPoints || 0} pts, but ${pointsRequired} pts are required.`);
      }
      
      // Deduct Points
      customer.royaltyPoints -= pointsRequired;
      customer.totalSpent = (customer.totalSpent || 0) + finalAmountPaid;
      customer.lastPurchaseAt = new Date();
      await customer.save({ session });
      
    } else {
      // --- EARN POINTS LOGIC (Not paying with points) ---
      if (customerId && ownerForSub.settings?.royalty?.enabled) {
        const ppp = ownerForSub.settings.royalty.pointsPerPurchase || 0;
        if (ppp > 0) {
          // e.g. if ppp = 1000 NGN, and sale is 3500 NGN => 3 points
          pointsEarned = Math.floor(finalAmountPaid / ppp);
        }
      }
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
      totalMoney: totalMoney, // Gross
      discount: finalDiscount,
      amountPaid: finalAmountPaid, // Net 
      customerId: customerId || null,
      pointsEarned: pointsEarned,
      date: this.getCurrentDateString(),
      timestamp: new Date()
    } as any], { session });

    // 7. Update Customer Points asynchronously if earned (Only if NOT paying with points)
    if (paymentMethod !== 'POINTS' && customerId && pointsEarned > 0) {
      // Background update
      await Customer.updateOne(
        { _id: customerId }, 
        { 
           $inc: { royaltyPoints: pointsEarned, totalSpent: finalAmountPaid },
           $set: { lastPurchaseAt: new Date() }
        },
        { session }
      );
    }

    for (const alert of lowStockAlerts) {
      await queuePushNotification({
        type: 'SINGLE',
        agentId: ownerForSub._id.toString(), // Send to shop owner
        title: 'Low Stock Alert',
        body: `${alert.name} is running low (${alert.currentStock} left in stock)`,
      }).catch(console.error);

      await activityService.recordActivitySafely({
        user: ownerForSub._id as any,
        actor: user._id as any,
        type: 'LOW_STOCK',
        title: 'Low stock alert',
        message: `${alert.name} is running low with ${alert.currentStock} left in stock.`,
        metadata: {
          itemId: alert.itemId,
          productName: alert.name,
          previousStock: alert.previousStock,
          currentStock: alert.currentStock,
          threshold: 5,
          saleId: createdTx[0]._id.toString(),
        },
      });
    }

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

    const query: Record<string, unknown> = {
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
      query.timestamp = {};
      if (startDate) (query.timestamp as Record<string, unknown>).$gte = new Date(startDate);
      if (endDate) (query.timestamp as Record<string, unknown>).$lte = new Date(endDate);
      if (Object.keys(query.timestamp as object).length === 0) delete query.timestamp;
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
        (t.items as Record<string, unknown>[]).forEach((i: Record<string, unknown>) => {
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
        soldBy: (t.user && (t.user as Record<string, unknown>).role === 'STAFF') ? (t.user as Record<string, unknown>).name : 'Owner',
        items: ((t.items as Record<string, unknown>[]) || []).map((i: Record<string, unknown>) => ({
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

    const user = await User.findById(userId).session(session) as (mongoose.Document & IUser & { ownerId?: mongoose.Types.ObjectId, role?: string }) | null;
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
    const bulkOps: mongoose.AnyBulkWriteOperation<any>[] = [];
    const returnItems: Record<string, unknown>[] = [];
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
