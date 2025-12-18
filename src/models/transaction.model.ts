import { Schema, model, Document, Types } from 'mongoose';

// 1. Item Interface (Kept yours)
export interface ITransactionItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number | null;
  total: number | null;
}

// 2. Main Interface
export interface ITransaction extends Document {
  user: Types.ObjectId; // Shop owner
  
  // ✅ ADDED 'DEBT_PAYMENT' to the list
  type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'PAYMENT_RECEIVED' | 'DEBT_PAYMENT';
  
  paymentStatus: 'PAID' | 'CREDIT' | 'PARTIAL'; // Added PARTIAL just in case

  items: ITransactionItem[];
  totalMoney: number | null;

  // ✅ DEBTOR LINKAGE
  // Kept 'debtorId' for your old code, added 'debtor' for the new controller
  debtorId?: Types.ObjectId | null; 
  debtor?: Types.ObjectId | null;   
  
  customerName?: string | null;
  customerKey?: string | null;

  // ✅ SETTLEMENT FIELDS
  amountPaid: number;
  balance: number;
  settledAt?: Date | null;

  // ✅ UNDO FIELDS
  isUndone: boolean;
  undoneAt?: Date | null;
  undoneByMessageId?: string | null;

  timestamp: Date;
  date: string;
  messageId?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    
    // ✅ Updated ENUM to include 'DEBT_PAYMENT'
    type: { 
      type: String, 
      enum: ['SALE', 'RESTOCK', 'ADJUSTMENT', 'PAYMENT_RECEIVED', 'DEBT_PAYMENT'], 
      required: true 
    },
    
    paymentStatus: { 
      type: String, 
      enum: ['PAID', 'CREDIT', 'PARTIAL'], 
      default: 'PAID' 
    },

    items: [
      {
        name: String,
        qty: Number,
        unit: { type: String, default: '' },
        unitPrice: { type: Number, default: null },
        total: { type: Number, default: null },
      },
    ],

    totalMoney: { type: Number, default: 0 },

    // ✅ Support both naming conventions
    debtorId: { type: Schema.Types.ObjectId, ref: 'Debtor', default: null, index: true },
    debtor: { type: Schema.Types.ObjectId, ref: 'Debtor', default: null, index: true },
    
    customerName: { type: String, default: null, index: true },
    customerKey: { type: String, default: null, index: true },

    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0, index: true },
    settledAt: { type: Date, default: null },

    isUndone: { type: Boolean, default: false, index: true },
    undoneAt: { type: Date, default: null },
    undoneByMessageId: { type: String, default: null },

    timestamp: { type: Date, default: Date.now, index: true },
    date: { type: String, required: true },
    messageId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

export const Transaction = model<ITransaction>('Transaction', transactionSchema);