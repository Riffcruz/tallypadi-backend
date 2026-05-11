import { Schema, model, Document, Types } from 'mongoose';

export interface ICampaignAISuggestion extends Document {
  campaign: Types.ObjectId;
  campaignRun: Types.ObjectId;
  modelProvider: 'GEMINI';
  modelName?: string;
  promptVersion: string;
  generatedCopy?: string;
  generatedHeadlines?: string[];
  generatedKeywords?: string[];
  generatedAudience?: string;
  generatedPlatformNotes?: Record<string, unknown>;
  generatedPolicyWarnings?: string[];
  adminEditedCopy?: string;
  adminEditedHeadlines?: string[];
  adminEditedKeywords?: string[];
  adminEditedAudience?: string;
  adminEditedPlatformNotes?: Record<string, unknown>;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const campaignAISuggestionSchema = new Schema<ICampaignAISuggestion>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'AdCampaign', required: true, index: true },
    campaignRun: { type: Schema.Types.ObjectId, ref: 'CampaignRun', required: true, index: true },
    modelProvider: { type: String, enum: ['GEMINI'], default: 'GEMINI' },
    modelName: { type: String, trim: true },
    promptVersion: { type: String, default: 'managed-boost-v1', trim: true },
    generatedCopy: { type: String, trim: true, maxlength: 2000 },
    generatedHeadlines: [{ type: String, trim: true, maxlength: 120 }],
    generatedKeywords: [{ type: String, trim: true, maxlength: 60 }],
    generatedAudience: { type: String, trim: true, maxlength: 1000 },
    generatedPlatformNotes: { type: Schema.Types.Mixed, default: null },
    generatedPolicyWarnings: [{ type: String, trim: true, maxlength: 240 }],
    adminEditedCopy: { type: String, trim: true, maxlength: 2000 },
    adminEditedHeadlines: [{ type: String, trim: true, maxlength: 120 }],
    adminEditedKeywords: [{ type: String, trim: true, maxlength: 60 }],
    adminEditedAudience: { type: String, trim: true, maxlength: 1000 },
    adminEditedPlatformNotes: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING', index: true },
    error: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

campaignAISuggestionSchema.index({ campaignRun: 1, createdAt: -1 });

export const CampaignAISuggestion = model<ICampaignAISuggestion>('CampaignAISuggestion', campaignAISuggestionSchema);
