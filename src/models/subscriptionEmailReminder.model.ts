import { Document, Schema, Types, model } from 'mongoose';

export interface ISubscriptionEmailReminder extends Document {
  user: Types.ObjectId;
  expiryAt: Date;
  daysBeforeExpiry: 0 | 1 | 2 | 3;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  email: string;
  error?: string | null;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionEmailReminderSchema = new Schema<ISubscriptionEmailReminder>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiryAt: { type: Date, required: true },
    daysBeforeExpiry: { type: Number, enum: [0, 1, 2, 3], required: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING', index: true },
    attempts: { type: Number, default: 1, min: 1, max: 3 },
    email: { type: String, required: true, trim: true, lowercase: true },
    error: { type: String, default: null, maxlength: 1000 },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

subscriptionEmailReminderSchema.index(
  { user: 1, expiryAt: 1, daysBeforeExpiry: 1 },
  { unique: true },
);

export const SubscriptionEmailReminder = model<ISubscriptionEmailReminder>(
  'SubscriptionEmailReminder',
  subscriptionEmailReminderSchema,
);
