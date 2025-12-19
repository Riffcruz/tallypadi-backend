// src/services/report.service.ts
import { Types } from 'mongoose';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User, IUser } from '../models/user.model';
import { getTodayRangeForOffset } from '../utils/dates';

// Standard filter: Only show valid (not undone) sales
const notUndoneMatch = {
  $or: [{ isUndone: { $exists: false } }, { isUndone: false }],
};

// Filter Logic:
// If includeUndone is TRUE -> Show ONLY undone items (so we can see what was cancelled).
// If includeUndone is FALSE -> Show ONLY valid items (standard report).
const applyUndoneFilter = (showUndoneOnly?: boolean) => {
  if (showUndoneOnly) {
    return { isUndone: true };
  }
  return notUndoneMatch;
};

// Helper function to get relevant user IDs based on role and report type
const _getRelevantUserIds = async (user: IUser, reportScope: 'OWN' | 'SHOP'): Promise<Types.ObjectId[]> => {
  if (!user) throw new Error('User not found');

  if (reportScope === 'OWN') return [user._id as Types.ObjectId];

  if (user.role === 'OWNER') {
    const staff = await User.find({ ownerId: user._id, role: 'STAFF' });
    return [user._id as Types.ObjectId].concat(staff.map((s) => s._id as Types.ObjectId));
  } else if (user.role === 'STAFF' && user.ownerId) {
    const owner = await User.findById(user.ownerId);
    if (!owner) return [user._id as Types.ObjectId];

    const staff = await User.find({ ownerId: user.ownerId, role: 'STAFF' });
    return [owner._id as Types.ObjectId].concat(staff.map((s) => s._id as Types.ObjectId));
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

// 1. SALES REPORT (Money)
export const getDailySummary = async (
  userId: Types.ObjectId,
  customStart?: Date,
  customEnd?: Date,
  includeUndone: boolean = false
): Promise<{ totalRevenue: number; items: DailyItem[] }> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN';
  const relevantUserIds = await _getRelevantUserIds(user, scope);

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

  const undoneFilter = applyUndoneFilter(includeUndone);

  const result = await Transaction.aggregate<DailyAggResult>([
    {
      $match: {
        user: { $in: relevantUserIds },
        type: 'SALE',
        createdAt: { $gte: start, $lte: end },
        ...undoneFilter,
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

  const totalRevenue = result.reduce((sum, item) => sum + (item.totalAmount || 0), 0);

  return {
    totalRevenue,
    items: result.map((r) => ({
      name: r._id,
      qty: r.totalQty,
      unit: r.unit || '',
      totalAmount: r.totalAmount,
    })),
  };
};

// 2. STOCK REPORT (Quantity)
// Note: Stock report reads from Inventory model, which reflects current state.
// Undone sales restore stock immediately, so no filter is needed here.
export const getStockReport = async (userId: Types.ObjectId, itemQuery: string | null = null): Promise<StockItem[]> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const relevantUserIds = await _getRelevantUserIds(user, 'SHOP');

  const query: any = { user: { $in: relevantUserIds } };
  if (itemQuery) query['name'] = { $regex: itemQuery, $options: 'i' };

  const stock = await Inventory.aggregate([
    { $match: query },
    { $group: { _id: '$name', quantity: { $sum: '$quantity' } } },
  ]);

  return stock.map((item: any) => ({ name: item._id, quantity: item.quantity }));
};

// 3. FULL SUMMARY (Sales + Stock + Credit)
export const getFullSummary = async (
  userId: Types.ObjectId,
  customStart?: Date,
  customEnd?: Date,
  includeUndone: boolean = false
): Promise<FullSummaryEntry[]> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const salesScope = user.role === 'OWNER' ? 'SHOP' : 'OWN';
  const salesUserIds = await _getRelevantUserIds(user, salesScope);

  const stockScope = 'SHOP';
  const stockUserIds = await _getRelevantUserIds(user, stockScope);

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

  const undoneFilter = applyUndoneFilter(includeUndone);

  const salesAgg = await Transaction.aggregate<SalesAggResult>([
    {
      $match: {
        user: { $in: salesUserIds },
        type: 'SALE',
        createdAt: { $gte: start, $lte: end },
        ...undoneFilter,
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

  const stock = await Inventory.find({ user: { $in: stockUserIds } });

  const reportMap: Map<string, FullSummaryEntry> = new Map();

  // Populate Stock first
  stock.forEach((item: { name: string; quantity: number }) => {
    if (reportMap.has(item.name)) {
      reportMap.get(item.name)!.stock += item.quantity;
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

  // Populate Sales (Valid OR Undone based on filter)
  salesAgg.forEach((sale) => {
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
  customEnd?: Date,
  includeUndone: boolean = false
) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN';
  const relevantUserIds = await _getRelevantUserIds(user, scope);

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

  const undoneFilter = applyUndoneFilter(includeUndone);

  const transactions = await Transaction.find({
    user: { $in: relevantUserIds },
    type: 'SALE',
    createdAt: { $gte: start, $lte: end },
    ...undoneFilter,
  })
    .populate('user', 'phoneNumber name role')
    .sort({ createdAt: 1 });

  return transactions;
};

// 5. SMART SUGGESTIONS
export const getSmartSuggestions = async (
  userId: Types.ObjectId,
  includeUndone: boolean = false
): Promise<string[]> => {
  const user = await User.findById(userId);
  if (!user) return [];

  const relevantUserIds = await _getRelevantUserIds(user, 'OWN');

  const offset = user.settings?.utcOffsetMinutes ?? 60;

  const now = new Date();
  const localNow = new Date(now.getTime() + offset * 60 * 1000);
  const currentHour = localNow.getUTCHours();

  const startHour = (currentHour - 2 + 24) % 24;
  const endHour = (currentHour + 2) % 24;

  const undoneFilter = applyUndoneFilter(includeUndone);

  const suggestions = await Transaction.aggregate([
    {
      $match: {
        user: { $in: relevantUserIds },
        type: 'SALE',
        timestamp: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
        ...undoneFilter,
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
    { $group: { _id: '$items.name', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 3 },
  ]);

  return suggestions.map((s: any) => s._id);
};