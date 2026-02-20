import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomer extends Document {
  shopId: mongoose.Types.ObjectId;
  name: string;
  phoneNumber: string;
  royaltyPoints: number;
  totalSpent: number;
  lastPurchaseAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema: Schema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    royaltyPoints: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastPurchaseAt: { type: Date },
  },
  { timestamps: true }
);

// Ensure a customer phone number is unique PER shop. 
// A user might be a customer of Shop A and Shop B, so global uniqueness is wrong.
CustomerSchema.index({ shopId: 1, phoneNumber: 1 }, { unique: true });
// Fast text search by name/phone for the POS lookup
CustomerSchema.index({ shopId: 1, name: 'text', phoneNumber: 'text' });

export const Customer = mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema);
