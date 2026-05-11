import { Schema, model, Document, Types } from 'mongoose';

export interface ICampaignChangeRequest extends Document {
  campaign: Types.ObjectId;
  campaignRun: Types.ObjectId;
  requestedByUser: Types.ObjectId;
  changeType:
    | 'TARGETING'
    | 'CREATIVE'
    | 'BUDGET_SPLIT'
    | 'PLATFORM_SELECTION'
    | 'COPY'
    | 'LANDING_PAGE'
    | 'GOOGLE_CONFIG';
  previousValues?: Record<string, unknown> | null;
  requestedValues?: Record<string, unknown> | null;
  status: 'PENDING_ADMIN_REVIEW' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'CANCELLED';
  adminReviewer?: Types.ObjectId | null;
  adminNotes?: string | null;
  rejectionReason?: string | null;
  reviewedAt?: Date | null;
  appliedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const campaignChangeRequestSchema = new Schema<ICampaignChangeRequest>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', required: true, index: true },
    requestedByUser: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    changeType: {
      type: String,
      enum: ['TARGETING', 'CREATIVE', 'BUDGET_SPLIT', 'PLATFORM_SELECTION', 'COPY', 'LANDING_PAGE', 'GOOGLE_CONFIG'],
      required: true,
      index: true,
    },
    previousValues: { type: Schema.Types.Mixed, default: null },
    requestedValues: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ['PENDING_ADMIN_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED'],
      default: 'PENDING_ADMIN_REVIEW',
      index: true,
    },
    adminReviewer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    adminNotes: { type: String, default: null, trim: true, maxlength: 1000 },
    rejectionReason: { type: String, default: null, trim: true, maxlength: 500 },
    reviewedAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignChangeRequestSchema.index({ campaign: 1, status: 1, createdAt: -1 });

export const CampaignChangeRequest = model<ICampaignChangeRequest>('CampaignChangeRequest', campaignChangeRequestSchema);
