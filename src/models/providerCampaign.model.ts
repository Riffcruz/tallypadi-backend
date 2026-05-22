import { Schema, model, Document, Types } from 'mongoose';
import {
  AD_PROVIDERS,
  AdProvider,
  FulfillmentMode,
  ProviderCampaignStatus,
  ProviderRefundStatus,
  SettlementStatus,
} from '../types/ads';

export interface IProviderCampaign extends Document {
  campaign: Types.ObjectId;
  campaignRun: Types.ObjectId;
  user: Types.ObjectId;
  provider: AdProvider;
  status: ProviderCampaignStatus;
  fulfillmentMode: FulfillmentMode;
  allocatedBudgetWalletMinor: number;
  spentWalletMinor: number;
  remainingBudgetWalletMinor: number;
  walletCurrency: string;
  providerBillingCurrency?: string | null;
  allocatedBudgetProviderMinor?: number | null;
  spentProviderMinor?: number | null;
  remainingProviderMinor?: number | null;
  exchangeRate?: number | null;
  exchangeRateSource?: string | null;
  exchangeRateLockedAt?: Date | null;
  fxBufferMinor?: number | null;
  externalAccountId?: string | null;
  externalCampaignId?: string | null;
  externalAdSetId?: string | null;
  externalAdGroupId?: string | null;
  externalAdId?: string | null;
  adPreviewUrl?: string | null;
  providerReviewStatus?: string | null;
  rejectionReason?: string | null;
  rejectionPolicyTopics?: string[];
  rejectionEvidence?: string | null;
  rejectedAt?: Date | null;
  refundStatus: ProviderRefundStatus;
  settlementStatus: SettlementStatus;
  impressions: number;
  clicks: number;
  views: number;
  conversions: number;
  allConversions: number;
  ctr: number;
  cpc: number;
  adminNotes?: string | null;
  providerError?: string | null;
  lastSyncedAt?: Date | null;
  campaignVersion: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const providerStatuses: ProviderCampaignStatus[] = [
  'PENDING_TALLYPADI_REVIEW',
  'READY_TO_SUBMIT',
  'SUBMITTED_TO_PROVIDER',
  'PROVIDER_REVIEW',
  'APPROVED_BY_PROVIDER',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'REJECTED_BY_PROVIDER',
  'FAILED',
  'CANCELLED',
];

const providerCampaignSchema = new Schema<IProviderCampaign>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: AD_PROVIDERS, required: true, index: true },
    status: { type: String, enum: providerStatuses, default: 'PENDING_TALLYPADI_REVIEW', required: true, index: true },
    fulfillmentMode: { type: String, enum: ['MANUAL', 'AUTO'], default: 'MANUAL', required: true },
    allocatedBudgetWalletMinor: { type: Number, default: 0, min: 0 },
    spentWalletMinor: { type: Number, default: 0, min: 0 },
    remainingBudgetWalletMinor: { type: Number, default: 0, min: 0 },
    walletCurrency: { type: String, uppercase: true, trim: true, default: 'NGN' },
    providerBillingCurrency: { type: String, uppercase: true, trim: true, default: null },
    allocatedBudgetProviderMinor: { type: Number, default: null },
    spentProviderMinor: { type: Number, default: null },
    remainingProviderMinor: { type: Number, default: null },
    exchangeRate: { type: Number, default: null },
    exchangeRateSource: { type: String, default: null },
    exchangeRateLockedAt: { type: Date, default: null },
    fxBufferMinor: { type: Number, default: null },
    externalAccountId: { type: String, default: null, trim: true },
    externalCampaignId: { type: String, default: null, trim: true },
    externalAdSetId: { type: String, default: null, trim: true },
    externalAdGroupId: { type: String, default: null, trim: true },
    externalAdId: { type: String, default: null, trim: true },
    adPreviewUrl: { type: String, default: null, trim: true },
    providerReviewStatus: { type: String, default: null, trim: true },
    rejectionReason: { type: String, default: null, trim: true, maxlength: 1000 },
    rejectionPolicyTopics: [{ type: String, trim: true, maxlength: 120 }],
    rejectionEvidence: { type: String, default: null, trim: true, maxlength: 2000 },
    rejectedAt: { type: Date, default: null },
    refundStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'HELD', 'PENDING_REFUND', 'REFUNDED', 'REALLOCATED', 'HELD_FOR_RESUBMISSION'],
      default: 'NOT_APPLICABLE',
      index: true,
    },
    settlementStatus: { type: String, enum: ['PENDING', 'RECONCILED', 'FX_GAIN', 'FX_LOSS'], default: 'PENDING' },
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    conversions: { type: Number, default: 0, min: 0 },
    allConversions: { type: Number, default: 0, min: 0 },
    ctr: { type: Number, default: 0, min: 0 },
    cpc: { type: Number, default: 0, min: 0 },
    adminNotes: { type: String, default: null, trim: true, maxlength: 2000 },
    providerError: { type: String, default: null, trim: true, maxlength: 2000 },
    lastSyncedAt: { type: Date, default: null },
    campaignVersion: { type: Number, default: 1 },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

providerCampaignSchema.index({ campaignRun: 1, provider: 1 }, { unique: true });
providerCampaignSchema.index({ provider: 1, status: 1, updatedAt: -1 });

export const ProviderCampaign = model<IProviderCampaign>('ProviderCampaign', providerCampaignSchema);
