import { Schema, model, Document, Types } from 'mongoose';

export type StockTransferStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'RECEIVED'
  | 'CANCELLED'
  | 'REJECTED';

export interface IStockTransfer extends Document {
  hq: Types.ObjectId;
  reference: string;
  fromLocation: Types.ObjectId;
  toLocation: Types.ObjectId;
  item: Types.ObjectId;
  itemName: string;
  quantity: number;
  status: StockTransferStatus;
  note?: string;
  requestedBy: Types.ObjectId;
  approvedBy?: Types.ObjectId | null;
  dispatchedBy?: Types.ObjectId | null;
  receivedBy?: Types.ObjectId | null;
  cancelledBy?: Types.ObjectId | null;
  approvedAt?: Date | null;
  dispatchedAt?: Date | null;
  receivedAt?: Date | null;
  cancelledAt?: Date | null;
  events: Array<{
    action: string;
    actor: Types.ObjectId;
    at: Date;
    note?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const stockTransferSchema = new Schema<IStockTransfer>(
  {
    hq: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reference: { type: String, required: true, unique: true, uppercase: true, trim: true },
    fromLocation: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    toLocation: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    item: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true },
    itemName: { type: String, required: true, trim: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'Quantity must be a whole number.' },
    },
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'DISPATCHED', 'RECEIVED', 'CANCELLED', 'REJECTED'],
      default: 'REQUESTED',
      index: true,
    },
    note: { type: String, trim: true, maxlength: 500 },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatchedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    events: [{
      _id: false,
      action: { type: String, required: true },
      actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      at: { type: Date, default: Date.now },
      note: { type: String, trim: true, maxlength: 500 },
    }],
  },
  { timestamps: true }
);

stockTransferSchema.index({ hq: 1, createdAt: -1 });
stockTransferSchema.index({ hq: 1, status: 1, createdAt: -1 });

export const StockTransfer = model<IStockTransfer>('StockTransfer', stockTransferSchema);
