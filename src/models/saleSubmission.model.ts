import { Document, Schema, Types, model } from 'mongoose';

export interface ISaleSubmission extends Document {
  user: Types.ObjectId;
  clientSaleId: string;
  payloadHash: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transactionId?: Types.ObjectId | null;
  lockedAt: Date;
  attempts: number;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const saleSubmissionSchema = new Schema<ISaleSubmission>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientSaleId: { type: String, required: true, trim: true },
    payloadHash: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PROCESSING',
      required: true,
      index: true,
    },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null },
    lockedAt: { type: Date, required: true, default: Date.now },
    attempts: { type: Number, required: true, default: 1 },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

saleSubmissionSchema.index(
  { user: 1, clientSaleId: 1 },
  { unique: true, name: 'unique_sale_submission_per_user' }
);
saleSubmissionSchema.index({ status: 1, lockedAt: 1 });

export const SaleSubmission = model<ISaleSubmission>('SaleSubmission', saleSubmissionSchema);
