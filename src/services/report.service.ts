import { Types } from 'mongoose';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User, IUser } from '../models/user.model';
import { getTodayRangeForOffset } from '../utils/dates';

// Helper function to get relevant user IDs based on role and report type
export const getRelevantUserIds = async (user: IUser, reportScope: 'OWN' | 'SHOP'): Promise<Types.ObjectId[]> => {
  if (!user) throw new Error('User not found');

  // If the report scope is 'OWN', return only the current user's ID
  if (reportScope === 'OWN') {
    return [user._id as Types.ObjectId];
  }

  // If the report scope is 'SHOP' (for inventory/full shop sales for owner)
  if (user.role === 'OWNER') {
    const staff = await User.find({ ownerId: user._id, role: 'STAFF' }).select('_id').lean();
    return [user._id as Types.ObjectId].concat(staff.map(s => s._id as Types.ObjectId));
  } else if (user.role === 'STAFF' && user.ownerId) {
    const owner = await User.findById(user.ownerId).select('_id').lean();
    if (!owner?._id) return [user._id as Types.ObjectId];

    const staff = await User.find({ ownerId: user.ownerId, role: 'STAFF' }).select('_id').lean();
    return [owner._id as Types.ObjectId].concat(staff.map(s => s._id as Types.ObjectId));
  }

  return [user._id as Types.ObjectId];
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

// ✅ Safe total expression: items.total fallback to (qty * unitPrice)
const itemTotalExpr = {
  $ifNull: [
    '$items.total',
    { $multiply: [{ $ifNull: ['$items.qty', 0] }, { $ifNull: ['$items.unitPrice', 0] }] },
  ],
};

// 1) SALES REPORT (Money) — excludes CREDIT + excludes UNDONE
export const getDailySummary = async (
  userId: Types.ObjectId,
  customStart?: Date,
  customEnd?: Date
): Promise<{ totalRevenue: number; items: DailyItem[] }> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const scope: 'OWN' | 'SHOP' = user.role === 'OWNER' ? 'SHOP' : 'OWN';
  const relevantUserIds = await getRelevantUserIds(user, scope);

  let start: Date, end: Date;

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
        user: { $in: relevantUserIds },
        type: 'SALE',
        isUndone: { $ne: true },                 // ✅ ignore undone
        paymentStatus: { $ne: 'CREDIT' },        // ✅ ignore credit from revenue
        createdAt: { $gte: start, $lte: end },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        totalQty: { $sum: '$items.qty' },
        unit: { $first: '$items.unit' },
        totalAmount: { $sum: itemTotalExpr },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  const totalRevenue = result.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  return {
    totalRevenue,
    items: result.map((r) => ({
      name: r._id,
      qty: r.totalQty,
      unit: r.unit || '',
      totalAmount: r.totalAmount || 0,
    })),
  };
};

// 2) STOCK REPORT (Quantity) — unchanged logic (shop-wide for both owner/staff)
export const getStockReport = async (userId: Types.ObjectId, itemQuery: string | null = null): Promise<StockItem[]> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const relevantUserIds = await getRelevantUserIds(user, 'SHOP');

  const query: any = { user: { $in: relevantUserIds } };

  if (itemQuery) {
    query.name = { $regex: itemQuery, $options: 'i' };
  }

  const stock = await Inventory.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$name',
        quantity: { $sum: '$quantity' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return stock.map((item: any) => ({
    name: item._id,
    quantity: item.quantity,
  }));
};

// 3) FULL SUMMARY (Sales + Stock + Credit) — ignores UNDONE + CREDIT not added to revenue
export const getFullSummary = async (
  userId: Types.ObjectId,
  customStart?: Date,
  customEnd?: Date
): Promise<FullSummaryEntry[]> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const salesScope: 'OWN' | 'SHOP' = user.role === 'OWNER' ? 'SHOP' : 'OWN';
  const salesUserIds = await getRelevantUserIds(user, salesScope);

  const stockUserIds = await getRelevantUserIds(user, 'SHOP');

  let start: Date, end: Date;

  if (customStart && customEnd) {
    start = customStart;
    end = customEnd;
  } else {
    const offset = user.settings?.utcOffsetMinutes ?? 60;
    const range = getTodayRangeForOffset(offset);
    start = range.start;
    end = range.end;
  }

  // A) Sales aggregation (by item + status)
  const salesAgg = await Transaction.aggregate<SalesAggResult>([
    {
      $match: {
        user: { $in: salesUserIds },
        type: 'SALE',
        isUndone: { $ne: true },             // ✅ ignore undone
        createdAt: { $gte: start, $lte: end },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: { name: '$items.name', status: '$paymentStatus' },
        totalQty: { $sum: '$items.qty' },
        unit: { $first: '$items.unit' },
        totalAmount: { $sum: itemTotalExpr },
      },
    },
  ]);

  // B) Stock snapshot (now)
  const stock = await Inventory.find({ user: { $in: stockUserIds } }).select('name quantity').lean();

  // C) Merge
  const reportMap = new Map<string, FullSummaryEntry>();

  stock.forEach((item: any) => {
    const name = String(item.name || '').trim();
    if (!name) return;

    if (reportMap.has(name)) {
      reportMap.get(name)!.stock += Number(item.quantity || 0);
    } else {
      reportMap.set(name, {
        name,
        stock: Number(item.quantity || 0),
        soldPaid: 0,
        soldCredit: 0,
        revenue: 0,
        unit: 'pcs',
      });
    }
  });

  salesAgg.forEach((sale) => {
    const name = sale._id.name;
    const status = sale._id.status;

    if (!reportMap.has(name)) {
      reportMap.set(name, {
        name,
        stock: 0,
        soldPaid: 0,
        soldCredit: 0,
        revenue: 0,
        unit: sale.unit || 'pcs',
      });
    }

    const entry = reportMap.get(name)!;

    if (status === 'CREDIT') {
      entry.soldCredit += sale.totalQty;
      // ✅ do NOT add revenue
    } else {
      // PAID or PARTIAL counts as “paid sales” bucket
      entry.soldPaid += sale.totalQty;
      entry.revenue += sale.totalAmount || 0;
    }

    if (sale.unit) entry.unit = sale.unit;
  });

  return Array.from(reportMap.values());
};

// 4) TODAY'S TRANSACTIONS (Audit Trail) — ignores UNDONE
export const getTodayTransactions = async (
  userId: Types.ObjectId,
  customStart?: Date,
  customEnd?: Date
) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const scope: 'OWN' | 'SHOP' = user.role === 'OWNER' ? 'SHOP' : 'OWN';
  const relevantUserIds = await getRelevantUserIds(user, scope);

  let start: Date, end: Date;

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
    isUndone: { $ne: true },               // ✅ ignore undone
    createdAt: { $gte: start, $lte: end },
  })
    .populate('user', 'phoneNumber name role')
    .sort({ createdAt: 1 });

  return transactions;
};

// 6) PROFIT REPORT (Revenue - Cost)
export const getProfitSummary = async (
  userId: Types.ObjectId,
  customStart?: Date,
  customEnd?: Date
): Promise<{ totalRevenue: number; totalCost: number; totalProfit: number; items: any[] }> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const scope: 'OWN' | 'SHOP' = user.role === 'OWNER' ? 'SHOP' : 'OWN';
  const relevantUserIds = await getRelevantUserIds(user, scope);

  let start: Date, end: Date;

  if (customStart && customEnd) {
    start = customStart;
    end = customEnd;
  } else {
    const offset = user.settings?.utcOffsetMinutes ?? 60;
    const range = getTodayRangeForOffset(offset);
    start = range.start;
    end = range.end;
  }

  const result = await Transaction.aggregate([
    {
      $match: {
        user: { $in: relevantUserIds },
        type: 'SALE',
        isUndone: { $ne: true },
        createdAt: { $gte: start, $lte: end },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        totalQty: { $sum: '$items.qty' },
        revenue: { 
          $sum: { $multiply: [{ $ifNull: ['$items.qty', 0] }, { $ifNull: ['$items.unitPrice', 0] }] } 
        },
        cost: {
          $sum: { $multiply: [{ $ifNull: ['$items.qty', 0] }, { $ifNull: ['$items.costPrice', 0] }] }
        }
      },
    },
    {
      $project: {
        name: '$_id',
        totalQty: 1,
        revenue: 1,
        cost: 1,
        profit: { $subtract: ['$revenue', '$cost'] }
      }
    },
    { $sort: { profit: -1 } }
  ]);

  const totalRevenue = result.reduce((sum, item) => sum + (item.revenue || 0), 0);
  const totalCost = result.reduce((sum, item) => sum + (item.cost || 0), 0);
  const totalProfit = totalRevenue - totalCost;

  return {
    totalRevenue,
    totalCost,
    totalProfit,
    items: result
  };
};

// 5) SMART SUGGESTIONS — ignore undone
export const getSmartSuggestions = async (userId: Types.ObjectId): Promise<string[]> => {
  const user = await User.findById(userId);
  if (!user) return [];

  const relevantUserIds = await getRelevantUserIds(user, 'OWN');

  const offset = user.settings?.utcOffsetMinutes ?? 60;

  const now = new Date();
  const localNow = new Date(now.getTime() + offset * 60 * 1000);
  const currentHour = localNow.getUTCHours();

  const startHour = (currentHour - 2 + 24) % 24;
  const endHour = (currentHour + 2) % 24;

  const suggestions = await Transaction.aggregate([
    {
      $match: {
        user: { $in: relevantUserIds },
        type: 'SALE',
        isUndone: { $ne: true }, // ✅ ignore undone
        timestamp: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      },
    },
    {
      $addFields: {
        transHour: { $hour: { date: { $add: ['$timestamp', offset * 60 * 1000] } } },
      },
    },
    {
      $match: {
        $expr: {
          $cond: {
            if: { $lte: [startHour, endHour] },
            then: { $and: [{ $gte: ['$transHour', startHour] }, { $lte: ['$transHour', endHour] }] },
            else: { $or: [{ $gte: ['$transHour', startHour] }, { $lte: ['$transHour', endHour] }] },
          },
        },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.name',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 3 },
  ]);

  return suggestions.map((s: any) => s._id);
};
