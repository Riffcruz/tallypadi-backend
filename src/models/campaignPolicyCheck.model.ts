import { Schema, model, Document, Types } from 'mongoose';

export interface ICampaignPolicyCheck extends Document {
  campaign: Types.ObjectId;
  campaignRun: Types.ObjectId;
  productCategory?: string;
  restrictedProductDetected: boolean;
  prohibitedWordsDetected: string[];
  landingPageValid: boolean;
  sellerVerified: boolean;
  policyRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  result: 'PASS' | 'NEEDS_REVIEW' | 'BLOCKED';
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const campaignPolicyCheckSchema = new Schema<ICampaignPolicyCheck>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', required: true, index: true },
    productCategory: { type: String, trim: true, default: '' },
    restrictedProductDetected: { type: Boolean, default: false },
    prohibitedWordsDetected: [{ type: String, trim: true, maxlength: 120 }],
    landingPageValid: { type: Boolean, default: true },
    sellerVerified: { type: Boolean, default: false },
    policyRiskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW', index: true },
    result: { type: String, enum: ['PASS', 'NEEDS_REVIEW', 'BLOCKED'], default: 'PASS', index: true },
    notes: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

campaignPolicyCheckSchema.index({ campaignRun: 1, createdAt: -1 });

export const CampaignPolicyCheck = model<ICampaignPolicyCheck>('CampaignPolicyCheck', campaignPolicyCheckSchema);
