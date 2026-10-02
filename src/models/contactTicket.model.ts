import { Document, Schema, model } from 'mongoose';

export const CONTACT_TICKET_CATEGORIES = [
  'ACCOUNT',
  'BILLING',
  'TECHNICAL',
  'MARKETPLACE',
  'ADS',
  'PRIVACY',
  'OTHER',
] as const;

export const CONTACT_TICKET_STATUSES = ['NEW', 'OPEN', 'WAITING', 'RESOLVED', 'CLOSED'] as const;
export const CONTACT_TICKET_PRIORITIES = ['NORMAL', 'HIGH'] as const;

export type ContactTicketCategory = typeof CONTACT_TICKET_CATEGORIES[number];
export type ContactTicketStatus = typeof CONTACT_TICKET_STATUSES[number];
export type ContactTicketPriority = typeof CONTACT_TICKET_PRIORITIES[number];

export interface IContactTicket extends Document {
  ticketNumber: string;
  name: string;
  email: string;
  phone?: string;
  category: ContactTicketCategory;
  subject: string;
  message: string;
  status: ContactTicketStatus;
  priority: ContactTicketPriority;
  adminNotes?: string;
  source: 'CONTACT_FORM';
  emailNotificationStatus: 'PENDING' | 'SENT' | 'FAILED';
  emailNotificationError?: string;
  userAgent?: string;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const contactTicketSchema = new Schema<IContactTicket>(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, index: true },
    phone: { type: String, trim: true, maxlength: 30 },
    category: { type: String, enum: CONTACT_TICKET_CATEGORIES, required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: CONTACT_TICKET_STATUSES, default: 'NEW', index: true },
    priority: { type: String, enum: CONTACT_TICKET_PRIORITIES, default: 'NORMAL', index: true },
    adminNotes: { type: String, trim: true, maxlength: 5000 },
    source: { type: String, enum: ['CONTACT_FORM'], default: 'CONTACT_FORM' },
    emailNotificationStatus: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    emailNotificationError: { type: String, trim: true, maxlength: 500 },
    userAgent: { type: String, trim: true, maxlength: 500 },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactTicketSchema.index({ status: 1, createdAt: -1 });
contactTicketSchema.index({ category: 1, createdAt: -1 });

export const ContactTicket = model<IContactTicket>('ContactTicket', contactTicketSchema);
