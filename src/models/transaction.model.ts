import { Schema, model, Document, Types } from 'mongoose';

export interface ITransactionItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number | null;
  total: number | null;
}

export interface ITransaction extends Document {
  user: Types.ObjectId; // ✅ shop owner id (NOT staff id)
  type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'PAYMENT_RECEIVED';
  paymentStatus: 'PAID' | 'CREDIT';

  items: ITransactionItem[];
  totalMoney: number | null;

  // ✅ debtor linkage
  debtorId?: Types.ObjectId | null;
  customerName?: string | null;   // readable label
  customerKey?: string | null;    // normalized key (optional but useful)

  // ✅ debt settlement fields
  amountPaid: number;
  balance: number;
  settledAt?: Date | null;

  // ✅ undo fields
  isUndone: boolean;
  undoneAt?: Date | null;
  undoneByMessageId?: string | null;

  timestamp: Date;
  date: string;
  messageId?: string;



}

const transactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['SALE', 'RESTOCK', 'ADJUSTMENT', 'PAYMENT_RECEIVED'], required: true },
    paymentStatus: { type: String, enum: ['PAID', 'CREDIT'], default: 'PAID' },

    items: [
      {
        name: String,
        qty: Number,
        unit: { type: String, default: '' },
        unitPrice: { type: Number, default: null },
        total: { type: Number, default: null },
      },
    ],

    totalMoney: { type: Number, default: null },

    debtorId: { type: Schema.Types.ObjectId, ref: 'Debtor', default: null, index: true },
    customerName: { type: String, default: null, index: true },
    customerKey: { type: String, default: null, index: true },

    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0, index: true },
    settledAt: { type: Date, default: null },

    isUndone: { type: Boolean, default: false, index: true },
    undoneAt: { type: Date, default: null },
    undoneByMessageId: { type: String, default: null },

    timestamp: { type: Date, default: Date.now },
    date: { type: String, required: true },
    messageId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

export const Transaction = model<ITransaction>('Transaction', transactionSchema);
