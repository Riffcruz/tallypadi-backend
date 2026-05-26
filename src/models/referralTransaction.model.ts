import { Schema, model, Document, Types } from 'mongoose';

export type ReferralTransactionStatus =
  | 'PENDING_VERIFICATION'
  | 'PENDING_FUNDING'
  | 'REWARDED'
  | 'INELIGIBLE';

export interface IReferralTransaction extends Document {
  referrer: Types.ObjectId;
  referredUser: Types.ObjectId;
  referralCode: string;
  status: ReferralTransactionStatus;
  registeredAt: Date;
  verifiedAt?: Date | null;
  qualifiedAt?: Date | null;
  rewardedAt?: Date | null;
  fundingWalletTransaction?: Types.ObjectId | null;
  rewardWalletTransaction?: Types.ObjectId | null;
  paystackReference?: string | null;
  fundingAmountMinor: number;
  rewardAmountMinor: number;
  currency: string;
  idempotencyKey?: string | null;
  configSnapshot?: {
    enabled: boolean;
    minimumFundingAmountMinor: number;
    rewardPercentage: number;
  } | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const referralTransactionSchema = new Schema<IReferralTransaction>(
  {
    referrer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referredUser: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    referralCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    status: {
      type: String,
      enum: ['PENDING_VERIFICATION', 'PENDING_FUNDING', 'REWARDED', 'INELIGIBLE'],
      default: 'PENDING_VERIFICATION',
      index: true,
    },
    registeredAt: { type: Date, required: true, default: Date.now },
    verifiedAt: { type: Date, default: null },
    qualifiedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },
    fundingWalletTransaction: { type: Schema.Types.ObjectId, ref: 'WalletTransaction', default: null, index: true },
    rewardWalletTransaction: { type: Schema.Types.ObjectId, ref: 'WalletTransaction', default: null, index: true },
    paystackReference: { type: String, default: null, trim: true, index: true },
    fundingAmountMinor: { type: Number, required: true, min: 0, default: 0 },
    rewardAmountMinor: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'NGN' },
    idempotencyKey: { type: String, trim: true, default: null },
    configSnapshot: {
      enabled: { type: Boolean, default: true },
      minimumFundingAmountMinor: { type: Number, default: 0 },
      rewardPercentage: { type: Number, default: 0 },
    },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

referralTransactionSchema.index({ referrer: 1, status: 1, createdAt: -1 });
referralTransactionSchema.index({ status: 1, createdAt: -1 });
referralTransactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const ReferralTransaction = model<IReferralTransaction>('ReferralTransaction', referralTransactionSchema);
