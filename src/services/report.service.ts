import { Types } from 'mongoose';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User, IUser } from '../models/user.model';
import { getTodayRangeForOffset } from '../utils/dates';

// Helper function to get relevant user IDs based on role and report type
const _getRelevantUserIds = async (user: IUser, reportScope: 'OWN' | 'SHOP'): Promise<Types.ObjectId[]> => {
  if (!user) throw new Error('User not found');

  // If the report scope is 'OWN', return only the current user's ID
  if (reportScope === 'OWN') {
    return [user._id as Types.ObjectId];
  }

  // If the report scope is 'SHOP' (for inventory/full shop sales for owner)
  if (user.role === 'OWNER') {
    const staff = await User.find({ ownerId: user._id, role: 'STAFF' });
    return [user._id as Types.ObjectId].concat(staff.map(s => s._id as Types.ObjectId));
  } else if (user.role === 'STAFF' && user.ownerId) {
    // If a staff member is requesting a 'SHOP' scope report, it means they want to see the whole shop's inventory/prices.
    // For sales, however, they will typically only see their own. This function handles the "who made the sale" part.
    const owner = await User.findById(user.ownerId);
    if (!owner) return [user._id as Types.ObjectId]; // Should not happen if ownerId exists

    const staff = await User.find({ ownerId: user.ownerId, role: 'STAFF' });
    // Staff can see shop inventory (owned by owner + staff updates), but usually sales are scoped.
    // For 'SHOP' scope on inventory, return everyone.
    return [owner._id as Types.ObjectId].concat(staff.map(s => s._id as Types.ObjectId));
  }
  
  return [user._id as Types.ObjectId]; // Default case, should not be hit often
};

interface DailyAggResult {
  _id: string;
  totalQty: number;
  unit?: string;
  totalAmount?: number;
}

interface DailyItem {
  name: string;
  qty: number;
  unit: string;
  totalAmount?: number;
}

interface StockItem {
  name: string;
  quantity: number;
}

interface SalesAggResult {
  _id: { name: string; status: string };
  totalQty: number;
  unit?: string;
  totalAmount?: number;
}

interface FullSummaryEntry {
  name: string;
  stock: number;
  soldPaid: number;
  soldCredit: number;
  revenue: number;
  unit: string;
}

// 1. SALES REPORT (Money)
export const getDailySummary = async (
  userId: Types.ObjectId, 
  customStart?: Date, 
  customEnd?: Date
): Promise<{ totalRevenue: number; items: DailyItem[] }> => {
  
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN'; // Owner sees all, staff sees own
  const relevantUserIds = await _getRelevantUserIds(user, scope);

  let start, end;

  if (customStart && customEnd) {
      start = customStart;
      end = customEnd;
  } else {
      const offset = user.settings?.utcOffsetMinutes ?? 60;
      const range = getTodayRangeForOffset(offset);
      start = range.start;
      end = range.end;
  }

  const result = await Transaction.aggregate<DailyAggResult>([
    {
      $match: {
        timestamp: { $gte: start, $lte: end },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        totalQty: { $sum: '$items.qty' },
        unit: { $first: '$items.unit' },
        totalAmount: { $sum: { $ifNull: ['$items.total', 0] } },
      },
    },
  ]);

  const totalRevenue = result.reduce((sum: number, item: DailyAggResult) => sum + (item.totalAmount || 0), 0);

  return {
    totalRevenue,
    items: result.map((r: DailyAggResult) => ({
      name: r._id,
      qty: r.totalQty,
      unit: r.unit || '',
      totalAmount: r.totalAmount,
    })),
  };
};

// 2. STOCK REPORT (Quantity)
export const getStockReport = async (userId: Types.ObjectId, itemQuery: string | null = null): Promise<StockItem[]> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const relevantUserIds = await _getRelevantUserIds(user, 'SHOP'); // Both owner and staff see all stock

  let query: any = { user: { $in: relevantUserIds } };

  if (itemQuery) {
    query['name'] = { $regex: itemQuery, $options: 'i' };
  }

  // Aggregate to sum up quantities if multiple users have inventory records for the same item
  const stock = await Inventory.aggregate([
      { $match: query },
      { 
          $group: { 
              _id: "$name", 
              quantity: { $sum: "$quantity" } 
          } 
      }
  ]);

  return stock.map((item: any) => ({
    name: item._id,
    quantity: item.quantity,
  }));
};

// 3. FULL SUMMARY (Sales + Stock + Credit)
export const getFullSummary = async (
  userId: Types.ObjectId,
  customStart?: Date, 
  customEnd?: Date
): Promise<FullSummaryEntry[]> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const salesScope = user.role === 'OWNER' ? 'SHOP' : 'OWN'; // Owner sees all sales, staff sees own
  const salesUserIds = await _getRelevantUserIds(user, salesScope);

  const stockScope = 'SHOP'; // Both owner and staff see all stock
  const stockUserIds = await _getRelevantUserIds(user, stockScope);

  let start, end;
  if (customStart && customEnd) {
      start = customStart;
      end = customEnd;
  } else {
      const offset = user.settings?.utcOffsetMinutes ?? 60;
      const range = getTodayRangeForOffset(offset);
      start = range.start;
      end = range.end;
  }

  // A. Get Sales (Grouped by Item & Payment Status) using the correct date range
  const salesAgg = await Transaction.aggregate<SalesAggResult>([
    {
      $match: {
        user: { $in: salesUserIds },
        type: 'SALE',
        timestamp: { $gte: start, $lte: end },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: { name: '$items.name', status: '$paymentStatus' },
        totalQty: { $sum: '$items.qty' },
        unit: { $first: '$items.unit' },
        totalAmount: { $sum: { $ifNull: ['$items.total', 0] } },
      },
    },
  ]);

  // B. Get Current Stock (Snapshot is always "Now")
  const stock = await Inventory.find({ user: { $in: stockUserIds } });

  // C. Merge Data
  const reportMap: Map<string, FullSummaryEntry> = new Map();

  // Initialize with stock data
  stock.forEach((item: { name: string; quantity: number }) => {
    if (reportMap.has(item.name)) {
        const existing = reportMap.get(item.name)!;
        existing.stock += item.quantity;
    } else {
        reportMap.set(item.name, {
            name: item.name,
            stock: item.quantity,
            soldPaid: 0,
            soldCredit: 0,
            revenue: 0,
            unit: 'pcs', 
        });
    }
  });

  // Add sales data
  salesAgg.forEach((sale: SalesAggResult) => {
    const name = sale._id.name;
    const status = sale._id.status; 

    if (!reportMap.has(name)) {
      reportMap.set(name, { name, stock: 0, soldPaid: 0, soldCredit: 0, revenue: 0, unit: sale.unit || 'pcs' });
    }

    const entry = reportMap.get(name)!;
    if (status === 'CREDIT') {
      entry.soldCredit += sale.totalQty;
    } else {
      entry.soldPaid += sale.totalQty;
      entry.revenue += sale.totalAmount || 0;
    }
    if (sale.unit) entry.unit = sale.unit;
  });

  return Array.from(reportMap.values());
};

// 4. TODAY'S TRANSACTIONS (Audit Trail)
export const getTodayTransactions = async (
    userId: Types.ObjectId,
    customStart?: Date,
    customEnd?: Date
) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  
  const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN'; // Owner sees all, staff sees own
  const relevantUserIds = await _getRelevantUserIds(user, scope);

  let start, end;
  if (customStart && customEnd) {
      start = customStart;
      end = customEnd;
  } else {
      const offset = user.settings?.utcOffsetMinutes ?? 60;
      const range = getTodayRangeForOffset(offset);
      start = range.start;
      end = range.end;
  }

  const transactions = await Transaction.find({
    user: { $in: relevantUserIds },
    type: 'SALE',
    timestamp: { $gte: start, $lte: end }
  }).populate('user', 'phoneNumber name role').sort({ createdAt: 1 }); 

  return transactions;
};

// 5. SMART SUGGESTIONS
export const getSmartSuggestions = async (userId: Types.ObjectId): Promise<string[]> => {
  const user = await User.findById(userId);
  if (!user) return [];

  const relevantUserIds = await _getRelevantUserIds(user, 'OWN'); // Suggestions should be based on the individual user's sales pattern usually, or shop

  const offset = user.settings?.utcOffsetMinutes ?? 60;
  
  const now = new Date();
  const localNow = new Date(now.getTime() + offset * 60 * 1000);
  const currentHour = localNow.getUTCHours();

  const startHour = (currentHour - 2 + 24) % 24;
  const endHour = (currentHour + 2) % 24;

  const suggestions = await Transaction.aggregate([
    {
      $match: {
        user: { $in: relevantUserIds }, // Use relevantUserIds
        type: 'SALE',
        timestamp: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } 
      }
    },
    {
      $addFields: {
        transHour: { $hour: { date: { $add: ["$timestamp", offset * 60 * 1000] } } }
      }
    },
    {
      $match: {
        $expr: {
            $cond: {
                if: { $lte: [startHour, endHour] },
                then: { $and: [{ $gte: ["$transHour", startHour] }, { $lte: ["$transHour", endHour] }] },
                else: { $or: [{ $gte: ["$transHour", startHour] }, { $lte: ["$transHour", endHour] }] }
            }
        }
      }
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.name",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 3 }
  ]);

  return suggestions.map(s => s._id);
};