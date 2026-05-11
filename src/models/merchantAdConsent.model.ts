import { Schema, model, Document, Types } from 'mongoose';

export interface IMerchantAdConsent extends Document {
  user: Types.ObjectId;
  campaign: Types.ObjectId;
  campaignRun: Types.ObjectId;
  acceptedTermsVersion: string;
  acceptedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const merchantAdConsentSchema = new Schema<IMerchantAdConsent>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', required: true, index: true },
    acceptedTermsVersion: { type: String, required: true, trim: true },
    acceptedAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: null, trim: true },
    userAgent: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

merchantAdConsentSchema.index({ user: 1, campaignRun: 1 }, { unique: true });

export const MerchantAdConsent = model<IMerchantAdConsent>('MerchantAdConsent', merchantAdConsentSchema);
