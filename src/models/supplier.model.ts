import { Schema, model, Document, Types } from 'mongoose';

export interface ISupplier extends Document {
  owner: Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 40 },
  email: { type: String, trim: true, lowercase: true, maxlength: 160 },
  address: { type: String, trim: true, maxlength: 300 },
  notes: { type: String, trim: true, maxlength: 500 },
  isArchived: { type: Boolean, default: false, index: true },
}, { timestamps: true });

supplierSchema.index({ owner: 1, name: 1 }, { unique: true });

export const Supplier = model<ISupplier>('Supplier', supplierSchema);
