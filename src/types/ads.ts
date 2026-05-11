export const AD_PROVIDERS = [
  'META_ADS',
  'TIKTOK_ADS',
  'GOOGLE_ADS',
  'TALLYPADI_MARKETPLACE_BOOST',
] as const;

export type AdProvider = typeof AD_PROVIDERS[number];

export const PAID_AD_PROVIDERS: AdProvider[] = ['META_ADS', 'TIKTOK_ADS', 'GOOGLE_ADS'];

export type FulfillmentMode = 'MANUAL' | 'AUTO';

export type AdCampaignStatus =
  | 'DRAFT'
  | 'PENDING_ADMIN_REVIEW'
  | 'REJECTED_BY_TALLYPADI'
  | 'APPROVED_BY_TALLYPADI'
  | 'SUBMITTING_TO_PROVIDERS'
  | 'STARTING_SOON'
  | 'ACTIVE'
  | 'ACTIVE_WITH_PENDING_CHANGES'
  | 'PARTIALLY_ACTIVE'
  | 'PARTIALLY_REJECTED'
  | 'PAUSED'
  | 'REQUIRES_REVIEW_AFTER_EDIT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED'
  // Legacy statuses kept so old campaign documents remain readable.
  | 'PENDING'
  | 'RUNNING'
  | 'REJECTED';

export type CampaignRunStatus =
  | 'PENDING_ADMIN_REVIEW'
  | 'APPROVED_BY_TALLYPADI'
  | 'SUBMITTING_TO_PROVIDERS'
  | 'STARTING_SOON'
  | 'ACTIVE'
  | 'ACTIVE_WITH_PENDING_CHANGES'
  | 'PARTIALLY_ACTIVE'
  | 'PARTIALLY_REJECTED'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type ProviderCampaignStatus =
  | 'PENDING_TALLYPADI_REVIEW'
  | 'READY_TO_SUBMIT'
  | 'SUBMITTED_TO_PROVIDER'
  | 'PROVIDER_REVIEW'
  | 'APPROVED_BY_PROVIDER'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'REJECTED_BY_PROVIDER'
  | 'FAILED'
  | 'CANCELLED';

export type ProviderRefundStatus =
  | 'NOT_APPLICABLE'
  | 'HELD'
  | 'PENDING_REFUND'
  | 'REFUNDED'
  | 'REALLOCATED'
  | 'HELD_FOR_RESUBMISSION';

export type SettlementStatus = 'PENDING' | 'RECONCILED' | 'FX_GAIN' | 'FX_LOSS';

export type MetricSource = 'INTERNAL' | 'MANUAL_ADMIN' | 'PROVIDER_API';

export const PROVIDER_LABELS: Record<AdProvider, string> = {
  META_ADS: 'Meta Ads',
  TIKTOK_ADS: 'TikTok Ads',
  GOOGLE_ADS: 'Google Ads',
  TALLYPADI_MARKETPLACE_BOOST: 'TallyPadi Marketplace Boost',
};

export const LEGACY_PROVIDER_MAP: Record<string, AdProvider> = {
  META: 'META_ADS',
  TIKTOK: 'TIKTOK_ADS',
  GOOGLE: 'GOOGLE_ADS',
  GOOGLE_ADS: 'GOOGLE_ADS',
  TALLYPADI_SEO: 'TALLYPADI_MARKETPLACE_BOOST',
  TALLYPADI_MARKETPLACE_BOOST: 'TALLYPADI_MARKETPLACE_BOOST',
};
