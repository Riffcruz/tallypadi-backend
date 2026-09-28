import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { Transaction } from '../models/transaction.model';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { buildMarketplaceProductSeo } from '../services/marketplaceSeo.service';
import { StockTransfer } from '../models/stockTransfer.model';

// --- Helpers ---
const getAuthUser = async (req: Request) => {
    const userId = (req as any).user?.id || (req as any).user?._id || (req as any).userId;
    if (!userId) return null;
    return await User.findById(userId);
};

const cleanBranchText = (value: unknown, maxLength = 120) =>
    String(value || '')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);

const generateWarehousePhone = (hqId: unknown) => {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `WH${String(hqId).slice(-8).toUpperCase()}${Date.now().toString(36).toUpperCase()}${suffix}`;
};

const getCreateBranchError = (error: any) => {
    if (error?.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'value';
        if (duplicateField === 'phoneNumber') return 'That phone number is already registered.';
        if (duplicateField === 'email') return 'That email is already registered.';
        if (duplicateField === 'shopSlug') return 'That shop link is already taken.';
        return `Duplicate ${duplicateField}.`;
    }

    if (error?.name === 'ValidationError') {
        const messages = Object.values(error.errors || {})
            .map((item: any) => item?.message)
            .filter(Boolean);
        return messages[0] || 'Invalid branch details.';
    }

    return 'Server Error';
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
            .select('businessName name phoneNumber city address shopSlug lastSeen subscriptionStatus branchType')
            .lean();

        return res.json({ branches });
    } catch (error) {
        console.error('HQ Get Branches Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
};

// GET /hq/dashboard
// Aggregated stats across all branches
// GET /hq/dashboard
// Aggregated stats across all branches
export const getHqDashboard = async (req: Request, res: Response) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const isHq = user.role === 'HQ' || user.role === 'OWNER';
    const isHqManager = user.role === 'STAFF' && user.isHqManager;

    if (!isHq && !isHqManager) {
      return res.status(403).json({ error: 'Access denied. HQ privileges required.' });
    }

    const hqId = user.role === 'STAFF' ? user.ownerId : user._id;

    const branchDocs = await User.find({ hqId, role: 'OWNER' })
      .select('_id businessName')
      .lean();

    const branchIds = branchDocs.map((b) => b._id);

    if (branchIds.length === 0) {
      return res.json({
        overview: {
          totalRevenue: 0,
          totalSales: 0,
          todayRevenue: 0,
          todaySales: 0,
          activeBranches: 0,
        },
        recentNetworkSales: [],
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalStats, todayStats, recentSales] = await Promise.all([
      Transaction.aggregate([
        { $match: { user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true } } },
        { $group: { _id: null, revenue: { $sum: '$totalMoney' }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            user: { $in: branchIds },
            type: 'SALE',
            isUndone: { $ne: true },
            timestamp: { $gte: todayStart },
          },
        },
        { $group: { _id: null, revenue: { $sum: '$totalMoney' }, count: { $sum: 1 } } },
      ]),
      Transaction.find({ user: { $in: branchIds }, type: 'SALE', isUndone: { $ne: true } })
        .sort({ timestamp: -1 })
        .limit(10)
        .populate('user', 'businessName shopSlug')
        .lean(),
    ]);

    return res.json({
      overview: {
        totalRevenue: totalStats[0]?.revenue || 0,
        totalSales: totalStats[0]?.count || 0,
        todayRevenue: todayStats[0]?.revenue || 0,
        todaySales: todayStats[0]?.count || 0,
        activeBranches: branchIds.length,
      },
      recentNetworkSales: recentSales.map((t: any) => ({
        id: t._id,
        branchName: t.user?.businessName || 'Unknown Branch',
        amount: t.totalMoney,
        items: t.items?.map((i: any) => i.name).join(', '),
        date: t.timestamp,
      })),
    });
  } catch (error) {
    console.error('HQ Dashboard Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// POST /hq/transfer
// Move stock from Branch A to Branch B
export const transferStock = async (req: Request, res: Response) => {
    const session = await mongoose.startSession();
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

        const transferQuantity = Number(quantity);
        if (!fromBranchId || !toBranchId || !itemName || !Number.isSafeInteger(transferQuantity) || transferQuantity <= 0 || fromBranchId === toBranchId) {
            return res.status(400).json({ error: 'Invalid transfer details' });
        }

        // Verify ownership of branches
        const [fromBranch, toBranch] = await Promise.all([
            User.findOne({ _id: fromBranchId, $or: [{ _id: hqId }, { hqId }] }),
            User.findOne({ _id: toBranchId, $or: [{ _id: hqId }, { hqId }] })
        ]);

        if (!fromBranch || !toBranch) {
            return res.status(404).json({ error: 'One or both branches not found under your HQ.' });
        }

        // Find Item in Source
        const normalizedItemName = cleanBranchText(itemName, 200).toLowerCase();
        const sourceItem = await Inventory.findOne({ user: fromBranch._id, name: normalizedItemName, isDeleted: { $ne: true } });
        if (!sourceItem || sourceItem.quantity < transferQuantity) {
            return res.status(400).json({ error: `Insufficient stock of "${itemName}" in ${fromBranch.businessName}. Available: ${sourceItem?.quantity || 0}` });
        }
        await session.withTransaction(async () => {
            const updatedSource = await Inventory.findOneAndUpdate(
                { _id: sourceItem._id, quantity: { $gte: transferQuantity }, isDeleted: { $ne: true } },
                { $inc: { quantity: -transferQuantity } },
                { new: true, session }
            );
            if (!updatedSource) throw Object.assign(new Error('Stock changed before this transfer completed. Please try again.'), { status: 409 });

            const destItem = await Inventory.findOne({ user: toBranch._id, name: normalizedItemName, isDeleted: { $ne: true } }).session(session);
            if (destItem) {
                destItem.quantity += transferQuantity;
                destItem.marketplaceSeo = buildMarketplaceProductSeo(destItem, toBranch);
                await destItem.save({ session });
            } else {
                const newProduct = { user: toBranch._id, name: normalizedItemName, quantity: transferQuantity, lastUnitPrice: sourceItem.lastUnitPrice, costPrice: sourceItem.costPrice, category: sourceItem.category, image: sourceItem.image };
                await Inventory.create([{ ...newProduct, marketplaceSeo: buildMarketplaceProductSeo(newProduct, toBranch) }], { session });
            }

            const now = new Date();
            await Transaction.create([{
                user: hqId, type: 'TRANSFER', totalMoney: 0,
                items: [{ name: normalizedItemName, itemId: sourceItem._id, qty: transferQuantity, unit: '', unitPrice: sourceItem.lastUnitPrice, costPrice: sourceItem.costPrice, total: 0 }],
                timestamp: now, date: now.toISOString().split('T')[0],
                notes: `Transfer from ${fromBranch.businessName} to ${toBranch.businessName} by ${user.name}`
            }], { session });
            const reference = `TRF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
            await StockTransfer.create([{
                hq: hqId, reference, fromLocation: fromBranch._id, toLocation: toBranch._id,
                item: sourceItem._id, itemName: normalizedItemName, quantity: transferQuantity,
                status: 'RECEIVED', requestedBy: user._id, approvedBy: user._id,
                dispatchedBy: user._id, receivedBy: user._id, approvedAt: now,
                dispatchedAt: now, receivedAt: now,
                events: ['REQUESTED', 'APPROVED', 'DISPATCHED', 'RECEIVED'].map((action) => ({ action, actor: user._id, at: now })),
            }], { session });
        });

        return res.json({ success: true, message: `Transferred ${transferQuantity} ${itemName} from ${fromBranch.businessName} to ${toBranch.businessName}` });

    } catch (error: any) {
        console.error('HQ Transfer Error:', error);
        if (/Transaction numbers are only allowed|replica set|mongos/i.test(String(error?.message || ''))) {
            return res.status(503).json({ error: 'Safe stock transfers require MongoDB replica-set transactions. No stock was changed.' });
        }
        return res.status(error?.status || 500).json({ error: error?.status ? error.message : 'Server Error' });
    } finally {
        await session.endSession();
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

// POST /hq/branch
// Create a new Shop Branch or Warehouse under this HQ
export const createBranch = async (req: Request, res: Response) => {
    try {
        const { businessName, phoneNumber, password, branchType } = req.body;
        const user = await getAuthUser(req);

        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const isHq = user.role === 'HQ' || user.role === 'OWNER';
        const isHqManager = user.role === 'STAFF' && user.isHqManager;

        if (!isHq && !isHqManager) {
            return res.status(403).json({ error: 'Access denied. HQ privileges required.' });
        }

        const hqId = (user.role === 'STAFF') ? user.ownerId : user._id;
        if (!hqId) {
            return res.status(400).json({ error: 'HQ owner could not be resolved for this account.' });
        }

        const cleanBusinessName = cleanBranchText(businessName);
        if (!cleanBusinessName) {
            return res.status(400).json({ error: 'Business name is required' });
        }

        const type = branchType === 'WAREHOUSE' ? 'WAREHOUSE' : 'SHOP';
        
        let finalPhoneNumber = cleanBranchText(phoneNumber, 80);
        if (type === 'WAREHOUSE' && !finalPhoneNumber) {
            finalPhoneNumber = generateWarehousePhone(hqId);
        } else if (!finalPhoneNumber) {
            return res.status(400).json({ error: 'Phone number is required for Shop Branches' });
        }

        // Check if phone number already exists
        const existingUser = await User.findOne({ phoneNumber: finalPhoneNumber });
        if (existingUser) {
            return res.status(400).json({ error: 'Phone number is already registered' });
        }

        const cleanPassword = String(password || '').trim();
        let hashedPassword: string | undefined;
        if (cleanPassword) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(cleanPassword, salt);
        } else if (type === 'SHOP') {
            return res.status(400).json({ error: 'Password is required for Shop Branches' });
        }

        const newBranch = new User({
            phoneNumber: finalPhoneNumber,
            ...(hashedPassword ? { password: hashedPassword } : {}),
            businessName: cleanBusinessName,
            name: `${cleanBusinessName} Manager`,
            role: 'OWNER',
            hqId: hqId,
            branchType: type,
            registrationStage: 'COMPLETED',
            countryCode: user.countryCode || 'NG',
            currencyCode: user.settings?.currencyCode,
            settings: user.settings // inherit hq settings broadly
        });

        await newBranch.save();

        return res.status(201).json({
            success: true,
            message: `${type === 'WAREHOUSE' ? 'Warehouse' : 'Shop Branch'} created successfully.`,
            branch: {
                id: newBranch._id,
                businessName: newBranch.businessName,
                phoneNumber: newBranch.phoneNumber,
                branchType: newBranch.branchType
            }
        });

    } catch (error) {
        console.error('HQ Create Branch/Warehouse Error:', error);
        const err = error as any;
        const message = getCreateBranchError(err);
        const status = err?.code === 11000 ? 409 : err?.name === 'ValidationError' ? 400 : 500;
        return res.status(status).json({ error: message });
    }
};
