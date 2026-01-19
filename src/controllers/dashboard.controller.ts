import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
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
    // ✅ FIX 1: USE REAL AUTH
    // Assuming your auth middleware attaches the user ID to req.user.id or req.userId
    // If you are testing without a frontend token, you might need to temporarily hardcode the US User ID here.
    const userId = req.user?.id || req.user?._id || req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    // ✅ FIX 2: GET CURRENCY DETAILS
    const { code: currencyCode, locale } = getCurrencyConfig(user.countryCode);

    const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN';
    const relevantIds = await getRelevantUserIds(user, scope);

    // 2) Inventory
    const inventoryDocs = await Inventory.find({ user: { $in: relevantIds } });
    const inventory = inventoryDocs.map(doc => ({
      name: doc.name,
      quantity: doc.quantity,
      lastUnitPrice: doc.lastUnitPrice || 0,
      // Optional: Add price formatted string if needed, but frontend handles it now
    }));

    // 3) Recent transactions
    const transactionDocs = await Transaction.find({
  user: { $in: relevantIds },
  ...validSaleMatch, // ✅ excludes undone + unknown
})
  .sort({ timestamp: -1 })
  .limit(10)
  .populate('user', 'name role'); // ✅ Populate user to get staff name


    const transactions = transactionDocs.map(t => {
      const transactingUser = t.user; // No cast needed
      return ({
        id: t._id,
        type: t.type,
        item: t.items.map(i => i.name).join(', '),
        qty: t.items.reduce((acc, i) => acc + i.qty, 0),
        amount: t.totalMoney || 0,
        date: t.timestamp.toISOString(),
        soldBy: transactingUser && transactingUser.role === 'STAFF' ? transactingUser.name : 'Owner', // ✅ Add soldBy field
      });
    });

    // 4) Stats
  const totalRevenueAgg = await Transaction.aggregate([
  { $match: { user: { $in: relevantIds }, type: 'SALE', ...validSaleMatch } },
  { $group: { _id: null, total: { $sum: '$totalMoney' } } },
]);


    const totalItemsSoldAgg = await Transaction.aggregate([
  { $match: { user: { $in: relevantIds }, type: 'SALE', ...validSaleMatch } },
  { $unwind: '$items' },
  { $group: { _id: null, total: { $sum: '$items.qty' } } },
]);


    // 5) Sales chart
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const salesByDow = await Transaction.aggregate([
  {
    $match: {
      user: { $in: relevantIds },
      type: 'SALE',
      timestamp: { $gte: start },
      ...validSaleMatch, // ✅ excludes undone + unknown
    },
  },
  {
    $group: {
      _id: { $dayOfWeek: '$timestamp' },
      sales: { $sum: '$totalMoney' },
    },
  },
]);


    const map: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dowToName: Record<number, keyof typeof map> = {
      1: 'Sun', 2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri', 7: 'Sat',
    };

    for (const row of salesByDow) {
      const key = dowToName[row._id as number];
      if (key) map[key] = Number(row.sales) || 0;
    }

    const salesChart = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map(day => ({
      day,
      sales: map[day],
    }));

    // 6) Response
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
        
        // ✅ NEW FIELDS SENT TO FRONTEND
        countryCode: user.countryCode, // e.g., 'US'
        currencyCode: currencyCode,    // e.g., 'USD'
        locale: locale                 // e.g., 'en-US'
      },
      stats: {
        revenue: totalRevenueAgg[0]?.total || 0,
        itemsSold: totalItemsSoldAgg[0]?.total || 0,
        stockValue: 0, // You can calculate this from inventory loop if desired
      },
      inventory,
      transactions,
      salesChart,
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};