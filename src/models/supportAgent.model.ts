import mongoose, { Schema, Document } from 'mongoose';

export interface ISupportAgent extends Document {
  username: string;
  passwordHash: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  activeTicketsCount: number;
  lastSeenAt: Date;
  createdAt: Date;
}

const SupportAgentSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['ONLINE', 'OFFLINE', 'BUSY'], 
    default: 'OFFLINE' 
  },
  activeTicketsCount: { type: Number, default: 0 },
  lastSeenAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export const SupportAgent = mongoose.model<ISupportAgent>('SupportAgent', SupportAgentSchema);
