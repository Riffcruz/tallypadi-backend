import { Schema, model, Document, Types } from 'mongoose';

export interface INotificationLog extends Document {
  user?: Types.ObjectId | null;
  admin?: Types.ObjectId | null;
  campaign?: Types.ObjectId | null;
  campaignRun?: Types.ObjectId | null;
  providerCampaign?: Types.ObjectId | null;
  type: string;
  channel: 'EMAIL' | 'IN_APP';
  recipient: string;
  subject?: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  idempotencyKey: string;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationLogSchema = new Schema<INotificationLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    admin: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', default: null, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', default: null, index: true },
    providerCampaign: { type: Schema.Types.ObjectId, ref: 'ProviderCampaign', default: null, index: true },
    type: { type: String, required: true, trim: true, index: true },
    channel: { type: String, enum: ['EMAIL', 'IN_APP'], required: true },
    recipient: { type: String, required: true, trim: true },
    subject: { type: String, trim: true },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'], default: 'PENDING', index: true },
    idempotencyKey: { type: String, required: true, trim: true },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationLogSchema.index({ idempotencyKey: 1 }, { unique: true });

export const NotificationLog = model<INotificationLog>('NotificationLog', notificationLogSchema);
