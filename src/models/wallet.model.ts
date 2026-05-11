import { Schema, model, Document, Types } from 'mongoose';

export interface IWallet extends Document {
  user: Types.ObjectId;
  currency: string;
  availableBalanceMinor: number;
  reservedBalanceMinor: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    currency: { type: String, required: true, uppercase: true, trim: true, default: 'NGN' },
    availableBalanceMinor: { type: Number, required: true, min: 0, default: 0 },
    reservedBalanceMinor: { type: Number, required: true, min: 0, default: 0 },
    version: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

walletSchema.index({ user: 1, currency: 1 }, { unique: true });

export const Wallet = model<IWallet>('Wallet', walletSchema);
