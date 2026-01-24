import { Request, Response } from 'express';
import { User, IUser } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { Debtor } from '../models/debtor.model';
import { Order } from '../models/order.model';
import { getRelevantUserIds } from '../services/report.service';
const UNKNOWN_ITEM_NAMES = ['unknown_item', 'unknown', 'item', 'null', 'undefined'];

const unknownSaleQuery = {
  $or: [
    { items: { $exists: false } },
    { items: { $size: 0 } },
    {
      items: {
        $elemMatch: {
          $or: [
            { name: { $exists: false } },
            { name: null },
            { name: '' },
            { name: { $in: UNKNOWN_ITEM_NAMES } },
          ],
        },
      },
    },
  ],
};

const validSaleMatch = {
  $and: [
    { $or: [{ isUndone: { $exists: false } }, { isUndone: false }] },
    { $nor: [unknownSaleQuery] },
  ],
};


// --- HELPER: Map Country Code to Currency & Locale ---
const getCurrencyConfig = (countryCode: string = 'NG') => {
  const map: Record<string, { code: string; locale: string }> = {
    'NG': { code: 'NGN', locale: 'en-NG' }, // Nigeria
    'US': { code: 'USD', locale: 'en-US' }, // USA
    'GB': { code: 'GBP', locale: 'en-GB' }, // UK
    'GH': { code: 'GHS', locale: 'en-GH' }, // Ghana
    'KE': { code: 'KES', locale: 'en-KE' }, // Kenya
    'ZA': { code: 'ZAR', locale: 'en-ZA' }, // South Africa
    'EU': { code: 'EUR', locale: 'en-IE' }, // Europe
    // Add others as needed
  };

  // Default to Nigeria if code is missing or unknown
  return map[countryCode.toUpperCase()] || map['NG'];
};

export const getDashboardData = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    const { code: currencyCode, locale } = getCurrencyConfig(user.countryCode);

    const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN';
    const relevantIds = await getRelevantUserIds(user, scope);

    // 7-day range
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      totalRevenueRaw,
      itemsSoldRaw,
      dailyStats,
      recentSales,
      topItems,
      totalDebtors,
      pendingOrders,
      inventoryDocs
    ] = await Promise.all([
      // 1. Total Revenue
      Transaction.aggregate([
        { $match: { user: { $in: relevantIds }, type: 'SALE', ...validSaleMatch } },
        { $group: { _id: null, total: { $sum: '$totalMoney' } } },
      ]),

      // 2. Total Items Sold
      Transaction.aggregate([
        { $match: { user: { $in: relevantIds }, type: 'SALE', ...validSaleMatch } },
        { $unwind: '$items' },
        { $group: { _id: null, total: { $sum: '$items.qty' } } },
      ]),

      // 3. Daily Stats
      Transaction.aggregate([
        {
          $match: {
            user: { $in: relevantIds },
            type: 'SALE',
            timestamp: { $gte: sevenDaysAgo },
            ...validSaleMatch,
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            dailyRevenue: { $sum: '$totalMoney' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 4. Recent Transactions
      Transaction.find({ user: { $in: relevantIds }, type: 'SALE', ...validSaleMatch })
        .sort({ timestamp: -1 })
        .limit(10)
        .populate('user', 'name role'),

      // 5. Top Items
      Transaction.aggregate([
        { $match: { user: { $in: relevantIds }, type: 'SALE', ...validSaleMatch } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.name',
            revenue: { $sum: { $multiply: ['$items.qty', '$items.unitPrice'] } },
            qty: { $sum: '$items.qty' },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),

      // 6. Debtors
      Debtor.aggregate([
        { $match: { user: { $in: relevantIds }, totalDebt: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalDebt' }
          }
        }
      ]),

      // 7. Pending Orders
      Order.countDocuments({ user: { $in: relevantIds }, status: 'PENDING' }),

      // 8. Inventory (for legacy frontend compat)
      Inventory.find({ user: { $in: relevantIds } })
    ]);

    const totalRevenue = totalRevenueRaw[0]?.total || 0;
    const itemsSold = itemsSoldRaw[0]?.total || 0;

    // Fill chart gaps
    const map: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dowToName: Record<number, keyof typeof map> = {
      1: 'Sun', 2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri', 7: 'Sat',
    };

    // The aggregation returned dates YYYY-MM-DD, we need to map to Day Name for chart
    // Re-map dailyStats to day names
    for (const stat of dailyStats) {
       const date = new Date(stat._id); // "2023-10-27"
       // JS getDay(): 0=Sun, 1=Mon...
       const dayIndex = date.getDay() === 0 ? 7 : date.getDay(); // 1=Mon...7=Sun to match logic?
       // Actually simpler:
       const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }); // "Mon"
       if (map[dayName] !== undefined) {
          map[dayName] = stat.dailyRevenue;
       }
    }

    const salesChart = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map(day => ({
      day,
      sales: map[day],
    }));

    const transactions = recentSales.map(t => {
      const transactingUser = t.user; 
      return ({
        id: t._id,
        type: t.type,
        item: t.items.map((i: any) => i.name).join(', '),
        qty: t.items.reduce((acc: number, i: any) => acc + i.qty, 0),
        amount: t.totalMoney || 0,
        date: t.timestamp.toISOString(),
        soldBy: (transactingUser as IUser) && (transactingUser as IUser).role === 'STAFF' ? (transactingUser as IUser).name : 'Owner',
      });
    });

    const inventory = inventoryDocs.map(doc => ({
      name: doc.name,
      quantity: doc.quantity,
      lastUnitPrice: doc.lastUnitPrice || 0,
    }));

    return res.json({
      user: {
        name: user.name || 'Shop Owner',
        shopName: user.businessName || 'My Store',
        initials: user.businessName ? user.businessName.slice(0, 2).toUpperCase() : 'IO',
        planType: user.planType,
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
        nextBillingDate: user.nextBillingDate || null,
        settings: user.settings,
        
        shopSlug: user.shopSlug || null,
        shopDescription: user.shopDescription || null,
        heroImageUrl: user.heroImageUrl || null,

        countryCode: user.countryCode,
        currencyCode: currencyCode,
        locale: locale
      },
      stats: {
        revenue: totalRevenue,
        itemsSold: itemsSold,
        stockValue: 0,
        debtorsCount: totalDebtors[0]?.count || 0,
        debtorsAmount: totalDebtors[0]?.totalAmount || 0,
        pendingOrders: pendingOrders
      },
      inventory,
      transactions,
      salesChart,
      topItems: topItems.map((i: any) => ({
        name: i._id,
        revenue: i.revenue,
        qty: i.qty,
      })),
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};