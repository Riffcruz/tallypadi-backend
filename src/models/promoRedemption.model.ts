import { Document, Schema, Types, model } from 'mongoose';

export interface IPromoRedemption extends Document {
  promoCode: Types.ObjectId;
  user: Types.ObjectId;
  phoneNumber: string;
  code: string;
  channel: 'WEB' | 'WHATSAPP';
  status: 'PENDING' | 'APPLIED';
  previousPlan?: string | null;
  previousSubscriptionStatus?: string | null;
  previousExpiry?: Date | null;
  appliedPlan?: string | null;
  appliedExpiry?: Date | null;
  redeemedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const promoRedemptionSchema = new Schema<IPromoRedemption>(
  {
    promoCode: { type: Schema.Types.ObjectId, ref: 'PromoCode', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    phoneNumber: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true, index: true },
    channel: { type: String, enum: ['WEB', 'WHATSAPP'], required: true },
    status: { type: String, enum: ['PENDING', 'APPLIED'], default: 'PENDING', index: true },
    previousPlan: { type: String, default: null },
    previousSubscriptionStatus: { type: String, default: null },
    previousExpiry: { type: Date, default: null },
    appliedPlan: { type: String, default: null },
    appliedExpiry: { type: Date, default: null },
    redeemedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// The database, not the browser or bot, is the final double-redemption guard.
promoRedemptionSchema.index({ promoCode: 1, user: 1 }, { unique: true });
promoRedemptionSchema.index({ promoCode: 1, phoneNumber: 1 }, { unique: true });
promoRedemptionSchema.index({ promoCode: 1, status: 1, redeemedAt: -1 });

export const PromoRedemption = model<IPromoRedemption>('PromoRedemption', promoRedemptionSchema);
