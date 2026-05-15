import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { Types } from 'mongoose';
import { buildMarketplaceProductSeo } from './marketplaceSeo.service';

export const hqService = {
  // Get all branches for an HQ user
  getBranches: async (hqUserId: string) => {
    return await User.find({ hqId: hqUserId, role: 'OWNER' })
      .select('_id businessName name phoneNumber city address shopSlug lastSeen subscriptionStatus')
      .lean();
  },

  // Get aggregated dashboard stats
  getDashboardStats: async (hqUserId: string) => {
    const branches = await User.find({ hqId: hqUserId, role: 'OWNER' }).select('_id businessName').lean();
    const branchIds = branches.map(b => b._id);

    if (branchIds.length === 0) {
      return {
        overview: {
          totalRevenue: 0,
          totalSales: 0,
          todayRevenue: 0,
          todaySales: 0,
          activeBranches: 0
        },
        recentNetworkSales: []
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalStats, todayStats, recentSales] = await Promise.all([
      Transaction.aggregate([
        { $match: { user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true } } },
        { $group: { _id: null, revenue: { $sum: '$totalMoney' }, count: { $sum: 1 } } }
      ]),
      Transaction.aggregate([
        { $match: { user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true }, timestamp: { $gte: todayStart } } },
        { $group: { _id: null, revenue: { $sum: '$totalMoney' }, count: { $sum: 1 } } }
      ]),
      Transaction.find({ user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true } })
        .sort({ timestamp: -1 })
        .limit(10)
        .populate('user', 'businessName shopSlug')
        .lean()
    ]);

    return {
      overview: {
        totalRevenue: totalStats[0]?.revenue || 0,
        totalSales: totalStats[0]?.count || 0,
        todayRevenue: todayStats[0]?.revenue || 0,
        todaySales: todayStats[0]?.count || 0,
        activeBranches: branchIds.length
      },
      recentNetworkSales: recentSales.map((t) => ({
        id: t._id,
        branchName: (t.user as { businessName?: string })?.businessName || 'Unknown Branch',
        amount: t.totalMoney,
        items: (t.items as { name?: string }[])?.map((i) => i.name).join(', '),
        date: t.timestamp
      }))
    };
  },

  // Compare branches (sales this week)
  compareBranches: async (hqUserId: string) => {
      const branches = await User.find({ hqId: hqUserId, role: 'OWNER' }).select('_id businessName').lean();
      const branchIds = branches.map(b => b._id);
      
      if (branchIds.length === 0) return [];

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const stats = await Transaction.aggregate([
          { $match: { user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true }, timestamp: { $gte: sevenDaysAgo } } },
          { $group: { 
              _id: '$user', 
              revenue: { $sum: '$totalMoney' }, 
              salesCount: { $sum: 1 } 
          }},
          { $sort: { revenue: -1 } }
      ]);

      return stats.map(s => {
          const b = branches.find(br => String(br._id) === String(s._id));
          return {
              branchName: b?.businessName || 'Unknown',
              revenue: s.revenue,
              salesCount: s.salesCount
          };
      });
  },

  // Transfer stock logic
  transferStock: async (hqUserId: string, fromBranchName: string, toBranchName: string, itemName: string, quantity: number) => {
    // Fuzzy match branch names
    const branches = await User.find({ hqId: hqUserId, role: 'OWNER' });
    
    const findBranch = (name: string) => branches.find(b => 
        (b.businessName || '').toLowerCase().includes(name.toLowerCase()) || 
        (b.shopSlug || '').toLowerCase().includes(name.toLowerCase())
    );

    const fromBranch = findBranch(fromBranchName);
    const toBranch = findBranch(toBranchName);

    if (!fromBranch || !toBranch) {
        throw new Error(`Branch not found. From: "${fromBranchName}" -> Found: ${!!fromBranch}, To: "${toBranchName}" -> Found: ${!!toBranch}`);
    }

    const sourceItem = await Inventory.findOne({ user: fromBranch._id, name: itemName.toLowerCase() });
    if (!sourceItem || sourceItem.quantity < quantity) {
        throw new Error(`Insufficient stock of "${itemName}" in ${fromBranch.businessName}. Available: ${sourceItem?.quantity || 0}`);
    }

    // Perform transfer
    sourceItem.quantity -= quantity;
    await sourceItem.save();

    let destItem = await Inventory.findOne({ user: toBranch._id, name: itemName.toLowerCase() });
    if (destItem) {
        destItem.quantity += quantity;
        destItem.marketplaceSeo = buildMarketplaceProductSeo(destItem, toBranch);
        await destItem.save();
    } else {
        const newProduct = {
            user: toBranch._id,
            name: itemName.toLowerCase(),
            quantity: quantity,
            lastUnitPrice: sourceItem.lastUnitPrice,
            costPrice: sourceItem.costPrice,
            category: sourceItem.category,
            image: sourceItem.image
        };
        await Inventory.create({
            ...newProduct,
            marketplaceSeo: buildMarketplaceProductSeo(newProduct, toBranch),
        });
    }

    // Log transaction
    await Transaction.create({
        user: hqUserId, 
        type: 'TRANSFER',
        totalMoney: 0,
        items: [{ name: itemName, qty: quantity, unitPrice: sourceItem.lastUnitPrice }],
        timestamp: new Date(),
        date: new Date().toISOString().split('T')[0],
        notes: `Transfer from ${fromBranch.businessName} to ${toBranch.businessName}` // Store notes if schema allows or rely on type
    });

    return { success: true, fromBranch: fromBranch.businessName, toBranch: toBranch.businessName };
  }
};
