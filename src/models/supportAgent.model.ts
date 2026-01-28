import mongoose, { Schema, Document } from 'mongoose';

export interface ISupportAgent extends Document {
  username: string;
  passwordHash: string;
  phoneNumber?: string; // WhatsApp number
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  isWhatsAppActive: boolean; // Toggled via "active" command
  currentTicketId?: mongoose.Types.ObjectId; // If chatting via WhatsApp
  activeTicketsCount: number;
  lastSeenAt: Date;
  createdAt: Date;
}

const SupportAgentSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  phoneNumber: { type: String, unique: true, sparse: true },
  status: { 
    type: String, 
    enum: ['ONLINE', 'OFFLINE', 'BUSY'], 
    default: 'OFFLINE' 
  },
  isWhatsAppActive: { type: Boolean, default: false },
  currentTicketId: { type: Schema.Types.ObjectId, ref: 'SupportTicket' },
  activeTicketsCount: { type: Number, default: 0 },
  lastSeenAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export const SupportAgent = mongoose.model<ISupportAgent>('SupportAgent', SupportAgentSchema);
