import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { AdminSettings } from '../models/adminSettings.model';
import { EmailTemplate } from '../models/emailTemplate.model';
import { sendBroadcastEmail } from '../services/email.service';
import { DailyStats } from '../models/dailyStats.model';
import { ProcessedMessage } from '../models/processedMessage.model';
import { Debtor } from '../models/debtor.model';

import { sendWhatsAppText, sendWhatsAppMediaById } from '../services/whatsapp.service';
import { executeGlobalPushNotification } from '../services/push.service';

import bcrypt from 'bcryptjs';

// -------------------------
// Helpers
// -------------------------
const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

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

// -------------------------
// Zod Schemas
// -------------------------
const analyticsQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month']).optional(),
});

const getAllUsersQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
});

const updateGlobalSettingsSchema = z
  .object({
    autoSuspendOnJailbreak: z.boolean().optional(),
    maxMessageHistory: z.coerce.number().int().min(0).max(5000).optional(),
    maxStaffAccounts: z.coerce.number().int().min(0).max(100).optional(),
    whatsappUrl: z.string().trim().max(300).optional(),
    smtp: z.object({
        host: z.string().trim().optional().default(''),
        port: z.coerce.number().optional().default(465),
        user: z.string().trim().optional().default(''),
        pass: z.string().trim().optional().default(''),
        fromAddress: z.string().trim().optional().default('notifications@tallypadi.com'),
        secure: z.boolean().optional().default(true)
    }).optional()
  })
  .strict();

const broadcastSchema = z
  .object({
    target: z.enum(['all', 'tycoon', 'oga_boss', 'active_24h', 'trial', 'past_due', 'particular_user']).default('all'),
    message: z.string().trim().optional(),
    mediaId: z.string().trim().optional(),
    mediaType: z.enum(['image', 'video', 'document', 'audio']).optional(),
    sendPush: z.boolean().optional().default(false),
    sendWhatsapp: z.boolean().optional().default(true),
    sendEmail: z.boolean().optional().default(false),
    emailTemplateId: z.string().trim().optional(),
    emailDelayMs: z.coerce.number().optional().default(150),
    specificIdentifier: z.string().trim().optional(), // For specific user test
  })
  .strict();

const manageUserSchema = z
  .object({
    action: z.enum([
      'send_message',
      'clear_history',
      'delete_sales_history',
      'delete_user',
      'suspend',
      'unsuspend',
      'activate',
      'cancel',
      'change_plan',
      'set_expiry',
      'update_phone',
      'update_email',
    ]),
    payload: z.any().optional(),
  })
  .strict();

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .refine((v) => /^[+]?[\d\s()-]+$/.test(v), 'Invalid phone number format');

const adminAddStaffSchema = z
  .object({
    phoneNumber: phoneSchema,
    name: z.string().trim().max(50).optional(),
  })
  .strict();

const createInvestorSchema = z
  .object({
    phoneNumber: phoneSchema,
    name: z.string().trim().max(50).optional(),
    password: z.string().min(6),
    email: z.string().email().optional(),
  })
  .strict();

const changePlanSchema = z.object({
  planType: z.enum(['TYCOON', 'OGA_BOSS']),
});

const setExpirySchema = z.object({
  date: z.string().trim().min(1),
});

const updatePhoneSchema = z.object({
  phone: phoneSchema,
});

const updateEmailSchema = z.object({
  email: z.string().email(),
});

const deleteUserPayloadSchema = z.object({
  deleteHistory: z.boolean().optional(),
});

const sendMessagePayloadSchema = z.object({
  to: phoneSchema,
  message: z.string().trim().min(1).max(1500),
});

// -------------------------
// ANALYTICS
// GET /api/admin/analytics
// -------------------------
export const getSystemAnalytics = async (req: Request, res: Response) => {
  try {
    const parsedQ = analyticsQuerySchema.safeParse(req.query);
    if (!parsedQ.success) return res.status(400).json({ error: parsedQ.error.flatten() });

    const range = parsedQ.data.range || 'day';

    const now = new Date();
    const startDate = new Date(now);
    if (range === 'week') startDate.setDate(now.getDate() - 7);
    else if (range === 'month') startDate.setMonth(now.getMonth() - 1);
    else startDate.setHours(0, 0, 0, 0);

    const activeFilter = { subscriptionStatus: { $in: ['active', 'trial'] }, role: 'OWNER' };

    const [totalUsers, tycoonUsers, ogaBossUsers, activeUsers24h] = await Promise.all([
      User.countDocuments({ role: 'OWNER' }),
      User.countDocuments({ ...activeFilter, planType: 'TYCOON' }),
      User.countDocuments({ ...activeFilter, planType: 'OGA_BOSS' }),
      User.countDocuments({ updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    ]);

    // NOTE: original GMV was lifetime; I’m making it RANGE-BASED to match the graph.
    const salesAgg = await Transaction.aggregate([
      { $match: { type: 'SALE', timestamp: { $gte: startDate }, ...validSaleMatch } },
      { $group: { _id: null, total: { $sum: '$totalMoney' }, count: { $sum: 1 } } },
    ]);

    const gmv = salesAgg[0]?.total || 0;
    const txCount = salesAgg[0]?.count || 0;

    const graphData = await Transaction.aggregate([
      { $match: { type: 'SALE', timestamp: { $gte: startDate }, ...validSaleMatch } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          sales: { $sum: '$totalMoney' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      users: { total: totalUsers, tycoon: tycoonUsers, ogaBoss: ogaBossUsers, active24h: activeUsers24h },
      financials: { gmv, txCount, range, startDate: startDate.toISOString() },
      graph: graphData.map((x) => ({ date: x._id, sales: x.sales })),
    });
  } catch (error) {
    console.error('Admin Analytics Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};

// -------------------------
// INVESTORS
// POST /api/admin/investors
// -------------------------
export const createInvestor = async (req: Request, res: Response) => {
  try {
    const parsed = createInvestorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { phoneNumber, name, password, email } = parsed.data;

    const existing = await User.findOne({ 
      $or: [
        { phoneNumber },
        ...(email ? [{ email }] : [])
      ]
    });
    if (existing) return res.status(409).json({ error: 'User with this phone or email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const investor = await User.create({
      phoneNumber,
      email,
      password: hashedPassword,
      name: name || 'Investor',
      role: 'INVESTOR',
      registrationStage: 'COMPLETED',
      subscriptionStatus: 'active',
      // Default other fields
      planType: 'TYCOON', 
      businessName: 'Investor Account',
    });

    res.json({ success: true, message: 'Investor account created', investor: { id: investor._id, phoneNumber, name } });
  } catch (error) {
    console.error('Create Investor Error:', error);
    res.status(500).json({ error: 'Create Investor Error' });
  }
};

// GET /api/admin/investors
export const getInvestors = async (req: Request, res: Response) => {
  try {
    const investors = await User.find({ role: 'INVESTOR' })
      .select('name phoneNumber email lastLogin createdAt')
      .sort({ createdAt: -1 });

    res.json(investors);
  } catch (error) {
    console.error('Get Investors Error:', error);
    res.status(500).json({ error: 'Get Investors Error' });
  }
};

// DELETE /api/admin/investors/:id
export const deleteInvestor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const investor = await User.findOne({ _id: id, role: 'INVESTOR' });
    if (!investor) return res.status(404).json({ error: 'Investor not found' });

    await User.deleteOne({ _id: id });

    res.json({ success: true, message: 'Investor deleted' });
  } catch (error) {
    console.error('Delete Investor Error:', error);
    res.status(500).json({ error: 'Delete Investor Error' });
  }
};


// -------------------------
// USERS
// GET /api/admin/users
// -------------------------
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const parsed = getAllUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { search } = parsed.data;

    const match: any = { role: 'OWNER' };
    if (search) {
      match.$or = [
        { phoneNumber: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } },
      ];
    }

    // Avoid N+1: aggregate sales totals in one go
    const rows = await User.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'transactions',
          let: { ownerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$user', '$$ownerId'] },
                type: 'SALE',
                ...validSaleMatch,
              },
            },
            { $group: { _id: null, total: { $sum: '$totalMoney' } } },
          ],
          as: 'salesAgg',
        },
      },
      {
        $addFields: {
          lifetimeSales: { $ifNull: [{ $arrayElemAt: ['$salesAgg.total', 0] }, 0] },
        },
      },
      {
        $project: {
          id: '$_id',
          businessName: 1,
          email: 1,
          phone: '$phoneNumber',
          plan: '$planType',
          status: '$subscriptionStatus',
          joinedAt: '$createdAt',
          lifetimeSales: 1,
          lastMessages: { $slice: ['$messageHistory', -3] },
        },
      },
    ]);

    res.json(rows);
  } catch (error) {
    console.error('Fetch Users Error:', error);
    res.status(500).json({ error: 'Fetch Users Error' });
  }
};

// GET /api/admin/users/:id/details
export const getUserDeepDive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ownerId = user.role === 'OWNER' ? user._id : user.ownerId;
    if (!ownerId) return res.status(400).json({ error: 'OwnerId not found' });

    // Find all users linked to this owner, EXCLUDING the owner themselves
    const staff = await User.find({ ownerId, _id: { $ne: ownerId } });
    const staffIds = staff.map((s) => s._id);
    const allUserIds = [ownerId, ...staffIds];

    const [inventory, recentSales, owner] = await Promise.all([
      Inventory.find({ user: ownerId }).sort({ createdAt: -1 }).lean(),
      Transaction.find({ user: { $in: allUserIds }, type: 'SALE', ...validSaleMatch })
        .sort({ timestamp: -1 })
        .limit(100),
      User.findById(ownerId),
    ]);

    res.json({
      profile: owner,
      staff,
      inventory,
      recentSales,
      lastMessages: owner?.messageHistory?.slice(-10) || [],
    });
  } catch (error) {
    console.error('getUserDeepDive error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};

// PUT /api/admin/users/:id
export const manageUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });

    const parsed = manageUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { action, payload } = parsed.data;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ownerId = user.role === 'OWNER' ? user._id : user.ownerId;
    if (!ownerId) return res.status(400).json({ error: 'OwnerId not found' });

    const staffIds = await User.find({ ownerId, role: 'STAFF' }).distinct('_id');
    const allUserIds = [ownerId, ...staffIds];

    if (action === 'send_message') {
      const p = sendMessagePayloadSchema.safeParse(payload || {});
      if (!p.success) return res.status(400).json({ error: p.error.flatten() });

      await sendWhatsAppText(p.data.to, p.data.message);
      return res.json({ success: true, message: `Message sent to ${p.data.to}` });
    }

    if (action === 'clear_history') {
      await User.updateOne({ _id: ownerId }, { $set: { messageHistory: [] } });
      return res.json({ success: true, message: 'Message history cleared' });
    }

    if (action === 'delete_sales_history') {
      const r = await Transaction.deleteMany({ user: { $in: allUserIds }, type: 'SALE' });
      return res.json({ success: true, message: 'Sales history deleted', deleted: r.deletedCount || 0 });
    }

    if (action === 'delete_user') {
      const p = deleteUserPayloadSchema.safeParse(payload || {});
      if (!p.success) return res.status(400).json({ error: p.error.flatten() });

      const deleteHistory = p.data.deleteHistory !== false;

      await User.deleteMany({ ownerId, role: 'STAFF' });

      if (deleteHistory) {
        await Promise.all([
          Transaction.deleteMany({ user: { $in: allUserIds } }),
          Inventory.deleteMany({ user: ownerId }),
          DailyStats.deleteMany({ user: ownerId }),
          ProcessedMessage.deleteMany({ user: { $in: allUserIds } }),
          Debtor.deleteMany({ user: ownerId }),
        ]);
      }

      await User.deleteOne({ _id: ownerId });
      return res.json({ success: true, message: 'User + history deleted' });
    }

    const owner = await User.findById(ownerId);
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    if (action === 'suspend') owner.subscriptionStatus = 'suspended';
    else if (action === 'unsuspend' || action === 'activate') owner.subscriptionStatus = 'active';
    else if (action === 'cancel') owner.subscriptionStatus = 'cancelled';
    else if (action === 'change_plan') {
      const p = changePlanSchema.safeParse(payload || {});
      if (!p.success) return res.status(400).json({ error: p.error.flatten() });
      owner.planType = p.data.planType;
    } else if (action === 'set_expiry') {
      const p = setExpirySchema.safeParse(payload || {});
      if (!p.success) return res.status(400).json({ error: p.error.flatten() });

      const newDate = new Date(p.data.date);
      if (!Number.isFinite(newDate.getTime())) return res.status(400).json({ error: 'Invalid date' });

      owner.trialEndsAt = newDate;
      owner.nextBillingDate = newDate;
      if (newDate < new Date()) owner.subscriptionStatus = 'cancelled';
    } else if (action === 'update_phone') {
      const p = updatePhoneSchema.safeParse(payload || {});
      if (!p.success) return res.status(400).json({ error: p.error.flatten() });

      const existing = await User.findOne({ phoneNumber: p.data.phone });
      if (existing && existing._id.toString() !== ownerId.toString()) {
        return res.status(409).json({ error: 'Phone number already in use' });
      }
      owner.phoneNumber = p.data.phone;
    } else if (action === 'update_email') {
      const p = updateEmailSchema.safeParse(payload || {});
      if (!p.success) return res.status(400).json({ error: p.error.flatten() });

      const newEmail = p.data.email.trim().toLowerCase();
      const existing = await User.findOne({ email: newEmail });
      if (existing && existing._id.toString() !== ownerId.toString()) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      owner.email = newEmail;
    }

    await owner.save();
    return res.json({ success: true, message: `User updated: ${action}`, user: owner });
  } catch (error) {
    console.error('Update User Error:', error);
    res.status(500).json({ error: 'Update User Error' });
  }
};

// -------------------------
// SETTINGS
// GET/PUT /api/admin/settings
// -------------------------
export const getGlobalSettings = async (_req: Request, res: Response) => {
  try {
    let settings = await AdminSettings.findOne();
    if (!settings) settings = await AdminSettings.create({});
    res.json(settings);
  } catch (error) {
    console.error('Get Settings Error:', error);
    res.status(500).json({ error: 'Error' });
  }
};

export const updateGlobalSettings = async (req: Request, res: Response) => {
  try {
    const parsed = updateGlobalSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { autoSuspendOnJailbreak, maxMessageHistory, maxStaffAccounts, whatsappUrl, smtp } = parsed.data;

    const updatePayload: any = {};
    if (whatsappUrl !== undefined) updatePayload.whatsappUrl = whatsappUrl;
    if (autoSuspendOnJailbreak !== undefined) updatePayload['security.autoSuspendOnJailbreak'] = autoSuspendOnJailbreak;
    if (maxMessageHistory !== undefined) updatePayload['limits.maxMessageHistory'] = maxMessageHistory;
    if (maxStaffAccounts !== undefined) updatePayload['limits.maxStaffAccounts'] = maxStaffAccounts;
    if (smtp !== undefined) updatePayload.smtp = smtp;

    const settings = await AdminSettings.findOneAndUpdate({}, { $set: updatePayload }, { new: true, upsert: true });
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Update Settings Error:', error);
    res.status(500).json({ error: 'Error' });
  }
};

// -------------------------
// BROADCAST
// POST /api/admin/broadcast
// -------------------------
export const broadcastMessage = async (req: Request, res: Response) => {
  try {
    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { target, message, mediaId, mediaType, sendPush, sendWhatsapp, sendEmail, emailTemplateId, emailDelayMs, specificIdentifier } = parsed.data;

    // Build the Query
    const query: any = { role: 'OWNER' };
    if (target === 'tycoon') query.planType = 'TYCOON';
    else if (target === 'oga_boss') query.planType = 'OGA_BOSS';
    else if (target === 'active_24h') query.updatedAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    else if (target === 'trial') query.subscriptionStatus = 'trial';
    else if (target === 'past_due') query.subscriptionStatus = 'past_due';
    else if (target === 'particular_user' && specificIdentifier) {
       // Search by Phone or Email
       query.$or = [{ phoneNumber: specificIdentifier }, { email: specificIdentifier }];
       delete query.role; // allow targeting non-owners just in case
    }

    const recipients = await User.find(query).select('phoneNumber email businessName name').lean();
    if (!recipients.length) {
       return res.status(400).json({ error: 'No recipients matched the targeted filter.' });
    }

    // Prepare Email Template early to avoid repeated DB lookups
    let template: any = null;
    if (sendEmail) {
       if (!emailTemplateId) return res.status(400).json({ error: 'Email broadcasting requires an emailTemplateId' });
       template = await EmailTemplate.findById(emailTemplateId).lean();
       if (!template) return res.status(400).json({ error: 'The selected Email Template was not found.' });
    }

    // 1. Send PWA Push Notification Instantly (If requested)
    if (sendPush && message) {
      executeGlobalPushNotification({
        title: 'TallyPadi Update',
        body: message,
      }).catch(err => console.error('Failed to trigger global PWA broadcast:', err));
    }

    // Async Dispatch Loop
    (async () => {
      for (const u of recipients) {
        try {
          // Send WhatsApp
          if (sendWhatsapp && u.phoneNumber && message) {
            if (mediaId && mediaType) {
              await sendWhatsAppMediaById({
                to: u.phoneNumber,
                mediaId,
                type: mediaType as any,
                caption: message
              });
            } else {
              await sendWhatsAppText(u.phoneNumber, message);
            }
          }

          // Send Email
          if (sendEmail && u.email && template) {
             let personalizedSubject = template.subject
                 .replace(/##usershopname##/g, u.businessName || 'Your Shop')
                 .replace(/##phonenumber##/g, u.phoneNumber || '')
                 .replace(/##name##/g, u.name || 'Partner');

             let personalizedHtml = template.htmlBody
                 .replace(/##usershopname##/g, u.businessName || 'Your Shop')
                 .replace(/##phonenumber##/g, u.phoneNumber || '')
                 .replace(/##name##/g, u.name || 'Partner');

             await sendBroadcastEmail(u.email, personalizedSubject, personalizedHtml);
             
             // Throttle internally per email strictly
             if (emailDelayMs > 0) {
                 await new Promise(r => setTimeout(r, emailDelayMs));
             }
          }

          if (sendWhatsapp && !sendEmail) {
             // Default WhatsApp limit
             await new Promise((r) => setTimeout(r, 150));
          }

        } catch (e) {
          console.error(`Failed executing broadcast slice for ${u.phoneNumber || u.email}`);
        }
      }
    })();

    res.json({ success: true, message: `Broadcast queued to ${recipients.length} recipients.` });
  } catch (error) {
    console.error('Broadcast Error:', error);
    res.status(500).json({ error: 'Broadcast Error' });
  }
};

// -------------------------
// EMAIL TEMPLATES CRUD
// -------------------------
export const getEmailTemplates = async (req: Request, res: Response) => {
  try {
     const templates = await EmailTemplate.find().sort({ createdAt: -1 });
     res.json(templates);
  } catch (err) {
     res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

export const createEmailTemplate = async (req: Request, res: Response) => {
  try {
     const { title, subject, htmlBody } = req.body;
     if (!title || !subject || !htmlBody) return res.status(400).json({ error: 'Title, Subject, and HTML Body are required.' });
     const template = await EmailTemplate.create({ title, subject, htmlBody });
     res.status(201).json(template);
  } catch (err) {
     res.status(500).json({ error: 'Failed to create template' });
  }
};

export const deleteEmailTemplate = async (req: Request, res: Response) => {
  try {
     await EmailTemplate.findByIdAndDelete(req.params.id);
     res.json({ success: true });
  } catch (err) {
     res.status(500).json({ error: 'Failed to delete template' });
  }
};

// -------------------------
// STAFF
// POST /api/admin/users/:ownerId/staff
// -------------------------
export const adminAddStaff = async (req: Request, res: Response) => {
  try {
    const { ownerId } = req.params;
    if (typeof ownerId !== 'string' || !isValidObjectId(ownerId)) return res.status(400).json({ error: 'Invalid ownerId' });

    const parsed = adminAddStaffSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { phoneNumber, name } = parsed.data;

    const owner = await User.findById(ownerId);
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    const existing = await User.findOne({ phoneNumber });
    if (existing) return res.status(409).json({ error: 'Phone number already exists' });

    // Optional: enforce staff limit
    const settings = await AdminSettings.findOne().lean();
    const maxStaff = (settings as any)?.limits?.maxStaffAccounts;
    if (typeof maxStaff === 'number' && maxStaff > 0) {
      const count = await User.countDocuments({ ownerId: owner._id, role: 'STAFF' });
      if (count >= maxStaff) return res.status(400).json({ error: `Staff limit reached (${maxStaff})` });
    }

    const newStaff = await User.create({
      phoneNumber,
      role: 'STAFF',
      name: name || 'Staff',
      ownerId: owner._id,
      planType: owner.planType,
      subscriptionStatus: owner.subscriptionStatus,
      trialEndsAt: owner.trialEndsAt,
      nextBillingDate: owner.nextBillingDate,
      registrationStage: 'COMPLETED',
      businessName: owner.businessName,
      settings: owner.settings,
    });

    try {
      await sendWhatsAppText(phoneNumber, `🔔 Admin has added you to ${owner.businessName}.`);
    } catch {}

    res.json({ success: true, staff: newStaff });
  } catch (error) {
    console.error('Failed to add staff:', error);
    res.status(500).json({ error: 'Failed to add staff' });
  }
};

// -------------------------
// STAFF MANAGEMENT (Delete / Unlink)
// -------------------------

// DELETE /api/admin/staff/:staffId
export const deleteStaffMember = async (req: Request, res: Response) => {
  try {
    const { staffId } = req.params;
    if (typeof staffId !== 'string' || !isValidObjectId(staffId)) return res.status(400).json({ error: 'Invalid staffId' });

    const staff = await User.findById(staffId);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    
    // Allow deleting if role is STAFF OR if they have an ownerId (handle inconsistent state)
    if (staff.role !== 'STAFF' && !staff.ownerId) {
      return res.status(400).json({ error: 'User is not a staff member (no ownerId found)' });
    }

    await User.deleteOne({ _id: staff._id });

    res.json({ success: true, message: 'Staff deleted' });
  } catch (error) {
    console.error('Delete Staff Error:', error);
    res.status(500).json({ error: 'Delete Staff Error' });
  }
};

// PUT /api/admin/staff/:staffId/unlink
export const unlinkStaffMember = async (req: Request, res: Response) => {
  try {
    const { staffId } = req.params;
    if (typeof staffId !== 'string' || !isValidObjectId(staffId)) return res.status(400).json({ error: 'Invalid staffId' });

    const staff = await User.findById(staffId);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });
    
    // Allow unlinking if they have an ownerId
    if (staff.role !== 'STAFF' && !staff.ownerId) {
      return res.status(400).json({ error: 'User is not a staff member (no ownerId found)' });
    }

    // "Unlink" means promoting them to an independent OWNER
    staff.role = 'OWNER';
    staff.ownerId = undefined; // Remove link
    
    // Reset subscription to a fresh trial
    staff.subscriptionStatus = 'trial';
    staff.trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days trial
    staff.planType = 'TYCOON'; // Default plan
    
    await staff.save();

    res.json({ success: true, message: 'Staff unlinked and promoted to Owner', user: staff });
  } catch (error) {
    console.error('Unlink Staff Error:', error);
    res.status(500).json({ error: 'Unlink Staff Error' });
  }
};

// POST /api/admin/staff/cleanup
export const cleanupStaffHierarchy = async (req: Request, res: Response) => {
  try {
    const linkedUsers = await User.find({ ownerId: { $exists: true, $ne: null } });
    
    let nestedCount = 0;
    let orphanCount = 0;
    let selfRefCount = 0;

    for (const user of linkedUsers) {
      if (!user.ownerId) continue;

      // Self-reference check
      if (user.ownerId.toString() === user._id.toString()) {
         await User.updateOne({ _id: user._id }, { $unset: { ownerId: 1 } });
         selfRefCount++;
         continue;
      }

      const owner = await User.findById(user.ownerId);

      // Orphan check
      if (!owner) {
        await User.deleteOne({ _id: user._id });
        orphanCount++;
        continue;
      }

      // Nested Staff check (Owner is actually a STAFF)
      if (owner.role === 'STAFF') {
        await User.deleteOne({ _id: user._id });
        nestedCount++;
      }
    }

    res.json({ 
      success: true, 
      message: 'Cleanup complete', 
      stats: { nestedRemoved: nestedCount, orphansRemoved: orphanCount, selfRefsFixed: selfRefCount } 
    });
  } catch (error) {
    console.error('Cleanup Staff Error:', error);
    res.status(500).json({ error: 'Cleanup Staff Error' });
  }
};
