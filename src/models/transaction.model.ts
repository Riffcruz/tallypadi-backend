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
  
  // 🕒 TIME TRACKING
  timestamp: Date;         // Exact time (e.g. 14:30)
  date: string;            // Calendar Day (e.g. "2025-12-09")
  
  // 🔒 SECURITY
  messageId?: string;      // WhatsApp ID (Prevent duplicates)
}

const transactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['SALE', 'RESTOCK', 'ADJUSTMENT', 'PAYMENT_RECEIVED'], required: true },
    
    paymentStatus: { type: String, enum: ['PAID', 'CREDIT'], default: 'PAID' }, 

    items: [{
      name: String,
      qty: Number,
      unit: { type: String, default: '' },
      unitPrice: Number,
      total: Number
    }],
    totalMoney: { type: Number, default: null },
    
    // 🟢 UPDATED TIME FIELDS
    timestamp: { type: Date, default: Date.now },
    date: { type: String, required: true }, // Stores "YYYY-MM-DD"
    
    messageId: { type: String, unique: true, sparse: true } 
  },
  { timestamps: true }
);

export const Transaction = model<ITransaction>('Transaction', transactionSchema);