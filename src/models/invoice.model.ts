import { Schema, model, Document, Types } from 'mongoose';

export interface IInvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  unit?: string;
}

export interface IInvoice extends Document {
  user: Types.ObjectId; // Owner/Staff who created it
  customerName: string;
  items: IInvoiceItem[];
  totalAmount: number;
  discount?: number;
  customerId?: Types.ObjectId;
  pointsEarned?: number;
  dateIssued: Date;
  invoiceNumber: string;
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'PAID' | 'CANCELLED';
  
  // Snapshot of bank details at time of generation
  bankDetailsSnapshot?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  
  description?: string; // e.g. "Brand Visibility Package"
  
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerName: { type: String, required: true },
    items: [
      {
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        total: { type: Number, required: true },
        unit: { type: String },
      },
    ],
    totalAmount: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    pointsEarned: { type: Number, default: 0 },
    dateIssued: { type: Date, default: Date.now },
    invoiceNumber: { type: String, required: true }, // unique per user preferably, but global unique is easier
    status: {
      type: String,
      enum: ['DRAFT', 'GENERATED', 'SENT', 'PAID', 'CANCELLED'],
      default: 'GENERATED',
    },
    bankDetailsSnapshot: {
      bankName: String,
      accountNumber: String,
      accountName: String,
    },
    description: String,
  },
  { timestamps: true }
);

// Index for finding user's invoices
invoiceSchema.index({ user: 1, dateIssued: -1 });

export const Invoice = model<IInvoice>('Invoice', invoiceSchema);
