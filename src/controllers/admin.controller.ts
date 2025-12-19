import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { AdminSettings } from '../models/adminSettings.model';
import { DailyStats } from '../models/dailyStats.model';
import { ProcessedMessage } from '../models/processedMessage.model';
import { Debtor } from '../models/debtor.model';
import { sendWhatsAppText, sendWhatsAppTemplate } from '../services/whatsapp.service';

// --- ANALYTICS DASHBOARD ---
export const getSystemAnalytics = async (req: Request, res: Response) => {
  try {
    const { range } = req.query; // 'day', 'week', 'month'

    // Date Logic
    const now = new Date();
    let startDate = new Date();
    if (range === 'week') startDate.setDate(now.getDate() - 7);
    else if (range === 'month') startDate.setMonth(now.getMonth() - 1);
    else startDate.setHours(0, 0, 0, 0);

    // 1. User Stats (Filtered by Active/Trial for Plans)
    const activeFilter = { subscriptionStatus: { $in: ['active', 'trial'] }, role: 'OWNER' };

    const totalUsers = await User.countDocuments({ role: 'OWNER' }); // All registered
    const tycoonUsers = await User.countDocuments({ ...activeFilter, planType: 'TYCOON' });
    const ogaBossUsers = await User.countDocuments({ ...activeFilter, planType: 'OGA_BOSS' });

    const activeUsers24h = await User.countDocuments({
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    // 2. Financial Stats (GMV)
    const salesAgg = await Transaction.aggregate([
      { $match: { type: 'SALE' } },
      { $group: { _id: null, total: { $sum: '$totalMoney' }, count: { $sum: 1 } } },
    ]);
    const gmv = salesAgg[0]?.total || 0;
    const txCount = salesAgg[0]?.count || 0;

    // 3. Graph Data
    const graphData = await Transaction.aggregate([
      { $match: { type: 'SALE', timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          sales: { $sum: '$totalMoney' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formattedGraph = graphData.map((item) => ({
      date: item._id,
      sales: item.sales,
    }));

    res.json({
      users: { total: totalUsers, tycoon: tycoonUsers, ogaBoss: ogaBossUsers, active24h: activeUsers24h },
      financials: { gmv, txCount },
      graph: formattedGraph,
    });
  } catch (error) {
    console.error('Admin Analytics Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};

// --- USER MANAGEMENT ---
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { limit = 50, search } = req.query;
    const query: any = { role: 'OWNER' };

    if (search) {
      query.$or = [
        { phoneNumber: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 }).limit(Number(limit));

    const usersWithStats = await Promise.all(
      users.map(async (u) => {
        const salesAgg = await Transaction.aggregate([
          { $match: { user: u._id, type: 'SALE' } },
          { $group: { _id: null, total: { $sum: '$totalMoney' } } },
        ]);
        return {
          id: u._id,
          businessName: u.businessName,
          phone: u.phoneNumber,
          plan: u.planType,
          status: u.subscriptionStatus,
          joinedAt: u.createdAt,
          lifetimeSales: salesAgg[0]?.total || 0,
          lastMessages: (u.messageHistory || []).slice(-3),
        };
      })
    );

    res.json(usersWithStats);
  } catch (error) {
    res.status(500).json({ error: 'Fetch Users Error' });
  }
};

export const getUserDeepDive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const staff = await User.find({ ownerId: user._id });
    const inventory = await Inventory.find({ user: user._id }).limit(100);
    const recentSales = await Transaction.find({ user: user._id, type: 'SALE', isUndone: false })
      .sort({ timestamp: -1 })
      .limit(100);

    res.json({
      profile: user,
      staff,
      inventory,
      recentSales,
      lastMessages: user.messageHistory?.slice(-10) || [],
    });
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
};

export const manageUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, payload } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Determine ownerId (supports if admin accidentally opens staff)
    const ownerId = user.role === 'OWNER' ? user._id : user.ownerId;
    if (!ownerId) return res.status(400).json({ error: 'OwnerId not found for this user' });

    // Staff IDs under owner (needed to wipe staff sales too)
    const staffIds: any[] = await User.find({ ownerId, role: 'STAFF' }).distinct('_id');
    const allUserIds = [ownerId, ...staffIds];

    // ✅ 1) SEND INDIVIDUAL MESSAGE (User or Staff)
    if (action === 'send_message') {
      const to = String(payload?.to || '').trim();
      const message = String(payload?.message || '').trim();

      if (!to || !message) {
        return res.status(400).json({ error: "Missing 'to' or 'message'" });
      }

      await sendWhatsAppText(to, message);
      return res.json({ success: true, message: `Message queued to ${to}` });
    }

    // ✅ 2) CLEAR MESSAGE HISTORY ONLY (keeps account + sales)
    if (action === 'clear_history') {
      await User.updateOne({ _id: ownerId }, { $set: { messageHistory: [] } });
      return res.json({ success: true, message: 'User message history cleared' });
    }

    // ✅ 3) DELETE SALES HISTORY ONLY (owner + staff sales)
    if (action === 'delete_sales_history') {
      const r = await Transaction.deleteMany({
        user: { $in: allUserIds },
        type: 'SALE',
      });

      // optional: reset daily stats too (if you want sales chart to drop)
      await DailyStats.deleteMany({ user: ownerId });

      return res.json({
        success: true,
        message: 'Sales history deleted',
        deletedSales: r.deletedCount || 0,
      });
    }

    // ✅ 4) DELETE USER + HISTORY (owner + staff + all data)
    if (action === 'delete_user') {
      const deleteHistory = payload?.deleteHistory !== false; // default true

      // delete staff accounts
      await User.deleteMany({ ownerId, role: 'STAFF' });

      if (deleteHistory) {
        // delete ALL transactions (not just owner)
        await Transaction.deleteMany({ user: { $in: allUserIds } });

        await Inventory.deleteMany({ user: ownerId });
        await DailyStats.deleteMany({ user: ownerId });
        await Debtor.deleteMany({ user: ownerId });
        await ProcessedMessage.deleteMany({ user: { $in: allUserIds } });
      }

      // delete owner last
      await User.deleteOne({ _id: ownerId });

      return res.json({ success: true, message: 'User and history deleted' });
    }

    // ✅ EXISTING ACTIONS (subscription)
    const owner = await User.findById(ownerId);
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    if (action === 'suspend') owner.subscriptionStatus = 'suspended';
    else if (action === 'unsuspend' || action === 'activate') owner.subscriptionStatus = 'active';
    else if (action === 'cancel') owner.subscriptionStatus = 'cancelled';
    else if (action === 'change_plan') {
      if (payload?.planType) owner.planType = payload.planType;
    } else if (action === 'set_expiry') {
      if (payload?.date) {
        const newDate = new Date(payload.date);
        owner.trialEndsAt = newDate;
        owner.nextBillingDate = newDate;
        if (newDate < new Date()) owner.subscriptionStatus = 'cancelled';
      }
    }

    await owner.save();
    return res.json({ success: true, message: `User updated: ${action}`, user: owner });
  } catch (error) {
    console.error('Update User Error:', error);
    return res.status(500).json({ error: 'Update User Error' });
  }
};


// --- GLOBAL SETTINGS ---
export const getGlobalSettings = async (req: Request, res: Response) => {
  try {
    let settings = await AdminSettings.findOne();
    if (!settings) settings = await AdminSettings.create({});
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

export const updateGlobalSettings = async (req: Request, res: Response) => {
  try {
    const { autoSuspendOnJailbreak, maxMessageHistory, maxStaffAccounts, whatsappUrl } = req.body;

    const updatePayload: any = {};

    if (whatsappUrl !== undefined) {
      updatePayload['whatsappUrl'] = typeof whatsappUrl === 'string' ? whatsappUrl.trim() : whatsappUrl;
    }

    if (autoSuspendOnJailbreak !== undefined) {
      updatePayload['security.autoSuspendOnJailbreak'] = autoSuspendOnJailbreak;
    }
    if (maxMessageHistory !== undefined) {
      updatePayload['limits.maxMessageHistory'] = maxMessageHistory;
    }
    if (maxStaffAccounts !== undefined) {
      updatePayload['limits.maxStaffAccounts'] = maxStaffAccounts;
    }

    const settings = await AdminSettings.findOneAndUpdate({}, { $set: updatePayload }, { new: true, upsert: true });
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

// --- BROADCAST ---
export const broadcastMessage = async (req: Request, res: Response) => {
  try {
    const { target, message } = req.body;

    let query: any = { role: 'OWNER' };
    if (target === 'tycoon') query.planType = 'TYCOON';
    if (target === 'oga_boss') query.planType = 'OGA_BOSS';
    if (target === 'active_24h') {
      query.updatedAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    }

    const recipients = await User.find(query).select('phoneNumber');

    (async () => {
      for (const u of recipients) {
        try {
          await sendWhatsAppText(u.phoneNumber, message);
          await new Promise((r) => setTimeout(r, 100));
        } catch (e) {
          console.error(`Failed to msg ${u.phoneNumber}`);
        }
      }
    })();

    res.json({ success: true, message: `Broadcast queued for ${recipients.length} users` });
  } catch (error) {
    res.status(500).json({ error: 'Broadcast Error' });
  }
};

export const adminAddStaff = async (req: Request, res: Response) => {
  try {
    const { ownerId } = req.params;
    const { phoneNumber } = req.body;
    const owner = await User.findById(ownerId);
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    const newStaff = await User.create({
      phoneNumber,
      role: 'STAFF',
      ownerId: owner._id,
      planType: owner.planType,
      registrationStage: 'COMPLETED',
      businessName: owner.businessName,
      settings: owner.settings,
    });

    try {
      await sendWhatsAppText(phoneNumber, `🔔 Admin has added you to ${owner.businessName}.`);
    } catch (e) {}

    res.json({ success: true, staff: newStaff });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add staff' });
  }
};
