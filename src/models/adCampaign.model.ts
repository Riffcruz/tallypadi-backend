import { Schema, model, Document, Types } from 'mongoose';

export type AdPlatform = 'TALLYPADI_SEO' | 'META' | 'TIKTOK';
export type AdCampaignStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'REJECTED';

export interface IAdCampaign extends Document {
  user: Types.ObjectId;
  product: Types.ObjectId;
  status: AdCampaignStatus;
  platforms: AdPlatform[];
  planId: string;
  planLabel: string;
  durationDays: number;
  basePrice: number;
  budget: number;
  walletCharged: boolean;
  walletBalanceAfterCharge?: number | null;
  refundAmount?: number | null;
  requestedAt: Date;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  startedAt?: Date | null;
  expiresAt?: Date | null;
  completedAt?: Date | null;
  rejectionReason?: string | null;
  productSnapshot: {
    name: string;
    description?: string;
    image?: string | null;
    price?: number;
    category?: string | null;
  };
  adDetails?: {
    brief?: string;
    audience?: string;
    keywords?: string[];
  };
  seo?: {
    title?: string;
    metaDescription?: string;
    adDescription?: string;
    keywords?: string[];
    generatedAt?: Date | null;
    source?: 'AI' | 'FALLBACK' | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const adCampaignSchema = new Schema<IAdCampaign>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'RUNNING', 'COMPLETED', 'REJECTED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    platforms: [{
      type: String,
      enum: ['TALLYPADI_SEO', 'META', 'TIKTOK'],
      required: true,
    }],
    planId: { type: String, required: true, trim: true },
    planLabel: { type: String, required: true, trim: true },
    durationDays: { type: Number, required: true, min: 1 },
    basePrice: { type: Number, required: true, min: 0 },
    budget: { type: Number, required: true, min: 0 },
    walletCharged: { type: Boolean, default: false },
    walletBalanceAfterCharge: { type: Number, default: null },
    refundAmount: { type: Number, default: null },
    requestedAt: { type: Date, default: Date.now, index: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, trim: true, maxlength: 500 },
    productSnapshot: {
      name: { type: String, required: true, trim: true },
      description: { type: String, default: '', trim: true },
      image: { type: String, default: null },
      price: { type: Number, default: 0 },
      category: { type: String, default: null },
    },
    adDetails: {
      brief: { type: String, default: '', trim: true, maxlength: 1000 },
      audience: { type: String, default: '', trim: true, maxlength: 300 },
      keywords: [{ type: String, trim: true, maxlength: 60 }],
    },
    seo: {
      title: { type: String, default: '', trim: true, maxlength: 120 },
      metaDescription: { type: String, default: '', trim: true, maxlength: 220 },
      adDescription: { type: String, default: '', trim: true, maxlength: 1000 },
      keywords: [{ type: String, trim: true, maxlength: 60 }],
      generatedAt: { type: Date, default: null },
      source: { type: String, enum: ['AI', 'FALLBACK', null], default: null },
    },
  },
  { timestamps: true }
);

adCampaignSchema.index({ user: 1, status: 1, createdAt: -1 });
adCampaignSchema.index({ status: 1, createdAt: -1 });
adCampaignSchema.index({ status: 1, expiresAt: 1 });
adCampaignSchema.index({ product: 1, status: 1 });

export const AdCampaign = model<IAdCampaign>('AdCampaign', adCampaignSchema);
