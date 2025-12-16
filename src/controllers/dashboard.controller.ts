import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';

export const getDashboardData = async (req: Request, res: Response) => {
  try {
    // 1) Mock auth (replace with req.user.id later)
    const user = await User.findOne();
    if (!user) {
      return res.status(404).json({ error: "No user found. Please chat with the bot first!" });
    }

    // 2) Inventory
    const inventoryDocs = await Inventory.find({ user: user._id });
    const inventory = inventoryDocs.map(doc => ({
      name: doc.name,
      quantity: doc.quantity,
      lastUnitPrice: doc.lastUnitPrice || 0, // ✅ match your dashboard reducer
    }));

    // 3) Recent transactions
    const transactionDocs = await Transaction.find({ user: user._id })
      .sort({ timestamp: -1 })
      .limit(10);

    const transactions = transactionDocs.map(t => ({
      id: t._id,
      type: t.type, // 'SALE' | 'RESTOCK'
      item: t.items.map(i => i.name).join(', '),
      qty: t.items.reduce((acc, i) => acc + i.qty, 0),
      amount: t.totalMoney || 0,
      date: t.timestamp.toISOString(), // ✅ full timestamp for date + time in UI
    }));

    // 4) Stats
    const totalRevenueAgg = await Transaction.aggregate([
      { $match: { user: user._id, type: 'SALE' } },
      { $group: { _id: null, total: { $sum: '$totalMoney' } } },
    ]);

    const totalItemsSoldAgg = await Transaction.aggregate([
      { $match: { user: user._id, type: 'SALE' } },
      { $unwind: '$items' },
      { $group: { _id: null, total: { $sum: '$items.qty' } } },
    ]);

    // 5) Sales chart (Mon..Sun) last 7 days
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const salesByDow = await Transaction.aggregate([
      {
        $match: {
          user: user._id,
          type: 'SALE',
          timestamp: { $gte: start },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: '$timestamp' }, // 1=Sun ... 7=Sat
          sales: { $sum: '$totalMoney' },
        },
      },
    ]);

    const map: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dowToName: Record<number, keyof typeof map> = {
      1: 'Sun',
      2: 'Mon',
      3: 'Tue',
      4: 'Wed',
      5: 'Thu',
      6: 'Fri',
      7: 'Sat',
    };

    for (const row of salesByDow) {
      const key = dowToName[row._id as number];
      if (key) map[key] = Number(row.sales) || 0;
    }

    const salesChart = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map(day => ({
      day,
      sales: map[day],
    }));

    // 6) Response (✅ matches TSX)
    return res.json({
      user: {
        name: user.name || 'Shop Owner',
        shopName: user.businessName || 'My Store',
        initials: user.businessName ? user.businessName.slice(0, 2).toUpperCase() : 'IO',
        planType: user.planType,
        subscriptionStatus: user.subscriptionStatus, // ✅ for gating
        trialEndsAt: user.trialEndsAt,               // ✅ for gating
        nextBillingDate: user.nextBillingDate || null,
        settings: user.settings,
      },
      stats: {
        revenue: totalRevenueAgg[0]?.total || 0,
        itemsSold: totalItemsSoldAgg[0]?.total || 0,
        stockValue: 0,
      },
      inventory,
      transactions,
      salesChart, // ✅ your dashboard TSX checks this first
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};
