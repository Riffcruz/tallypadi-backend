import { Schema, model, Document, Types } from 'mongoose';
import { AD_PROVIDERS, AdCampaignStatus, AdProvider } from '../types/ads';

export type { AdCampaignStatus } from '../types/ads';
export type AdPlatform = AdProvider | 'TALLYPADI_SEO' | 'META' | 'TIKTOK';

export interface IAdCampaign extends Document {
  user: Types.ObjectId;
  product?: Types.ObjectId | null;
  campaignType: 'PRODUCT_BOOST' | 'CUSTOM_CAMPAIGN';
  status: AdCampaignStatus;
  name?: string;
  activeRunId?: Types.ObjectId | null;
  latestRunId?: Types.ObjectId | null;
  selectedProviders?: AdProvider[];
  walletCurrency?: string;
  targetAudience?: string;
  targetLocation?: {
    country?: string;
    state?: string;
    city?: string;
  };
  ageRange?: {
    min?: number | null;
    max?: number | null;
  };
  campaignGoal?: string;
  keywords?: string[];
  creativeNotes?: string;
  merchantConsentAccepted?: boolean;
  merchantConsentVersion?: string | null;
  adminNotes?: string | null;
  rejectionReason?: string | null;
  previewUrls?: { provider: string; url: string }[];
  globalLandingPageUrl?: string;
  providerLandingPageUrls?: Map<string, string>;
  version: number;

  // Legacy fields kept so old records and existing serializers do not explode during rollout.
  platforms?: AdPlatform[];
  planId?: string;
  planLabel?: string;
  durationDays?: number;
  basePrice?: number;
  budget?: number;
  walletCharged?: boolean;
  walletBalanceAfterCharge?: number | null;
  refundAmount?: number | null;
  requestedAt?: Date;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  startedAt?: Date | null;
  expiresAt?: Date | null;
  completedAt?: Date | null;
  productSnapshot?: {
    name?: string;
    description?: string;
    image?: string | null;
    price?: number;
    category?: string | null;
  };
  adDetails?: {
    brief?: string;
    audience?: string;
    keywords?: string[];
    budgetType?: 'DAILY' | 'TOTAL';
    startDate?: string;
    endDate?: string;
    adDescription?: string;
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

const legacyPlatformValues = ['TALLYPADI_SEO', 'META', 'TIKTOK'];
const statusValues: AdCampaignStatus[] = [
  'DRAFT',
  'PENDING_ADMIN_REVIEW',
  'REJECTED_BY_TALLYPADI',
  'APPROVED_BY_TALLYPADI',
  'SUBMITTING_TO_PROVIDERS',
  'STARTING_SOON',
  'ACTIVE',
  'ACTIVE_WITH_PENDING_CHANGES',
  'PARTIALLY_ACTIVE',
  'PARTIALLY_REJECTED',
  'PAUSED',
  'REQUIRES_REVIEW_AFTER_EDIT',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
  'PENDING',
  'RUNNING',
  'REJECTED',
];

const adCampaignSchema = new Schema<IAdCampaign>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Inventory', default: null, index: true },
    campaignType: {
      type: String,
      enum: ['PRODUCT_BOOST', 'CUSTOM_CAMPAIGN'],
      default: 'PRODUCT_BOOST',
      required: true,
      index: true,
    },
    status: { type: String, enum: statusValues, default: 'PENDING_ADMIN_REVIEW', required: true, index: true },
    name: { type: String, trim: true, maxlength: 160 },
    activeRunId: { type: Schema.Types.ObjectId, ref: 'CampaignRun', default: null, index: true },
    latestRunId: { type: Schema.Types.ObjectId, ref: 'CampaignRun', default: null, index: true },
    selectedProviders: [{ type: String, enum: AD_PROVIDERS }],
    walletCurrency: { type: String, uppercase: true, trim: true, default: 'NGN' },
    targetAudience: { type: String, trim: true, maxlength: 500, default: '' },
    targetLocation: {
      country: { type: String, trim: true, uppercase: true, default: 'NG' },
      state: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
    },
    ageRange: {
      min: { type: Number, default: null, min: 13, max: 100 },
      max: { type: Number, default: null, min: 13, max: 100 },
    },
    campaignGoal: { type: String, trim: true, maxlength: 120, default: '' },
    keywords: [{ type: String, trim: true, maxlength: 60 }],
    creativeNotes: { type: String, trim: true, maxlength: 1000, default: '' },
    merchantConsentAccepted: { type: Boolean, default: false },
    merchantConsentVersion: { type: String, default: null },
    adminNotes: { type: String, default: null, trim: true, maxlength: 2000 },
    rejectionReason: { type: String, default: null, trim: true, maxlength: 500 },
    previewUrls: [
      {
        provider: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    globalLandingPageUrl: { type: String, trim: true, default: '' },
    providerLandingPageUrls: { type: Map, of: String, default: {} },
    version: { type: Number, default: 0 },

    platforms: [{ type: String, enum: [...AD_PROVIDERS, ...legacyPlatformValues] }],
    planId: { type: String, trim: true },
    planLabel: { type: String, trim: true },
    durationDays: { type: Number, min: 1 },
    basePrice: { type: Number, min: 0 },
    budget: { type: Number, min: 0 },
    walletCharged: { type: Boolean, default: false },
    walletBalanceAfterCharge: { type: Number, default: null },
    refundAmount: { type: Number, default: null },
    requestedAt: { type: Date, default: Date.now, index: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    productSnapshot: {
      name: { type: String, trim: true, default: '' },
      description: { type: String, default: '', trim: true },
      image: { type: String, default: null },
      price: { type: Number, default: 0 },
      category: { type: String, default: null },
    },
    adDetails: {
      brief: { type: String, default: '', trim: true, maxlength: 1000 },
      audience: { type: String, default: '', trim: true, maxlength: 300 },
      keywords: [{ type: String, trim: true, maxlength: 60 }],
      budgetType: { type: String, enum: ['DAILY', 'TOTAL'], default: 'TOTAL' },
      startDate: { type: String, default: '' },
      endDate: { type: String, default: '' },
      adDescription: { type: String, default: '', trim: true, maxlength: 1000 },
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
