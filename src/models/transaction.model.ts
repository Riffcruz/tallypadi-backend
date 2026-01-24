import { Schema, model, Document, Types } from 'mongoose';
import { IUser } from './user.model'; // Import IUser

// --- SUB-INTERFACES ---
export interface ITransactionItem {
  name: string;
  itemId?: Types.ObjectId | null; // ✅ Robust linking
  qty: number;
  unit: string;
  unitPrice: number | null;
  costPrice: number | null; // <--- NEW: Snapshot of cost at time of sale
  total: number | null;
}

// --- MAIN INTERFACE ---
export interface ITransaction extends Document {
  user: Types.ObjectId | IUser; // Shop owner - Updated to allow populated User object
  
  // Business logic types
  type: 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'PAYMENT_RECEIVED' | 'DEBT_PAYMENT' | 'TRANSFER';
  paymentStatus: 'PAID' | 'CREDIT' | 'PARTIAL';

  // Goods details
  items: ITransactionItem[];
  totalMoney: number; 

  // Debtor linkage (Supports both naming conventions)
  debtorId?: Types.ObjectId | null; 
  debtor?: Types.ObjectId | null;   
  customerName?: string | null;
  customerKey?: string | null;

  // Financial tracking
  amountPaid: number;  // Cash actually received
  balance: number;     // Remaining debt for this specific record
  paymentMethod?: string; // CASH, TRANSFER, POS, OPAY, etc.
  settledAt?: Date | null;

  // Reversal/Undo tracking
  isUndone: boolean;
  undoneAt?: Date | null;
  undoneByMessageId?: string | null;

  // Timing and Reference
  timestamp: Date;
  date: string; // Format: YYYY-MM-DD
  messageId?: string; // For WhatsApp linkage
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// --- SCHEMA DEFINITION ---
const transactionSchema = new Schema<ITransaction>(
  {
    user: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    type: { 
      type: String, 
      enum: ['SALE', 'RESTOCK', 'ADJUSTMENT', 'PAYMENT_RECEIVED', 'DEBT_PAYMENT', 'TRANSFER'], 
      required: true,
      index: true
    },
    paymentStatus: { 
      type: String, 
      enum: ['PAID', 'CREDIT', 'PARTIAL'], 
      default: 'PAID',
      index: true
    },
    items: [
      {
        name: { type: String, required: true },
        itemId: { type: Schema.Types.ObjectId, ref: 'Inventory', default: null },
        qty: { type: Number, required: true },
        unit: { type: String, default: '' },
        unitPrice: { type: Number, default: 0 },
        costPrice: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
      },
    ],
    totalMoney: { 
      type: Number, 
      default: 0 
    },
    // ✅ Dual Debtor Fields for compatibility
    debtorId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Debtor', 
      default: null, 
      index: true 
    },
    debtor: { 
      type: Schema.Types.ObjectId, 
      ref: 'Debtor', 
      default: null, 
      index: true 
    },
    customerName: { 
      type: String, 
      default: null, 
      index: true 
    },
    customerKey: { 
      type: String, 
      default: null, 
      index: true 
    },
    // Financials
    amountPaid: { 
      type: Number, 
      default: 0 
    },
    paymentMethod: {
      type: String,
      default: 'CASH'
    },
    balance: { 
      type: Number, 
      default: 0, 
      index: true 
    },
    settledAt: { 
      type: Date, 
      default: null 
    },
    // Undo Logic
    isUndone: { 
      type: Boolean, 
      default: false, 
      index: true 
    },
    undoneAt: { 
      type: Date, 
      default: null 
    },
    undoneByMessageId: { 
      type: String, 
      default: null 
    },
    // Meta
    timestamp: { 
      type: Date, 
      default: Date.now, 
      index: true 
    },
    date: { 
      type: String, 
      required: true, 
      index: true 
    },
    messageId: { 
      type: String, 
      unique: true, 
      sparse: true 
    },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

// --- MIDDLEWARE ---
// Auto-sync debtor and debtorId so queries never fail
// ✅ No 'next()' needed if you use async
transactionSchema.pre('save', async function () {
  const doc = this as ITransaction;
  
  if (doc.debtor && !doc.debtorId) {
    doc.debtorId = doc.debtor as Types.ObjectId;
  } else if (doc.debtorId && !doc.debtor) {
    doc.debtor = doc.debtorId as Types.ObjectId;
  }
});
// --- INDEXES ---
transactionSchema.index({ user: 1, date: 1, type: 1 });
transactionSchema.index({ debtor: 1, isUndone: 1 });

export const Transaction = model<ITransaction>('Transaction', transactionSchema);