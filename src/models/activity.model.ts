import { Schema, model, Document, Types } from 'mongoose';

export type ActivityType =
  | 'WALLET_FUNDING'
  | 'AD_BOOST'
  | 'SUBSCRIPTION'
  | 'LOW_STOCK'
  | 'EXPENSE'
  | 'OTHER';

export interface IActivity extends Document {
  user: Types.ObjectId;
  actor?: Types.ObjectId | null;
  type: ActivityType;
  title: string;
  message: string;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    type: {
      type: String,
      enum: ['WALLET_FUNDING', 'AD_BOOST', 'SUBSCRIPTION', 'LOW_STOCK', 'EXPENSE', 'OTHER'],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    amount: { type: Number, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

activitySchema.index({ user: 1, isRead: 1, createdAt: -1 });
activitySchema.index({ user: 1, type: 1, createdAt: -1 });

export const Activity = model<IActivity>('Activity', activitySchema);
