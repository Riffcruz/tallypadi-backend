import { Schema, model, Document, Types } from 'mongoose';

export type SellerVerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type SellerIdType = 'NIN' | 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'INTERNATIONAL_PASSPORT' | 'GOVERNMENT_ID';

export interface ISellerVerification extends Document {
  user: Types.ObjectId;
  status: SellerVerificationStatus;
  countryCode: string;
  idType: SellerIdType;
  fullName: string;
  dateOfBirth?: string | null;
  address: string;
  governmentIdNumber?: string | null;
  documentFrontUrl?: string | null;
  documentBackUrl?: string | null;
  selfieCenterUrl: string;
  selfieLeftUrl?: string | null;
  selfieRightUrl?: string | null;
  selfieUpUrl?: string | null;
  selfieDownUrl?: string | null;
  consentAccepted: boolean;
  consentVersion: string;
  submittedAt: Date;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sellerVerificationSchema = new Schema<ISellerVerification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    countryCode: { type: String, uppercase: true, trim: true, required: true, maxlength: 3 },
    idType: {
      type: String,
      enum: ['NIN', 'NATIONAL_ID', 'DRIVERS_LICENSE', 'INTERNATIONAL_PASSPORT', 'GOVERNMENT_ID'],
      required: true,
    },
    fullName: { type: String, required: true, trim: true, maxlength: 160 },
    dateOfBirth: { type: String, default: null, trim: true, maxlength: 20 },
    address: { type: String, required: true, trim: true, maxlength: 500 },
    governmentIdNumber: { type: String, default: null, trim: true, maxlength: 120, select: false },
    documentFrontUrl: { type: String, default: null, trim: true },
    documentBackUrl: { type: String, default: null, trim: true },
    selfieCenterUrl: { type: String, required: true, trim: true },
    selfieLeftUrl: { type: String, default: null, trim: true },
    selfieRightUrl: { type: String, default: null, trim: true },
    selfieUpUrl: { type: String, default: null, trim: true },
    selfieDownUrl: { type: String, default: null, trim: true },
    consentAccepted: { type: Boolean, required: true },
    consentVersion: { type: String, default: 'seller-verification-v1', trim: true },
    submittedAt: { type: Date, default: Date.now, index: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

sellerVerificationSchema.index({ user: 1, status: 1, createdAt: -1 });
sellerVerificationSchema.index({ status: 1, submittedAt: -1 });

export const SellerVerification = model<ISellerVerification>('SellerVerification', sellerVerificationSchema);
