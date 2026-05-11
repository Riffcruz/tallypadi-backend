import { Schema, model, Document, Types } from 'mongoose';
import { AD_PROVIDERS, AdProvider } from '../types/ads';

export interface ICampaignAttribution extends Document {
  campaign: Types.ObjectId;
  campaignRun: Types.ObjectId;
  provider: AdProvider;
  providerCampaign?: Types.ObjectId | null;
  product: Types.ObjectId;
  sessionId?: string | null;
  user?: Types.ObjectId | null;
  clickId?: string | null;
  order?: Types.ObjectId | null;
  eventType: 'PRODUCT_VIEW' | 'SHOP_VISIT' | 'ADD_TO_CART' | 'ORDER';
  attributedRevenueMinor?: number;
  currency?: string;
  attributionWindowDays: number;
  createdAt: Date;
  updatedAt: Date;
}

const campaignAttributionSchema = new Schema<ICampaignAttribution>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', required: true, index: true },
    provider: { type: String, enum: AD_PROVIDERS, required: true, index: true },
    providerCampaign: { type: Schema.Types.ObjectId, ref: 'ProviderCampaign', default: null },
    product: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true, index: true },
    sessionId: { type: String, default: null, trim: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    clickId: { type: String, default: null, trim: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    eventType: { type: String, enum: ['PRODUCT_VIEW', 'SHOP_VISIT', 'ADD_TO_CART', 'ORDER'], required: true, index: true },
    attributedRevenueMinor: { type: Number, default: 0, min: 0 },
    currency: { type: String, uppercase: true, trim: true, default: 'NGN' },
    attributionWindowDays: { type: Number, default: 7, min: 1 },
  },
  { timestamps: true }
);

campaignAttributionSchema.index({ campaignRun: 1, eventType: 1, createdAt: -1 });

export const CampaignAttribution = model<ICampaignAttribution>('CampaignAttribution', campaignAttributionSchema);
