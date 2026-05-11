import { Schema, model, Document, Types } from 'mongoose';

export interface IAdminAuditLog extends Document {
  admin?: Types.ObjectId | null;
  action: string;
  campaign?: Types.ObjectId | null;
  campaignRun?: Types.ObjectId | null;
  providerCampaign?: Types.ObjectId | null;
  walletTransaction?: Types.ObjectId | null;
  asset?: Types.ObjectId | null;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const adminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    admin: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action: { type: String, required: true, trim: true, index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', default: null, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', default: null, index: true },
    providerCampaign: { type: Schema.Types.ObjectId, ref: 'ProviderCampaign', default: null, index: true },
    walletTransaction: { type: Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
    asset: { type: Schema.Types.ObjectId, ref: 'CampaignCreativeAsset', default: null },
    beforeValue: { type: Schema.Types.Mixed, default: null },
    afterValue: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: null, trim: true, maxlength: 1000 },
    ipAddress: { type: String, default: null, trim: true },
    userAgent: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

adminAuditLogSchema.index({ campaign: 1, createdAt: -1 });

export const AdminAuditLog = model<IAdminAuditLog>('AdminAuditLog', adminAuditLogSchema);
