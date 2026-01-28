import mongoose from 'mongoose';
import axios from 'axios';
import { SupportAgent } from '../models/supportAgent.model';
import { SupportTicket, ISupportTicket } from '../models/supportTicket.model';
import { SupportMessage } from '../models/supportMessage.model';
import { sendPushNotification, sendGlobalPushNotification } from './push.service';
import { sendWhatsAppText } from './whatsapp.service';
import { queueOutboundMessage, queueOutboundButtons } from './queue.service';
import { getIO } from '../socket';
import { env } from '../config/env';

const MAX_ACTIVE_TICKETS = Number(process.env.MAX_ACTIVE_TICKETS_PER_AGENT || 1);


// Helper to safely emit socket events
const safeEmit = (room: string, event: string, data: any) => {
  try {
    const io = getIO();
    io.to(room).emit(event, data);
  } catch (e) {
    // Socket might not be init if running scripts/tests
    console.warn('Socket emit failed (socket not ready?)', e);
  }
};

export const supportService = {
  // 1. Process Inbound Message
  async handleInboundMessage(from: string, text: string, waMessageId: string, profileName?: string) {
    // Check for existing active ticket
    let ticket = await SupportTicket.findOne({
      userPhone: from,
      status: { $in: ['QUEUED', 'ASSIGNED', 'ACTIVE'] }
    });

    if (!ticket) {
      // Create new ticket
      ticket = await SupportTicket.create({
        userPhone: from,
        status: 'QUEUED',
        priority: 'NORMAL',
        lastMessageAt: new Date(),
        // Store profile name in a separate user map or just use phone for now.
        // For simplicity, we just use the ticket. 
      });
      
      // Try to assign immediately
      await this.tryAssignTicket(ticket);

      if (ticket.status === 'QUEUED') {
        safeEmit('agents', 'ticket:queued', ticket);
      }
    } else {
      ticket.lastMessageAt = new Date();
      await ticket.save();
    }

    // Save message
    const msg = await SupportMessage.create({
      ticketId: ticket._id,
      direction: 'IN',
      text,
      waMessageId,
      timestamp: new Date()
    });

    // Notify assigned agent if any
    if (ticket.assignedAgentId) {
      const agentIdStr = ticket.assignedAgentId.toString();
      // Emit to Agent Room
      safeEmit(`agent:${agentIdStr}`, 'ticket:message', { 
        ticketId: ticket._id, 
        message: msg 
      });
      // Emit to Ticket Room (for Admin/Agent real-time chat)
      safeEmit(`ticket:${ticket._id}`, 'ticket:message', { 
        ticketId: ticket._id, 
        message: msg 
      });
      
      // Removed individual push - promoting to Global below
    } else {
        // If queued, still emit to ticket room
        safeEmit(`ticket:${ticket._id}`, 'ticket:message', { 
            ticketId: ticket._id, 
            message: msg 
        });
    }
    
    // Emit to ALL agents/admins so the Ticket List updates (lastMessageAt, snippet)
    safeEmit('agents', 'ticket:message', { 
        ticketId: ticket._id, 
        message: msg 
    });

    // GLOBAL PUSH: Notify all agents/admins of the new message
    await sendGlobalPushNotification({
        title: `New Message: ${from}`,
        body: text.substring(0, 50),
        data: { ticketId: ticket._id }
    });

    // AUTO-REPLY with "End Chat" button
    try {
        // Don't reply if user said "End Chat" (handled by webhook mostly, but safety check)
        if (ticket.status !== 'CLOSED' && text.toLowerCase() !== 'end chat') {
             await queueOutboundButtons(from, "Received. Reply coming soon.", [
                { id: 'END_CHAT', title: 'End Chat' }
            ]);
        }
    } catch (e) {
        console.error('Failed to send auto-reply button', e);
    }

    // ---------------------------------------------------------
    // 🆕 WHATSAPP AGENT ROUTING
    // ---------------------------------------------------------
    
    // A. If assigned to an agent who is active on WhatsApp -> Forward to Agent
    if (ticket.assignedAgentId) {
        const agent = await SupportAgent.findById(ticket.assignedAgentId);
        if (agent && agent.isWhatsAppActive && agent.phoneNumber) {
            await queueOutboundMessage(
                agent.phoneNumber, 
                `📩 *User:* ${text}\n(Reply to chat)`
            );
        }
    }
    
    // B. If Queued -> Notify ALL Active WhatsApp Agents
    if (ticket.status === 'QUEUED') {
        const activeAgents = await SupportAgent.find({ isWhatsAppActive: true, phoneNumber: { $exists: true } });
        for (const ag of activeAgents) {
            if (!ag.phoneNumber) continue;
            // Use queue for broadcasting to agents
            await queueOutboundButtons(
                ag.phoneNumber,
                `🔔 *New Ticket*\nFrom: ${from}\nMsg: "${text.substring(0, 50)}..."`,
                [
                    { id: `AGENT_ACCEPT_${ticket._id}`, title: 'Accept' },
                    { id: 'AGENT_BUSY', title: 'Busy' }
                ]
            );
        }
    }
  },

  // --- NEW AGENT WHATSAPP METHODS ---

  async activateAgentByPhone(phone: string) {
      // Normalize phone if needed, but assuming exact match for now
      const agent = await SupportAgent.findOne({ phoneNumber: phone });
      if (!agent) return false;

      agent.isWhatsAppActive = true;
      agent.status = 'ONLINE'; // Auto set online
      await agent.save();

      await queueOutboundMessage(phone, `✅ You are now *ACTIVE*.\nYou will receive ticket alerts here.\nReply "End Chat" to close a session.`);
      return true;
  },

  async handleAgentWhatsAppMessage(phone: string, text: string) {
      const agent = await SupportAgent.findOne({ phoneNumber: phone });
      if (!agent) return false; // Not an agent

      const cleanText = text.trim();

      // 1. Activation Command
      if (cleanText.toLowerCase().includes('agent') && cleanText.toLowerCase().includes('active')) {
          return this.activateAgentByPhone(phone);
      }

      // 2. End Chat Command
      if (cleanText.toLowerCase() === 'end chat') {
          if (agent.currentTicketId) {
              await this.closeTicket(agent._id as any, String(agent.currentTicketId));
              agent.currentTicketId = undefined;
              await agent.save();
              await queueOutboundMessage(phone, "✅ Chat ended. You are free.");
              return true;
          } else {
              await queueOutboundMessage(phone, "⚠️ You are not in a chat.");
              return true;
          }
      }

      // 3. Proxy Chat to User
      if (agent.currentTicketId) {
          try {
            await this.sendOutboundMessage(agent._id as any, String(agent.currentTicketId), text);
            // Optionally confirm sent? No, too noisy.
          } catch (e: any) {
            await queueOutboundMessage(phone, `❌ Failed to send: ${e.message}`);
          }
          return true;
      }

      // 4. Fallback (Idle)
      await queueOutboundMessage(phone, "💤 You are active but not in a chat. Wait for alerts.");
      return true;
  },

  async acceptTicketViaWhatsApp(agentId: string, ticketId: string) {
      const agent = await SupportAgent.findById(agentId);
      if (!agent || !agent.phoneNumber) return;

      try {
          await this.pickupTicket(agentId, ticketId);
          
          agent.currentTicketId = ticketId as any;
          await agent.save();

          const ticket = await SupportTicket.findById(ticketId);
          
          await queueOutboundMessage(
              agent.phoneNumber, 
              `✅ You are connected to *${ticket?.userPhone}*.\n\nReply here to chat with them directly.`
          );
      } catch (e: any) {
          await queueOutboundMessage(agent.phoneNumber, `❌ Could not pick up: ${e.message}`);
      }
  },

  // 2. Try Assign Ticket
  async tryAssignTicket(ticket: any) {
    if (ticket.status !== 'QUEUED') return;

    // Find available agent: ONLINE, activeTickets < MAX
    const agent = await SupportAgent.findOne({
      status: 'ONLINE',
      activeTicketsCount: { $lt: MAX_ACTIVE_TICKETS }
    }).sort({ activeTicketsCount: 1, lastSeenAt: -1 }); // Balanced load, then most active

    if (agent) {
      ticket.assignedAgentId = agent._id as any;
      ticket.status = 'ASSIGNED';
      ticket.assignedAt = new Date();
      await ticket.save();

      agent.activeTicketsCount += 1;
      await agent.save();

      // Notify Agent
      const agentIdStr = agent._id.toString();
      safeEmit(`agent:${agentIdStr}`, 'ticket:assigned', ticket);
      
      await sendPushNotification(agentIdStr, {
        title: 'New Ticket Assigned',
        body: `User: ${ticket.userPhone}`,
        data: { ticketId: ticket._id }
      });
    }
  },

  // 3. Agent Send Message
  async sendOutboundMessage(agentId: string, ticketId: string, text: string) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    
    // Authorization check
    if (String(ticket.assignedAgentId) !== String(agentId)) {
      throw new Error('Not assigned to this ticket');
    }

    if (ticket.status === 'CLOSED') throw new Error('Ticket is closed');

    if (ticket.status === 'ASSIGNED') {
      ticket.status = 'ACTIVE';
      await ticket.save();
    }

    // 1. Create Message Record First (Pending)
    const msg = await SupportMessage.create({
      ticketId: ticket._id,
      direction: 'OUT',
      text,
      waMessageId: undefined // Will be updated by worker
    });

    // 2. Queue for sending
    // Use queue to handle rate limits (safe for bulk usage)
    await queueOutboundMessage(
        ticket.userPhone, 
        text, 
        `support_${ticket._id}_${Date.now()}`, 
        { dbMessageId: msg._id.toString() }
    );

    // 3. Update Last Message Time
    ticket.lastMessageAt = new Date();
    await ticket.save();

    // 4. Emit real-time update
    safeEmit(`ticket:${ticket._id}`, 'ticket:message', { ticketId: ticket._id, message: msg });
    
    return msg;
  },

  // 4. Close Ticket
  async closeTicket(agentId: string, ticketId: string) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    
    if (String(ticket.assignedAgentId) !== String(agentId)) {
        throw new Error('Not assigned to this ticket');
    }

    ticket.status = 'CLOSED';
    ticket.closedAt = new Date();
    await ticket.save();

    // Decrement agent count
    await SupportAgent.findByIdAndUpdate(agentId, { $inc: { activeTicketsCount: -1 } });

    // Clear WhatsApp Session if active
    const agentObj = await SupportAgent.findById(agentId);
    if (agentObj && String(agentObj.currentTicketId) === String(ticketId)) {
        agentObj.currentTicketId = undefined;
        await agentObj.save();
        if (agentObj.isWhatsAppActive && agentObj.phoneNumber) {
            await queueOutboundMessage(agentObj.phoneNumber, "ℹ️ Ticket closed via Dashboard.");
        }
    }

    // Try to assign pending tickets to this now-free agent
    this.assignNextToAgent(agentId);
  },

  // 5. Escalate
  async escalateTicket(fromAgentId: string, ticketId: string, toAgentId: string) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    if (String(ticket.assignedAgentId) !== String(fromAgentId)) {
        throw new Error('Not assigned to this ticket');
    }

    const toAgent = await SupportAgent.findById(toAgentId);
    if (!toAgent) throw new Error('Target agent not found');

    // Update Ticket
    ticket.assignedAgentId = toAgent._id as any;
    ticket.status = 'ASSIGNED'; // Reset to ASSIGNED so new agent sees it as fresh
    await ticket.save();

    // Update counts
    await SupportAgent.findByIdAndUpdate(fromAgentId, { $inc: { activeTicketsCount: -1 } });
    await SupportAgent.findByIdAndUpdate(toAgentId, { $inc: { activeTicketsCount: 1 } });

    // Notify new agent
    const newAgentStr = toAgentId.toString();
    safeEmit(`agent:${newAgentStr}`, 'ticket:assigned', ticket);
    await sendPushNotification(newAgentStr, {
      title: 'Ticket Escalated to You',
      body: `User: ${ticket.userPhone}`,
      data: { ticketId: ticket._id }
    });

    // Notify old agent (remove from UI)
    safeEmit(`agent:${fromAgentId}`, 'ticket:removed', { ticketId });

    // Check if old agent can take new ticket
    this.assignNextToAgent(fromAgentId);
  },

  // 6. User End Chat
  async endTicketByUser(userPhone: string) {
    const ticket = await SupportTicket.findOne({
      userPhone,
      status: { $in: ['QUEUED', 'ASSIGNED', 'ACTIVE'] }
    });

    if (!ticket) return null;

    // 1. Notify User on WhatsApp
    try {
        await queueOutboundMessage(userPhone, "Session ended. Thank you for contacting us.");
    } catch (e) {
        console.error("Failed to send end session confirmation", e);
    }

    // 2. Record in Chat History
    const endMsg = await SupportMessage.create({
        ticketId: ticket._id,
        direction: 'IN',
        text: '[User ended the session]',
        timestamp: new Date()
    });
    
    // 3. Notify Agent/Room immediately (before closing)
    safeEmit(`ticket:${ticket._id}`, 'ticket:message', { ticketId: ticket._id, message: endMsg });
    if (ticket.assignedAgentId) {
        safeEmit(`agent:${ticket.assignedAgentId}`, 'ticket:message', { ticketId: ticket._id, message: endMsg });
    }

    // 4. Close Ticket
    ticket.status = 'CLOSED';
    ticket.closedAt = new Date();
    await ticket.save();

    if (ticket.assignedAgentId) {
       const agentIdStr = ticket.assignedAgentId.toString();
       
       // Decrement agent count
       await SupportAgent.findByIdAndUpdate(agentIdStr, { $inc: { activeTicketsCount: -1 } });
       
       // Notify Agent to remove from UI (or update status)
       safeEmit(`agent:${agentIdStr}`, 'ticket:removed', { ticketId: ticket._id });
       
       // Try assign next
       this.assignNextToAgent(agentIdStr);
    }

    return ticket;
  },

  // 9. Admin Send Message (Intervention)
  async adminSendOutboundMessage(ticketId: string, text: string, adminName: string) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    
    // No assignment check - Admin can intervene
    
    if (ticket.status === 'CLOSED') throw new Error('Ticket is closed');

    // 1. Create Message Record First
    const msg = await SupportMessage.create({
      ticketId: ticket._id,
      direction: 'OUT',
      text, // Stored as is
      waMessageId: undefined
    });

    // 2. Queue for sending
    await queueOutboundMessage(
        ticket.userPhone, 
        text, 
        `admin_${ticket._id}_${Date.now()}`,
        { dbMessageId: msg._id.toString() }
    );

    // 3. Update Last Message Time
    ticket.lastMessageAt = new Date();
    await ticket.save();

    // 4. Emit real-time update
    safeEmit(`ticket:${ticket._id}`, 'ticket:message', { ticketId: ticket._id, message: msg });
    
    // Also emit to assigned agent if any, so they see admin's message
    if (ticket.assignedAgentId) {
        safeEmit(`agent:${ticket.assignedAgentId}`, 'ticket:message', { ticketId: ticket._id, message: msg });
    }

    return msg;
  },

  // 7. Admin Delete Ticket
  async deleteTicket(ticketId: string) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return; // Already gone

    // Decrement agent count if active
    if (ticket.assignedAgentId && (ticket.status === 'ASSIGNED' || ticket.status === 'ACTIVE')) {
        await SupportAgent.findByIdAndUpdate(ticket.assignedAgentId, { $inc: { activeTicketsCount: -1 } });
        safeEmit(`agent:${ticket.assignedAgentId}`, 'ticket:removed', { ticketId });
    } else if (ticket.status === 'QUEUED') {
        safeEmit('agents', 'ticket:removed', { ticketId });
    }

    await SupportMessage.deleteMany({ ticketId });
    await SupportTicket.findByIdAndDelete(ticketId);
  },

  // 8. Admin Assign Ticket
  async adminAssignTicket(ticketId: string, agentId: string) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');

    const targetAgent = await SupportAgent.findById(agentId);
    if (!targetAgent) throw new Error('Agent not found');

    // Handle previous agent
    if (ticket.assignedAgentId && String(ticket.assignedAgentId) !== agentId) {
        if (ticket.status === 'ASSIGNED' || ticket.status === 'ACTIVE') {
            await SupportAgent.findByIdAndUpdate(ticket.assignedAgentId, { $inc: { activeTicketsCount: -1 } });
            safeEmit(`agent:${ticket.assignedAgentId}`, 'ticket:removed', { ticketId });
        }
    }

    // Assign to new
    const isNewAssignment = String(ticket.assignedAgentId) !== agentId;
    
    ticket.assignedAgentId = targetAgent._id as any;
    ticket.status = 'ASSIGNED';
    ticket.assignedAt = new Date();
    await ticket.save();

    if (isNewAssignment) {
        await SupportAgent.findByIdAndUpdate(agentId, { $inc: { activeTicketsCount: 1 } });
    }

    safeEmit(`agent:${agentId}`, 'ticket:assigned', ticket);
  },

  async pickupTicket(agentId: string, ticketId: string) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    if (ticket.assignedAgentId) throw new Error('Already assigned');
    
    const agent = await SupportAgent.findById(agentId);
    if (!agent) throw new Error('Agent not found');

    ticket.assignedAgentId = agent._id as any;
    ticket.status = 'ASSIGNED';
    ticket.assignedAt = new Date();
    await ticket.save();
    
    await SupportAgent.findByIdAndUpdate(agentId, { $inc: { activeTicketsCount: 1 } });
    
    // Notify everyone it's gone from queue
    safeEmit('agents', 'ticket:removed', { ticketId }); 
    // Notify agent explicitly
    safeEmit(`agent:${agentId}`, 'ticket:assigned', ticket);
  },

  // Helper: Assign next queued ticket to specific agent
  async assignNextToAgent(agentId: string) {
    const agent = await SupportAgent.findById(agentId);
    if (!agent || agent.status !== 'ONLINE') return;
    if (agent.activeTicketsCount >= MAX_ACTIVE_TICKETS) return;

    const nextTicket = await SupportTicket.findOne({ status: 'QUEUED' }).sort({ createdAt: 1 });
    if (nextTicket) {
      nextTicket.assignedAgentId = agent._id as any;
      nextTicket.status = 'ASSIGNED';
      nextTicket.assignedAt = new Date();
      await nextTicket.save();

      agent.activeTicketsCount += 1;
      await agent.save();

      safeEmit(`agent:${agentId}`, 'ticket:assigned', nextTicket);
      await sendPushNotification(agentId, {
        title: 'New Ticket Assigned',
        body: `User: ${nextTicket.userPhone}`,
        data: { ticketId: nextTicket._id }
      });
    }
  }
};
