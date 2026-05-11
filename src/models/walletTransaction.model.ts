import { Schema, model, Document, Types } from 'mongoose';

export type WalletTransactionType =
  | 'ADS_WALLET_TOP_UP'
  | 'CAMPAIGN_BUDGET_RESERVED'
  | 'CAMPAIGN_BUDGET_RELEASED'
  | 'SERVICE_FEE_CAPTURED'
  | 'AD_SPEND_ALLOCATED'
  | 'SAFETY_RESERVE_HELD'
  | 'FX_BUFFER_HELD'
  | 'PROVIDER_ALLOCATION_REFUNDED'
  | 'UNUSED_BUDGET_REFUNDED'
  | 'CAMPAIGN_TOP_UP'
  | 'ADMIN_ADJUSTMENT';

export interface IWalletTransaction extends Document {
  user: Types.ObjectId;
  wallet: Types.ObjectId;
  campaign?: Types.ObjectId | null;
  campaignRun?: Types.ObjectId | null;
  providerCampaign?: Types.ObjectId | null;
  type: WalletTransactionType;
  amountMinor: number;
  currency: string;
  balanceBeforeAvailableMinor: number;
  balanceAfterAvailableMinor: number;
  balanceBeforeReservedMinor: number;
  balanceAfterReservedMinor: number;
  idempotencyKey: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    wallet: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', default: null, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', default: null, index: true },
    providerCampaign: { type: Schema.Types.ObjectId, ref: 'ProviderCampaign', default: null, index: true },
    type: {
      type: String,
      enum: [
        'ADS_WALLET_TOP_UP',
        'CAMPAIGN_BUDGET_RESERVED',
        'CAMPAIGN_BUDGET_RELEASED',
        'SERVICE_FEE_CAPTURED',
        'AD_SPEND_ALLOCATED',
        'SAFETY_RESERVE_HELD',
        'FX_BUFFER_HELD',
        'PROVIDER_ALLOCATION_REFUNDED',
        'UNUSED_BUDGET_REFUNDED',
        'CAMPAIGN_TOP_UP',
        'ADMIN_ADJUSTMENT',
      ],
      required: true,
      index: true,
    },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    balanceBeforeAvailableMinor: { type: Number, required: true },
    balanceAfterAvailableMinor: { type: Number, required: true },
    balanceBeforeReservedMinor: { type: Number, required: true },
    balanceAfterReservedMinor: { type: Number, required: true },
    idempotencyKey: { type: String, required: true, trim: true },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'COMPLETED', index: true },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
walletTransactionSchema.index({ user: 1, campaign: 1, createdAt: -1 });

export const WalletTransaction = model<IWalletTransaction>('WalletTransaction', walletTransactionSchema);
