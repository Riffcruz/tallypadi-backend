import { Schema, model, Document } from 'mongoose';
import { AD_PROVIDERS, AdProvider } from '../types/ads';

export interface IAdProviderAccount extends Document {
  provider: AdProvider;
  accountName: string;
  externalAccountId?: string | null;
  billingCurrency: string;
  country: string;
  fulfillmentModeSupported: 'MANUAL_ONLY' | 'AUTO_SUPPORTED';
  apiCredentialsConfigured: boolean;
  webhookConfigured: boolean;
  isActive: boolean;
  dailySpendLimitMinor?: number | null;
  monthlySpendLimitMinor?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const adProviderAccountSchema = new Schema<IAdProviderAccount>(
  {
    provider: { type: String, enum: AD_PROVIDERS, required: true, index: true },
    accountName: { type: String, required: true, trim: true },
    externalAccountId: { type: String, default: null, trim: true },
    billingCurrency: { type: String, uppercase: true, trim: true, default: 'NGN' },
    country: { type: String, uppercase: true, trim: true, default: 'NG' },
    fulfillmentModeSupported: { type: String, enum: ['MANUAL_ONLY', 'AUTO_SUPPORTED'], default: 'MANUAL_ONLY' },
    apiCredentialsConfigured: { type: Boolean, default: false },
    webhookConfigured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    dailySpendLimitMinor: { type: Number, default: null },
    monthlySpendLimitMinor: { type: Number, default: null },
  },
  { timestamps: true }
);

adProviderAccountSchema.index({ provider: 1, externalAccountId: 1 });

export const AdProviderAccount = model<IAdProviderAccount>('AdProviderAccount', adProviderAccountSchema);
