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
        const user = await getAuthUser(req);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const isHq = user.role === 'HQ' || user.role === 'OWNER';
        const isHqManager = user.role === 'STAFF' && user.isHqManager;

        if (!isHq && !isHqManager) {
            return res.status(403).json({ error: 'Access denied. HQ privileges required.' });
        }

        const hqId = (user.role === 'STAFF') ? user.ownerId : user._id;

        const branches = await User.find({ hqId: hqId, role: 'OWNER' })
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
        const user = await getAuthUser(req);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const isHq = user.role === 'HQ' || user.role === 'OWNER';
        const isHqManager = user.role === 'STAFF' && user.isHqManager;

        if (!isHq && !isHqManager) {
            return res.status(403).json({ error: 'Access denied. HQ privileges required.' });
        }

        const hqId = (user.role === 'STAFF') ? user.ownerId : user._id;

        const branchDocs = await User.find({ hqId: hqId, role: 'OWNER' }).select('_id businessName').lean();
        const branchIds = branchDocs.map(b => b._id);

        if (branchIds.length === 0) {
            return res.json({
                overview: {
                    totalRevenue: 0,
                    totalSales: 0,
                    todayRevenue: 0,
                    todaySales: 0,
                    activeBranches: 0
                },
                recentNetworkSales: []
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
        const user = await getAuthUser(req);

        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const isHq = user.role === 'HQ' || user.role === 'OWNER';
        const isHqManager = user.role === 'STAFF' && user.isHqManager;

        if (!isHq && !isHqManager) {
            return res.status(403).json({ error: 'Access denied. HQ privileges required.' });
        }

        const hqId = (user.role === 'STAFF') ? user.ownerId : user._id;

        if (!fromBranchId || !toBranchId || !itemName || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Invalid transfer details' });
        }

        // Verify ownership of branches
        const [fromBranch, toBranch] = await Promise.all([
            User.findOne({ _id: fromBranchId, hqId: hqId }),
            User.findOne({ _id: toBranchId, hqId: hqId })
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
            user: hqId, // Logged under HQ
            // Let's create a special transaction for audit
            type: 'TRANSFER',
            totalMoney: 0,
            items: [{ name: itemName, qty: quantity, unitPrice: sourceItem.lastUnitPrice }],
            timestamp: new Date(),
            date: new Date().toISOString().split('T')[0],
            notes: `Transfer from ${fromBranch.businessName} to ${toBranch.businessName} by ${user.name}`
        });

        return res.json({ success: true, message: `Transferred ${quantity} ${itemName} from ${fromBranch.businessName} to ${toBranch.businessName}` });

    } catch (error) {
        console.error('HQ Transfer Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
};

// POST /hq/staff/promote
// Grant HQ Management privileges to a staff member
export const promoteToHqManager = async (req: Request, res: Response) => {
    try {
        const { staffId } = req.body;
        const user = await getAuthUser(req);

        if (!user || (user.role !== 'HQ' && user.role !== 'OWNER')) {
            return res.status(403).json({ error: 'Access denied. Only the HQ Owner can promote staff.' });
        }

        if (!staffId) {
            return res.status(400).json({ error: 'Staff ID is required' });
        }

        // Find the staff member
        // Ensure they are owned by this HQ (assuming HQ acts as the Owner for these staff)
        const staff = await User.findOne({ _id: staffId, ownerId: user._id, role: 'STAFF' });

        if (!staff) {
            return res.status(404).json({ error: 'Staff member not found or does not belong to you.' });
        }

        // Update
        staff.isHqManager = true;
        await staff.save();

        return res.json({ 
            success: true, 
            message: `${staff.name} has been promoted to HQ Manager.`,
            staff: {
                id: staff._id,
                name: staff.name,
                isHqManager: true
            }
        });

    } catch (error) {
        console.error('HQ Promote Staff Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
