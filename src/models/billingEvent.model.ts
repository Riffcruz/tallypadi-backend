import { Schema, model, Document, Types } from 'mongoose';

export interface IBillingEvent extends Document {
  reference: string;
  event: string;
  user?: Types.ObjectId | null;
  processedAt: Date;
  payload?: any;
}

const billingEventSchema = new Schema<IBillingEvent>(
  {
    reference: { type: String, required: true },
    event: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: { type: Date, default: Date.now },
    payload: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// ✅ prevents duplicates
billingEventSchema.index({ reference: 1, event: 1 }, { unique: true });

export const BillingEvent = model<IBillingEvent>('BillingEvent', billingEventSchema);
