import mongoose, { Schema, Document } from 'mongoose';

export interface ISupportMessage extends Document {
  ticketId: mongoose.Types.ObjectId;
  direction: 'IN' | 'OUT';
  text: string;
  waMessageId?: string;
  timestamp: Date;
}

const SupportMessageSchema: Schema = new Schema({
  ticketId: { type: Schema.Types.ObjectId, ref: 'SupportTicket', required: true, index: true },
  direction: { type: String, enum: ['IN', 'OUT'], required: true },
  text: { type: String, required: true },
  waMessageId: { type: String },
  timestamp: { type: Date, default: Date.now },
});

export const SupportMessage = mongoose.model<ISupportMessage>('SupportMessage', SupportMessageSchema);
