import crypto from 'crypto';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  CONTACT_TICKET_CATEGORIES,
  CONTACT_TICKET_PRIORITIES,
  CONTACT_TICKET_STATUSES,
  ContactTicket,
} from '../models/contactTicket.model';
import { queueContactTicketEmail } from '../services/queue.service';
import { verifyTurnstileToken } from '../services/turnstile.service';

const publicTicketSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional().default(''),
  category: z.enum(CONTACT_TICKET_CATEGORIES),
  subject: z.string().trim().min(5).max(160),
  message: z.string().trim().min(20).max(5000),
  turnstileToken: z.string().trim().min(1).max(2048),
  website: z.string().max(0).optional().default(''),
}).strict();

const adminUpdateSchema = z.object({
  status: z.enum(CONTACT_TICKET_STATUSES).optional(),
  priority: z.enum(CONTACT_TICKET_PRIORITIES).optional(),
  adminNotes: z.string().trim().max(5000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied' });

const cleanOneLine = (value: unknown, maxLength: number) => String(value || '')
  .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const routeParam = (value: unknown) => Array.isArray(value) ? String(value[0] || '') : String(value || '');

const makeTicketNumber = () => {
  const now = new Date();
  const date = [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0'), String(now.getUTCDate()).padStart(2, '0')].join('');
  return `TP-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

export const createPublicContactTicket = async (req: Request, res: Response) => {
  try {
    const parsed = publicTicketSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please check the form and try again.' });
    if (parsed.data.website) return res.status(400).json({ error: 'Unable to submit this request.' });

    const captcha = await verifyTurnstileToken(parsed.data.turnstileToken, req.ip);
    if (!captcha.success) {
      const unavailable = captcha.reason === 'UNAVAILABLE' || captcha.reason === 'NOT_CONFIGURED';
      return res.status(unavailable ? 503 : 400).json({
        error: unavailable
          ? 'Security verification is temporarily unavailable. Please try again shortly.'
          : 'Security verification failed. Please refresh and try again.',
      });
    }

    const ticket = await ContactTicket.create({
      ticketNumber: makeTicketNumber(),
      name: cleanOneLine(parsed.data.name, 100),
      email: parsed.data.email.trim().toLowerCase(),
      phone: cleanOneLine(parsed.data.phone, 30) || undefined,
      category: parsed.data.category,
      subject: cleanOneLine(parsed.data.subject, 160),
      message: parsed.data.message.trim(),
      userAgent: cleanOneLine(req.get('user-agent'), 500) || undefined,
    });

    try {
      await queueContactTicketEmail({
        contactTicketId: String(ticket._id),
        ticketId: String(ticket._id),
        ticketNumber: ticket.ticketNumber,
        name: ticket.name,
        email: ticket.email,
        phone: ticket.phone,
        category: ticket.category,
        subject: ticket.subject,
        message: ticket.message,
      });
    } catch (emailError) {
      const reason = emailError instanceof Error ? emailError.message : 'Email notification could not be queued';
      console.error(`Support ticket ${ticket.ticketNumber} email notification queue failed:`, reason);
      await ContactTicket.updateOne(
        { _id: ticket._id },
        { $set: { emailNotificationStatus: 'FAILED', emailNotificationError: reason.slice(0, 500) } }
      );
    }

    return res.status(201).json({ success: true, ticketNumber: ticket.ticketNumber });
  } catch (error) {
    console.error('Create contact ticket error:', error);
    return res.status(500).json({ error: 'Your ticket could not be submitted. Please try again.' });
  }
};

export const listAdminContactTickets = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const status = cleanOneLine(req.query.status, 20).toUpperCase();
    const category = cleanOneLine(req.query.category, 30).toUpperCase();
    const search = cleanOneLine(req.query.search, 120);
    const query: Record<string, unknown> = {};

    if ((CONTACT_TICKET_STATUSES as readonly string[]).includes(status)) query.status = status;
    if ((CONTACT_TICKET_CATEGORIES as readonly string[]).includes(category)) query.category = category;
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      query.$or = [
        { ticketNumber: regex },
        { name: regex },
        { email: regex },
        { phone: regex },
        { subject: regex },
      ];
    }

    const [tickets, total, countRows] = await Promise.all([
      ContactTicket.find(query)
        .select('-message -adminNotes -userAgent -emailNotificationError')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ContactTicket.countDocuments(query),
      ContactTicket.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const counts = Object.fromEntries(CONTACT_TICKET_STATUSES.map((item) => [item, 0])) as Record<string, number>;
    countRows.forEach((row) => { counts[row._id] = row.count; });

    return res.json({
      tickets,
      counts,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('List contact tickets error:', error);
    return res.status(500).json({ error: 'Could not load support tickets.' });
  }
};

export const getAdminContactTicket = async (req: Request, res: Response) => {
  try {
    const id = routeParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ticket ID.' });
    const ticket = await ContactTicket.findById(id).select('-userAgent').lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    return res.json({ ticket });
  } catch (error) {
    console.error('Get contact ticket error:', error);
    return res.status(500).json({ error: 'Could not load this ticket.' });
  }
};

export const updateAdminContactTicket = async (req: Request, res: Response) => {
  try {
    const id = routeParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid ticket ID.' });
    const parsed = adminUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid ticket update.' });

    const update: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status) {
      update.resolvedAt = ['RESOLVED', 'CLOSED'].includes(parsed.data.status) ? new Date() : null;
    }

    const ticket = await ContactTicket.findByIdAndUpdate(id, { $set: update }, { new: true })
      .select('-userAgent')
      .lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    return res.json({ ticket });
  } catch (error) {
    console.error('Update contact ticket error:', error);
    return res.status(500).json({ error: 'Could not update this ticket.' });
  }
};
