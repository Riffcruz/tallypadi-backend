import { Schema, model, Document } from 'mongoose';
import { AD_PROVIDERS, AdProvider } from '../types/ads';

export interface IProviderSyncStrategy extends Document {
  provider: AdProvider;
  syncMode: 'MANUAL' | 'WEBHOOK' | 'CHANGE_TRACKING_POLL' | 'SCHEDULED_RECONCILIATION';
  webhookEnabled: boolean;
  pollingIntervalMinutes?: number | null;
  lastSyncedAt?: Date | null;
  lastChangeCursor?: string | null;
  lastWebhookReceivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const providerSyncStrategySchema = new Schema<IProviderSyncStrategy>(
  {
    provider: { type: String, enum: AD_PROVIDERS, required: true, unique: true },
    syncMode: {
      type: String,
      enum: ['MANUAL', 'WEBHOOK', 'CHANGE_TRACKING_POLL', 'SCHEDULED_RECONCILIATION'],
      default: 'MANUAL',
    },
    webhookEnabled: { type: Boolean, default: false },
    pollingIntervalMinutes: { type: Number, default: null },
    lastSyncedAt: { type: Date, default: null },
    lastChangeCursor: { type: String, default: null, trim: true },
    lastWebhookReceivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const ProviderSyncStrategy = model<IProviderSyncStrategy>('ProviderSyncStrategy', providerSyncStrategySchema);
