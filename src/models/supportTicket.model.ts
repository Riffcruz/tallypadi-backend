import mongoose, { Schema, Document } from 'mongoose';

export interface ISupportTicket extends Document {
  userPhone: string;
  waConversationId?: string; // Optional: WhatsApp conversation ID
  status: 'QUEUED' | 'ASSIGNED' | 'ACTIVE' | 'CLOSED';
  priority: 'NORMAL' | 'HIGH';
  assignedAgentId?: mongoose.Types.ObjectId;
  assignedAt?: Date;
  closedAt?: Date;
  escalatedFromTicketId?: mongoose.Types.ObjectId;
  lastMessageAt: Date;
  createdAt: Date;
}

const SupportTicketSchema: Schema = new Schema({
  userPhone: { type: String, required: true, index: true },
  waConversationId: { type: String },
  status: { 
    type: String, 
    enum: ['QUEUED', 'ASSIGNED', 'ACTIVE', 'CLOSED'], 
    default: 'QUEUED',
    index: true
  },
  priority: { 
    type: String, 
    enum: ['NORMAL', 'HIGH'], 
    default: 'NORMAL' 
  },
  assignedAgentId: { type: Schema.Types.ObjectId, ref: 'SupportAgent', index: true },
  assignedAt: { type: Date },
  closedAt: { type: Date },
  escalatedFromTicketId: { type: Schema.Types.ObjectId, ref: 'SupportTicket' },
  lastMessageAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export const SupportTicket = mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);
