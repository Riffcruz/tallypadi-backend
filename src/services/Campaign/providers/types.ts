import { AdProvider, ProviderCampaignStatus } from '../../../types/ads';

export interface ProviderSubmissionContext {
  provider: AdProvider;
  providerCampaign: any;
  campaign: any;
  run: any;
  merchant: any;
  product: any | null;
  creativeAsset: any | null;
  aiSuggestion: any | null;
  landingPageUrl: string;
  headline: string;
  description: string;
  keywords: string[];
  dailyBudgetMinor: number;
  totalBudgetMinor: number;
  startsAt: Date;
  endsAt: Date;
  countryCode: string;
  locationText: string;
}

export interface ProviderSubmissionResult {
  status: ProviderCampaignStatus;
  externalAccountId?: string | null;
  externalCampaignId?: string | null;
  externalAdSetId?: string | null;
  externalAdGroupId?: string | null;
  externalAdId?: string | null;
  providerReviewStatus?: string | null;
  raw?: Record<string, unknown>;
}

export interface ProviderMetricResult {
  date: string;
  impressions: number;
  clicks: number;
  views?: number;
  conversions?: number;
  allConversions?: number;
  spendMinor: number;
  currency: string;
  adPreviewUrl?: string | null;
  raw?: Record<string, unknown>;
}

export type ProviderControlAction = 'PAUSE' | 'STOP' | 'ENABLE';

export interface AdsProviderAdapter {
  submitCampaign(context: ProviderSubmissionContext): Promise<ProviderSubmissionResult>;
  pullMetrics?(context: ProviderSubmissionContext, dateRange: { from: Date; to: Date }): Promise<ProviderMetricResult[]>;
  updateCampaignStatus?(context: ProviderSubmissionContext, action: ProviderControlAction): Promise<{ providerReviewStatus?: string | null; raw?: Record<string, unknown> }>;
}
