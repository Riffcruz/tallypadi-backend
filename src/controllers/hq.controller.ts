import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import { Types } from 'mongoose';

// --- Helpers ---
const getAuthUser = async (req: Request) => {
    const userId = (req as any).user?.id || (req as any).user?._id || (req as any).userId;
    if (!userId) return null;
    return await User.findById(userId);
};

// GET /hq/branches
// List all branches (Owners) linked to this HQ
export const getBranches = async (req: Request, res: Response) => {
    try {
        const hqUser = await getAuthUser(req);
        if (!hqUser || hqUser.role !== 'HQ') {
            return res.status(403).json({ error: 'Access denied. HQ account required.' });
        }

        const branches = await User.find({ hqId: hqUser._id, role: 'OWNER' })
            .select('businessName name phoneNumber city address shopSlug lastSeen subscriptionStatus')
            .lean();

        return res.json({ branches });
    } catch (error) {
        console.error('HQ Get Branches Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
};

// GET /hq/dashboard
// Aggregated stats across all branches
export const getHqDashboardData = async (req: Request, res: Response) => {
    try {
        const hqUser = await getAuthUser(req);
        if (!hqUser || hqUser.role !== 'HQ') {
            return res.status(403).json({ error: 'Access denied. HQ account required.' });
        }

        const branchDocs = await User.find({ hqId: hqUser._id, role: 'OWNER' }).select('_id businessName').lean();
        const branchIds = branchDocs.map(b => b._id);

        if (branchIds.length === 0) {
            return res.json({
                totalRevenue: 0,
                totalSalesCount: 0,
                activeBranches: 0,
                topPerformingBranch: null,
                recentSales: []
            });
        }

        // 1. Total Revenue & Sales Count (Today or All Time? Let's do All Time for "God View" summary, or maybe Last 30 Days?)
        // Let's do "All Time" for now or match typical dashboard "Today" vs "Total". 
        // The prompt says "real-time aggregated sales", implying Today or current period.
        // But typical "God View" shows totals. Let's return Total Revenue + Today's Revenue.

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [totalStats, todayStats, recentSales] = await Promise.all([
            // Total Revenue
            Transaction.aggregate([
                { $match: { user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true } } },
                { $group: { _id: null, revenue: { $sum: '$totalMoney' }, count: { $sum: 1 } } }
            ]),
            // Today's Stats
            Transaction.aggregate([
                { $match: { user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true }, timestamp: { $gte: todayStart } } },
                { $group: { _id: null, revenue: { $sum: '$totalMoney' }, count: { $sum: 1 } } }
            ]),
            // Recent Sales (across network)
            Transaction.find({ user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true } })
                .sort({ timestamp: -1 })
                .limit(10)
                .populate('user', 'businessName shopSlug') // To show which branch made the sale
                .lean()
        ]);

        return res.json({
            overview: {
                totalRevenue: totalStats[0]?.revenue || 0,
                totalSales: totalStats[0]?.count || 0,
                todayRevenue: todayStats[0]?.revenue || 0,
                todaySales: todayStats[0]?.count || 0,
                activeBranches: branchIds.length
            },
            recentNetworkSales: recentSales.map((t: any) => ({
                id: t._id,
                branchName: t.user?.businessName || 'Unknown Branch',
                amount: t.totalMoney,
                items: t.items?.map((i: any) => i.name).join(', '),
                date: t.timestamp
            }))
        });

    } catch (error) {
        console.error('HQ Dashboard Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
};

// POST /hq/transfer
// Move stock from Branch A to Branch B
export const transferStock = async (req: Request, res: Response) => {
    try {
        const { fromBranchId, toBranchId, itemName, quantity } = req.body;
        const hqUser = await getAuthUser(req);

        if (!hqUser || hqUser.role !== 'HQ') {
            return res.status(403).json({ error: 'Access denied. HQ account required.' });
        }

        if (!fromBranchId || !toBranchId || !itemName || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Invalid transfer details' });
        }

        // Verify ownership of branches
        const [fromBranch, toBranch] = await Promise.all([
            User.findOne({ _id: fromBranchId, hqId: hqUser._id }),
            User.findOne({ _id: toBranchId, hqId: hqUser._id })
        ]);

        if (!fromBranch || !toBranch) {
            return res.status(404).json({ error: 'One or both branches not found under your HQ.' });
        }

        // Find Item in Source
        const sourceItem = await Inventory.findOne({ user: fromBranch._id, name: itemName.toLowerCase() });
        if (!sourceItem || sourceItem.quantity < quantity) {
            return res.status(400).json({ error: `Insufficient stock of "${itemName}" in ${fromBranch.businessName}. Available: ${sourceItem?.quantity || 0}` });
        }

        // Decrement Source
        sourceItem.quantity -= quantity;
        await sourceItem.save();

        // Increment/Create Dest
        let destItem = await Inventory.findOne({ user: toBranch._id, name: itemName.toLowerCase() });
        if (destItem) {
            destItem.quantity += quantity;
            // Optionally average cost price? Keeping it simple for now.
            await destItem.save();
        } else {
            // Create new item in dest branch
            // Copy properties from source
            await Inventory.create({
                user: toBranch._id,
                name: itemName.toLowerCase(),
                quantity: quantity,
                lastUnitPrice: sourceItem.lastUnitPrice,
                costPrice: sourceItem.costPrice,
                category: sourceItem.category,
                image: sourceItem.image
            });
        }

        // Log Transfer Transaction? (Ideally yes, but keeping it simple for MVP)
        // Creating a 'TRANSFER' transaction record would be good for audit trails.
        
        await Transaction.create({
            user: hqUser._id, // Logged under HQ? Or Create 2 transactions one for each user?
            // Let's create a special transaction for audit
            type: 'TRANSFER',
            totalMoney: 0,
            items: [{ name: itemName, qty: quantity, unitPrice: sourceItem.lastUnitPrice }],
            timestamp: new Date(),
            notes: `Transfer from ${fromBranch.businessName} to ${toBranch.businessName}`
        });

        return res.json({ success: true, message: `Transferred ${quantity} ${itemName} from ${fromBranch.businessName} to ${toBranch.businessName}` });

    } catch (error) {
        console.error('HQ Transfer Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
