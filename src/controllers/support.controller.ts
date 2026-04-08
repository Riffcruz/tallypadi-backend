import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SupportAgent } from '../models/supportAgent.model';
import { SupportTicket } from '../models/supportTicket.model';
import { SupportMessage } from '../models/supportMessage.model';
import { PushSubscription } from '../models/pushSubscription.model';
import { User } from '../models/user.model';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { supportService } from '../services/support.service';
import { sendWhatsAppText } from '../services/whatsapp.service';
import { env } from '../config/env';

const JWT_SECRET = process.env.JWT_SECRET || (env as { jwtSecret?: string }).jwtSecret || 'fallback_secret';

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

const getAllUsersQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
});

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .refine((v) => /^[+]?[\d\s()-]+$/.test(v), 'Invalid phone number format');

const manageUserSchema = z
  .object({
    action: z.enum([
      'send_message',
      'clear_history', // Agents often are allowed to clear history to relieve chat bounds, but if restricted: we omit it. User asked to "disallowing delete". We'll allow clear_history but no destructives. Wait, plan says "block clear message history". So I will remove clear_history too.
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

const sendMessagePayloadSchema = z.object({
  to: phoneSchema,
  message: z.string().trim().min(1).max(1500),
});


export const supportController = {
  // --- ADMIN ---
  async createAgent(req: Request, res: Response) {
    try {
      const { username, password, phoneNumber } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      
      const cleanPhone = phoneNumber ? String(phoneNumber).replace(/\D/g, '') : undefined;

      const agent = await SupportAgent.create({
        username,
        passwordHash,
        phoneNumber: cleanPhone,
        status: 'OFFLINE',
        isWhatsAppActive: !!cleanPhone // Auto-activate if phone provided
      });

      res.status(201).json({ 
        message: 'Agent created', 
        agent: { id: agent._id, username: agent.username } 
      });
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: number }).code === 11000) return res.status(400).json({ error: 'Username or Phone taken' });
      res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async listAgents(req: Request, res: Response) {
    const agents = await SupportAgent.find({}, '-passwordHash');
    res.json(agents);
  },

  async updateAgent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { username, password, phoneNumber } = req.body;

      const updateData: Record<string, string | boolean> = {};
      if (username) updateData.username = username;
      if (phoneNumber) {
          const cleanPhone = String(phoneNumber).replace(/\D/g, '');
          updateData.phoneNumber = cleanPhone;
          updateData.isWhatsAppActive = true; // Auto-activate if phone updated
      }
      if (password) {
        const salt = await bcrypt.genSalt(10);
        updateData.passwordHash = await bcrypt.hash(password, salt);
      }

      const agent = await SupportAgent.findByIdAndUpdate(id, updateData, { new: true }).select('-passwordHash');
      if (!agent) return res.status(404).json({ error: 'Agent not found' });

      res.json(agent);
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: number }).code === 11000) return res.status(400).json({ error: 'Username or Phone taken' });
      res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async deleteAgent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const agent = await SupportAgent.findByIdAndDelete(id);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      res.json({ message: 'Agent deleted' });
    } catch (e: unknown) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async adminListTickets(req: Request, res: Response) {
    const { status, search } = req.query;
    const filter: Record<string, unknown> = {};
    
    if (status) {
         if (typeof status === 'string' && status.includes(',')) {
            filter.status = { $in: status.split(',') };
        } else {
            filter.status = status;
        }
    }

    if (search) {
        filter.userPhone = { $regex: search, $options: 'i' };
    }

    const tickets = await SupportTicket.find(filter)
        .populate('assignedAgentId', 'username')
        .sort({ lastMessageAt: -1 });
    
    res.json(tickets);
  },

  async adminGetTicketMessages(req: Request, res: Response) {
    const { ticketId } = req.params;
    const messages = await SupportMessage.find({ ticketId }).sort({ timestamp: 1 });
    res.json(messages);
  },

  async adminDeleteTicket(req: Request, res: Response) {
    const { ticketId } = req.params;
    try {
        await supportService.deleteTicket(String(ticketId));
        res.json({ success: true });
    } catch (e: unknown) {
        res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async adminAssignTicket(req: Request, res: Response) {
    const { ticketId } = req.params;
    const { agentId } = req.body;
    try {
        await supportService.adminAssignTicket(String(ticketId), agentId);
        res.json({ success: true });
    } catch (e: unknown) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async adminSendMessage(req: Request, res: Response) {
      const { ticketId } = req.params;
      const { text } = req.body;
      // Assume admin name is in req.user or generic
      const adminName = (req as Request & { user?: { name?: string } }).user?.name || 'Admin';
      
      try {
          const msg = await supportService.adminSendOutboundMessage(String(ticketId), text, adminName);
          res.json(msg);
      } catch (e: unknown) {
          res.status(400).json({ error: e instanceof Error ? e.message : 'Server error' });
      }
  },

  // --- AGENT AUTH ---
  async agentDeleteTicket(req: Request & { agent: { id: string } }, res: Response) {
    const { ticketId } = req.params;
    try {
        // Optional: Check if agent owns the ticket or has permission
        // For now, allow deletion as requested
        await supportService.deleteTicket(String(ticketId));
        res.json({ success: true });
    } catch (e: unknown) {
        res.status(500).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async agentPickupTicket(req: Request & { agent: { id: string } }, res: Response) {
    const { ticketId } = req.params;
    try {
        await supportService.pickupTicket(req.agent.id, ticketId as string);
        res.json({ success: true });
    } catch (e: unknown) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async login(req: Request, res: Response) {
    const { username, password } = req.body;
    const agent = await SupportAgent.findOne({ username });
    
    if (!agent) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, agent.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { agentId: agent._id, username: agent.username, role: 'AGENT' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, agent: { id: agent._id, username: agent.username, status: agent.status } });
  },

  async getMe(req: Request & { agent: { id: string } }, res: Response) {
    const agent = await SupportAgent.findById(req.agent.id, '-passwordHash');
    res.json(agent);
  },

  async setStatus(req: Request & { agent: { id: string } }, res: Response) {
    const { status } = req.body; // ONLINE, OFFLINE, BUSY
    if (!['ONLINE', 'OFFLINE', 'BUSY'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const agent = await SupportAgent.findByIdAndUpdate(
      req.agent.id, 
      { status, lastSeenAt: new Date() },
      { new: true }
    );
    
    // If going ONLINE, try to assign tickets
    if (status === 'ONLINE') {
        // Trigger assignment check loop (simplified: just check once)
        await supportService.assignNextToAgent(req.agent.id);
    }

    res.json(agent);
  },

  // --- DASHBOARD ---
  async getTickets(req: Request & { agent: { id: string } }, res: Response) {
    const { status } = req.query; // QUEUED, ASSIGNED, ACTIVE, CLOSED
    
    const filter: Record<string, unknown> = {};
    if (status) {
        if (typeof status === 'string' && status.includes(',')) {
            filter.status = { $in: status.split(',') };
        } else {
            filter.status = status;
        }
    }
    
    // Agents see:
    // 1. Their own assigned/active tickets
    // 2. QUEUED tickets (optional, if they want to cherry pick, or just view count)
    
    // Simplification: 
    // If querying QUEUED, anyone can see.
    // If querying ASSIGNED/ACTIVE/CLOSED, filter by agentId.
    
    if (status === 'QUEUED') {
       // Global queue
    } else {
       filter.assignedAgentId = req.agent.id;
    }

    const tickets = await SupportTicket.find(filter).sort({ lastMessageAt: -1 });
    res.json(tickets);
  },

  async getMessages(req: Request & { agent: { id: string } }, res: Response) {
    const { ticketId } = req.params;
    // Check access?
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    // Strict access: only if assigned or queued(view only?)
    // For now allow read if agent is authenticated
    
    const messages = await SupportMessage.find({ ticketId }).sort({ timestamp: 1 });
    res.json(messages);
  },

  async sendMessage(req: Request & { agent: { id: string } }, res: Response) {
    const { ticketId } = req.params;
    const { text } = req.body;
    
    try {
        const msg = await supportService.sendOutboundMessage(req.agent.id, ticketId as string, text);
        res.json(msg);
    } catch (e: unknown) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async closeTicket(req: Request & { agent: { id: string } }, res: Response) {
    const { ticketId } = req.params;
    try {
        await supportService.closeTicket(req.agent.id, ticketId as string);
        res.json({ success: true });
    } catch (e: unknown) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async escalateTicket(req: Request & { agent: { id: string } }, res: Response) {
    const { ticketId } = req.params;
    const { toAgentId } = req.body;
    try {
        await supportService.escalateTicket(req.agent.id, ticketId as string, toAgentId);
        res.json({ success: true });
    } catch (e: unknown) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'Server error' });
    }
  },

  async subscribePush(req: Request & { agent: { id: string } }, res: Response) {
    const subscription = req.body;
    await PushSubscription.create({
        agentId: req.agent.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: req.headers['user-agent']
    });
    res.status(201).json({ success: true });
  },

  // --- USER MANGEMENT (Support Agent Layer) ---

  async getUsers(req: Request & { agent: { id: string } }, res: Response) {
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

      // Avoid N+1: aggregate sales totals
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
      console.error('Fetch Support Users Error:', error);
      res.status(500).json({ error: 'Fetch Users Error' });
    }
  },

  async getUserDeepDive(req: Request & { agent: { id: string } }, res: Response) {
    try {
      const { userId } = req.params;
      if (typeof userId !== 'string' || !isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid id' });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const ownerId = user.role === 'OWNER' ? user._id : user.ownerId;
      if (!ownerId) return res.status(400).json({ error: 'OwnerId not found' });

      // Find all staff EXCLUDING the owner
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
      console.error('Support getUserDeepDive error:', error);
      res.status(500).json({ error: 'Server Error' });
    }
  },

  async manageUser(req: Request & { agent: { id: string } }, res: Response) {
    try {
      const { userId } = req.params;
      if (typeof userId !== 'string' || !isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid id' });

      const parsed = manageUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const { action, payload } = parsed.data;

      // EXPLICIT GUARD - Security measure beyond Zod
      if (action === ('delete_user' as any) || action === ('delete_sales_history' as any) || action === ('clear_history' as any)) {
          return res.status(403).json({ error: 'Support agents are not authorized to perform destructive actions.' });
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const ownerId = user.role === 'OWNER' ? user._id : user.ownerId;
      if (!ownerId) return res.status(400).json({ error: 'OwnerId not found' });

      if (action === 'send_message') {
        const p = sendMessagePayloadSchema.safeParse(payload || {});
        if (!p.success) return res.status(400).json({ error: p.error.flatten() });

        await sendWhatsAppText(p.data.to, p.data.message);
        return res.json({ success: true, message: `Message sent to ${p.data.to}` });
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
      console.error('Support Update User Error:', error);
      res.status(500).json({ error: 'Update User Error' });
    }
  }
};
