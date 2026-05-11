import { Schema, model, Document, Types } from 'mongoose';

export interface ICampaignCreativeAsset extends Document {
  campaign: Types.ObjectId;
  campaignRun?: Types.ObjectId | null;
  product?: Types.ObjectId | null;
  user: Types.ObjectId;
  assetType: 'IMAGE' | 'VIDEO';
  sourceType: 'PRODUCT_IMAGE' | 'USER_UPLOAD' | 'ADMIN_UPLOAD';
  r2Key?: string | null;
  publicUrl?: string | null;
  signedUrl?: string | null;
  mimeType?: string | null;
  detectedMimeType?: string | null;
  fileExtension?: string | null;
  sizeBytes?: number | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnailR2Key?: string | null;
  transcodingStatus?: string | null;
  status: 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED' | 'PENDING_DELETE' | 'DELETED';
  isDefaultProductImage: boolean;
  referenceCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

const campaignCreativeAssetSchema = new Schema<ICampaignCreativeAsset>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', default: null, index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Inventory', default: null, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assetType: { type: String, enum: ['IMAGE', 'VIDEO'], required: true, index: true },
    sourceType: { type: String, enum: ['PRODUCT_IMAGE', 'USER_UPLOAD', 'ADMIN_UPLOAD'], required: true, index: true },
    r2Key: { type: String, default: null, trim: true },
    publicUrl: { type: String, default: null, trim: true },
    signedUrl: { type: String, default: null, trim: true },
    mimeType: { type: String, default: null, trim: true },
    detectedMimeType: { type: String, default: null, trim: true },
    fileExtension: { type: String, default: null, trim: true },
    sizeBytes: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    thumbnailR2Key: { type: String, default: null, trim: true },
    transcodingStatus: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'PENDING_REVIEW', 'REJECTED', 'PENDING_DELETE', 'DELETED'],
      default: 'PENDING_REVIEW',
      index: true,
    },
    isDefaultProductImage: { type: Boolean, default: false },
    referenceCount: { type: Number, default: 1, min: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignCreativeAssetSchema.index({ campaignRun: 1, status: 1 });
campaignCreativeAssetSchema.index({ publicUrl: 1 });

export const CampaignCreativeAsset = model<ICampaignCreativeAsset>('CampaignCreativeAsset', campaignCreativeAssetSchema);
