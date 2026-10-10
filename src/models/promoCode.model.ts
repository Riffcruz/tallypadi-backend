import { Document, Schema, Types, model } from 'mongoose';

export const PROMO_AUDIENCES = [
  'ALL_USERS',
  'RECENTLY_REGISTERED',
  'TYCOON_USERS',
  'OGA_BOSS_USERS',
  'ACTIVE_SUBSCRIBERS',
  'ACTIVE_TRIALS',
  'PAST_DUE_USERS',
  'EXPIRED_USERS',
  'EXPIRED_TRIALS',
  'EXPIRED_SUBSCRIPTIONS',
] as const;

export type PromoAudience = typeof PROMO_AUDIENCES[number];
export type PromoDurationUnit = 'DAYS' | 'MONTHS';
export type PromoPlan = 'OGA_BOSS' | 'TYCOON';

export interface IPromoCode extends Document {
  code: string;
  description?: string | null;
  planType: PromoPlan;
  durationValue: number;
  durationUnit: PromoDurationUnit;
  audience: PromoAudience;
  recentRegistrationDays?: number | null;
  expiresAt: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const promoCodeSchema = new Schema<IPromoCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, minlength: 4, maxlength: 32 },
    description: { type: String, default: null, trim: true, maxlength: 240 },
    planType: { type: String, enum: ['OGA_BOSS', 'TYCOON'], required: true, index: true },
    durationValue: { type: Number, required: true, min: 1, max: 3650 },
    durationUnit: { type: String, enum: ['DAYS', 'MONTHS'], required: true },
    audience: { type: String, enum: PROMO_AUDIENCES, required: true, index: true },
    recentRegistrationDays: { type: Number, default: null, min: 1, max: 365 },
    expiresAt: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

promoCodeSchema.index({ isActive: 1, expiresAt: 1 });

export const PromoCode = model<IPromoCode>('PromoCode', promoCodeSchema);
