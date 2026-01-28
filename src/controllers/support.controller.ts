import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SupportAgent } from '../models/supportAgent.model';
import { SupportTicket } from '../models/supportTicket.model';
import { SupportMessage } from '../models/supportMessage.model';
import { PushSubscription } from '../models/pushSubscription.model';
import { supportService } from '../services/support.service';
import { env } from '../config/env';

const JWT_SECRET = process.env.JWT_SECRET || (env as any).jwtSecret || 'fallback_secret';

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
    } catch (e: any) {
      if (e.code === 11000) return res.status(400).json({ error: 'Username or Phone taken' });
      res.status(500).json({ error: e.message });
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

      const updateData: any = {};
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
    } catch (e: any) {
      if (e.code === 11000) return res.status(400).json({ error: 'Username or Phone taken' });
      res.status(500).json({ error: e.message });
    }
  },

  async deleteAgent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const agent = await SupportAgent.findByIdAndDelete(id);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      res.json({ message: 'Agent deleted' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },

  async adminListTickets(req: Request, res: Response) {
    const { status, search } = req.query;
    const filter: any = {};
    
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
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  },

  async adminAssignTicket(req: Request, res: Response) {
    const { ticketId } = req.params;
    const { agentId } = req.body;
    try {
        await supportService.adminAssignTicket(String(ticketId), agentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
  },

  async adminSendMessage(req: Request, res: Response) {
      const { ticketId } = req.params;
      const { text } = req.body;
      // Assume admin name is in req.user or generic
      const adminName = (req as any).user?.name || 'Admin';
      
      try {
          const msg = await supportService.adminSendOutboundMessage(ticketId, text, adminName);
          res.json(msg);
      } catch (e: any) {
          res.status(400).json({ error: e.message });
      }
  },

  // --- AGENT AUTH ---
  async agentDeleteTicket(req: any, res: Response) {
    const { ticketId } = req.params;
    try {
        // Optional: Check if agent owns the ticket or has permission
        // For now, allow deletion as requested
        await supportService.deleteTicket(String(ticketId));
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  },

  async agentPickupTicket(req: any, res: Response) {
    const { ticketId } = req.params;
    try {
        await supportService.pickupTicket(req.agent.id, ticketId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
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

  async getMe(req: any, res: Response) {
    const agent = await SupportAgent.findById(req.agent.id, '-passwordHash');
    res.json(agent);
  },

  async setStatus(req: any, res: Response) {
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
  async getTickets(req: any, res: Response) {
    const { status } = req.query; // QUEUED, ASSIGNED, ACTIVE, CLOSED
    
    const filter: any = {};
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

  async getMessages(req: any, res: Response) {
    const { ticketId } = req.params;
    // Check access?
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    
    // Strict access: only if assigned or queued(view only?)
    // For now allow read if agent is authenticated
    
    const messages = await SupportMessage.find({ ticketId }).sort({ timestamp: 1 });
    res.json(messages);
  },

  async sendMessage(req: any, res: Response) {
    const { ticketId } = req.params;
    const { text } = req.body;
    
    try {
        const msg = await supportService.sendOutboundMessage(req.agent.id, ticketId, text);
        res.json(msg);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
  },

  async closeTicket(req: any, res: Response) {
    const { ticketId } = req.params;
    try {
        await supportService.closeTicket(req.agent.id, ticketId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
  },

  async escalateTicket(req: any, res: Response) {
    const { ticketId } = req.params;
    const { toAgentId } = req.body;
    try {
        await supportService.escalateTicket(req.agent.id, ticketId, toAgentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
  },

  async subscribePush(req: any, res: Response) {
    const subscription = req.body;
    await PushSubscription.create({
        agentId: req.agent.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: req.headers['user-agent']
    });
    res.status(201).json({ success: true });
  }
};
