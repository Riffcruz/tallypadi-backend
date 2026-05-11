import { Schema, model, Document, Types } from 'mongoose';
import { AD_PROVIDERS, AdProvider } from '../types/ads';

export interface IWebhookEvent extends Document {
  provider: AdProvider;
  eventType: string;
  providerObjectId?: string | null;
  campaign?: Types.ObjectId | null;
  providerCampaign?: Types.ObjectId | null;
  payload: Record<string, unknown>;
  signatureVerified: boolean;
  receivedAt: Date;
  processedAt?: Date | null;
  processingStatus: 'PENDING' | 'PROCESSED' | 'FAILED' | 'IGNORED';
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const webhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: { type: String, enum: AD_PROVIDERS, required: true, index: true },
    eventType: { type: String, required: true, trim: true, index: true },
    providerObjectId: { type: String, default: null, trim: true, index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', default: null, index: true },
    providerCampaign: { type: Schema.Types.ObjectId, ref: 'ProviderCampaign', default: null, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    signatureVerified: { type: Boolean, default: false },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    processingStatus: { type: String, enum: ['PENDING', 'PROCESSED', 'FAILED', 'IGNORED'], default: 'PENDING', index: true },
    idempotencyKey: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

webhookEventSchema.index({ idempotencyKey: 1 }, { unique: true });
webhookEventSchema.index({ provider: 1, providerObjectId: 1 });

export const WebhookEvent = model<IWebhookEvent>('WebhookEvent', webhookEventSchema);
