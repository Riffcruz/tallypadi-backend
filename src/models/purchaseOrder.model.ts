import { Schema, model, Document, Types } from 'mongoose';

export type PurchaseOrderStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export interface IPurchaseOrder extends Document {
  owner: Types.ObjectId;
  reference: string;
  supplier: Types.ObjectId;
  destination: Types.ObjectId;
  status: PurchaseOrderStatus;
  expectedAt?: Date | null;
  notes?: string;
  items: Array<{ product: Types.ObjectId; name: string; orderedQty: number; receivedQty: number; unitCost: number }>;
  subtotal: number;
  createdBy: Types.ObjectId;
  orderedAt?: Date | null;
  receivedAt?: Date | null;
  cancelledAt?: Date | null;
  events: Array<{ action: string; actor: Types.ObjectId; at: Date; note?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseOrderSchema = new Schema<IPurchaseOrder>({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reference: { type: String, required: true, unique: true, uppercase: true, trim: true },
  supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  destination: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'], default: 'DRAFT', index: true },
  expectedAt: { type: Date, default: null },
  notes: { type: String, trim: true, maxlength: 500 },
  items: [{
    _id: false,
    product: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true },
    name: { type: String, required: true, trim: true },
    orderedQty: { type: Number, required: true, min: 1, validate: { validator: Number.isSafeInteger, message: 'Ordered quantity must be a whole number.' } },
    receivedQty: { type: Number, default: 0, min: 0, validate: { validator: Number.isSafeInteger, message: 'Received quantity must be a whole number.' } },
    unitCost: { type: Number, required: true, min: 0 },
  }],
  subtotal: { type: Number, required: true, min: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  orderedAt: { type: Date, default: null },
  receivedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  events: [{ _id: false, action: { type: String, required: true }, actor: { type: Schema.Types.ObjectId, ref: 'User', required: true }, at: { type: Date, default: Date.now }, note: { type: String, maxlength: 500 } }],
}, { timestamps: true });

purchaseOrderSchema.index({ owner: 1, createdAt: -1 });
purchaseOrderSchema.index({ owner: 1, status: 1, createdAt: -1 });

export const PurchaseOrder = model<IPurchaseOrder>('PurchaseOrder', purchaseOrderSchema);
