import { Schema, model, Document, Types } from 'mongoose';

export interface ITransactionItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number | null;
  total: number | null;
}

export interface ITransaction extends Document {
  user: Types.ObjectId;
  type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'PAYMENT_RECEIVED';
  paymentStatus: 'PAID' | 'CREDIT';
  items: ITransactionItem[];
  totalMoney: number | null;

  timestamp: Date;
  date: string;

  messageId?: string;
}

const transactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: {
      type: String,
      enum: ['SALE', 'RESTOCK', 'ADJUSTMENT', 'PAYMENT_RECEIVED'],
      required: true,
      index: true
    },

    paymentStatus: { type: String, enum: ['PAID', 'CREDIT'], default: 'PAID', index: true },

    items: [
      {
        name: { type: String, index: true },
        qty: Number,
        unit: { type: String, default: '' },
        unitPrice: Number,
        total: Number
      }
    ],

    totalMoney: { type: Number, default: null },

    timestamp: { type: Date, default: Date.now, index: true },
    date: { type: String, required: true, index: true },

    // Prevent duplicates (still useful for audits)
    messageId: { type: String, unique: true, sparse: true, index: true }
  },
  { timestamps: true }
);

export const Transaction = model<ITransaction>('Transaction', transactionSchema);
