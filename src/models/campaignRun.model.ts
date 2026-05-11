import { Schema, model, Document, Types } from 'mongoose';
import { AD_PROVIDERS, AdProvider, CampaignRunStatus } from '../types/ads';

export interface ICampaignRun extends Document {
  campaign: Types.ObjectId;
  user: Types.ObjectId;
  product?: Types.ObjectId | null;
  runNumber: number;
  status: CampaignRunStatus;
  grossBudgetMinor: number;
  serviceFeeMinor: number;
  netCampaignBudgetMinor: number;
  safetyReserveMinor: number;
  fxBufferMinor: number;
  adSpendBudgetMinor: number;
  unallocatedBudgetMinor: number;
  walletCurrency: string;
  budgetSplit: {
    provider: AdProvider;
    weight: number;
    allocationMinor: number;
  }[];
  selectedProviders: AdProvider[];
  startsAt?: Date | null;
  endsAt?: Date | null;
  durationDays: number;
  spentAmountMinor: number;
  remainingBudgetMinor: number;
  serviceFeeBasisPoints: number;
  safetyReserveBasisPoints: number;
  fxBufferBasisPoints: number;
  lowBudgetAlertThresholdBasisPoints: number;
  wallet?: Types.ObjectId | null;
  walletReservationTransaction?: Types.ObjectId | null;
  approvedAt?: Date | null;
  approvedBy?: Types.ObjectId | null;
  completedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const runStatuses: CampaignRunStatus[] = [
  'PENDING_ADMIN_REVIEW',
  'APPROVED_BY_TALLYPADI',
  'SUBMITTING_TO_PROVIDERS',
  'STARTING_SOON',
  'ACTIVE',
  'ACTIVE_WITH_PENDING_CHANGES',
  'PARTIALLY_ACTIVE',
  'PARTIALLY_REJECTED',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
];

const campaignRunSchema = new Schema<ICampaignRun>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Inventory', default: null, index: true },
    runNumber: { type: Number, required: true, min: 1 },
    status: { type: String, enum: runStatuses, required: true, default: 'PENDING_ADMIN_REVIEW', index: true },
    grossBudgetMinor: { type: Number, required: true, min: 0 },
    serviceFeeMinor: { type: Number, required: true, min: 0 },
    netCampaignBudgetMinor: { type: Number, required: true, min: 0 },
    safetyReserveMinor: { type: Number, required: true, min: 0 },
    fxBufferMinor: { type: Number, required: true, min: 0, default: 0 },
    adSpendBudgetMinor: { type: Number, required: true, min: 0 },
    unallocatedBudgetMinor: { type: Number, required: true, min: 0, default: 0 },
    walletCurrency: { type: String, uppercase: true, trim: true, default: 'NGN' },
    budgetSplit: [{
      provider: { type: String, enum: AD_PROVIDERS, required: true },
      weight: { type: Number, min: 0, required: true },
      allocationMinor: { type: Number, min: 0, required: true },
    }],
    selectedProviders: [{ type: String, enum: AD_PROVIDERS }],
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null, index: true },
    durationDays: { type: Number, required: true, min: 1 },
    spentAmountMinor: { type: Number, default: 0, min: 0 },
    remainingBudgetMinor: { type: Number, default: 0, min: 0 },
    serviceFeeBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
    safetyReserveBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
    fxBufferBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
    lowBudgetAlertThresholdBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
    wallet: { type: Schema.Types.ObjectId, ref: 'Wallet', default: null },
    walletReservationTransaction: { type: Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true }
);

campaignRunSchema.index({ campaign: 1, runNumber: 1 }, { unique: true });
campaignRunSchema.index({ user: 1, status: 1, createdAt: -1 });
campaignRunSchema.index({ status: 1, endsAt: 1 });

export const CampaignRun = model<ICampaignRun>('CampaignRun', campaignRunSchema);
