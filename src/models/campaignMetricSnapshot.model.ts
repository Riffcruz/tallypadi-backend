import { Schema, model, Document, Types } from 'mongoose';
import { AD_PROVIDERS, AdProvider, MetricSource } from '../types/ads';

export interface ICampaignMetricSnapshot extends Document {
  campaign: Types.ObjectId;
  campaignRun: Types.ObjectId;
  providerCampaign?: Types.ObjectId | null;
  provider: AdProvider;
  source: MetricSource;
  date: string;
  impressions: number;
  clicks: number;
  views: number;
  conversions: number;
  allConversions: number;
  spendMinor: number;
  currency: string;
  ctr: number;
  cpc: number;
  productPageViews?: number;
  shopVisits?: number;
  addToCartCount?: number;
  orderCount?: number;
  attributedRevenueMinor?: number;
  createdAt: Date;
  updatedAt: Date;
}

const campaignMetricSnapshotSchema = new Schema<ICampaignMetricSnapshot>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', required: true, index: true },
    providerCampaign: { type: Schema.Types.ObjectId, ref: 'ProviderCampaign', default: null, index: true },
    provider: { type: String, enum: AD_PROVIDERS, required: true, index: true },
    source: { type: String, enum: ['INTERNAL', 'MANUAL_ADMIN', 'PROVIDER_API'], required: true },
    date: { type: String, required: true, index: true },
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    conversions: { type: Number, default: 0, min: 0 },
    allConversions: { type: Number, default: 0, min: 0 },
    spendMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, uppercase: true, trim: true, default: 'NGN' },
    ctr: { type: Number, default: 0, min: 0 },
    cpc: { type: Number, default: 0, min: 0 },
    productPageViews: { type: Number, default: 0, min: 0 },
    shopVisits: { type: Number, default: 0, min: 0 },
    addToCartCount: { type: Number, default: 0, min: 0 },
    orderCount: { type: Number, default: 0, min: 0 },
    attributedRevenueMinor: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

campaignMetricSnapshotSchema.index({ campaignRun: 1, provider: 1, date: 1 });

export const CampaignMetricSnapshot = model<ICampaignMetricSnapshot>('CampaignMetricSnapshot', campaignMetricSnapshotSchema);
