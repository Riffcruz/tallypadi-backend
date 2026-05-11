import { Schema, model, Document } from 'mongoose';

export interface IBoostSettings extends Document {
  currency: string;
  minimumGrossBudgetMinor: number;
  minimumDurationDays: number;
  maximumDurationDays: number;
  minimumProviderAllocationMinor: number;
  serviceFeeBasisPoints: number;
  safetyReserveBasisPoints: number;
  fxBufferBasisPoints: number;
  lowBudgetAlertThresholdBasisPoints: number;
  paidProviderWeights: {
    META_ADS: number;
    TIKTOK_ADS: number;
    GOOGLE_ADS: number;
  };
  internalBoostConsumesExternalBudget: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const boostSettingsSchema = new Schema<IBoostSettings>(
  {
    currency: { type: String, uppercase: true, trim: true, default: 'NGN', unique: true },
    minimumGrossBudgetMinor: { type: Number, default: 5_000_000, min: 0 },
    minimumDurationDays: { type: Number, default: 3, min: 1 },
    maximumDurationDays: { type: Number, default: 30, min: 1 },
    minimumProviderAllocationMinor: { type: Number, default: 1_000_000, min: 0 },
    serviceFeeBasisPoints: { type: Number, default: 1000, min: 0, max: 10000 },
    safetyReserveBasisPoints: { type: Number, default: 150, min: 0, max: 10000 },
    fxBufferBasisPoints: { type: Number, default: 300, min: 0, max: 10000 },
    lowBudgetAlertThresholdBasisPoints: { type: Number, default: 1000, min: 0, max: 10000 },
    paidProviderWeights: {
      META_ADS: { type: Number, default: 40, min: 0 },
      TIKTOK_ADS: { type: Number, default: 30, min: 0 },
      GOOGLE_ADS: { type: Number, default: 20, min: 0 },
    },
    internalBoostConsumesExternalBudget: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const BoostSettings = model<IBoostSettings>('BoostSettings', boostSettingsSchema);
