import { env } from '../../config/env';
import { AdProvider } from '../../types/ads';

export interface ProviderAutomationReadiness {
  provider: AdProvider;
  canSubmitAutomatically: boolean;
  fulfillmentMode: 'AUTO' | 'MANUAL';
  externalAccountId?: string | null;
  missing: string[];
  reason?: string;
}

const compact = (values: Array<string | false | null | undefined>) =>
  values.filter((value): value is string => Boolean(value));

export const getProviderAutomationReadiness = (provider: AdProvider): ProviderAutomationReadiness => {
  if (provider === 'TALLYPADI_MARKETPLACE_BOOST') {
    return {
      provider,
      canSubmitAutomatically: false,
      fulfillmentMode: 'MANUAL',
      externalAccountId: null,
      missing: [],
      reason: 'Marketplace boosts are fulfilled inside TallyPadi.',
    };
  }

  const globallyDisabled = !env.ads.autoSubmissionEnabled;
  let missing: string[] = [];
  let externalAccountId: string | null = null;

  if (provider === 'META_ADS') {
    missing = compact([
      !env.ads.meta.accessToken && 'META_ACCESS_TOKEN',
      !env.ads.meta.adAccountId && 'META_AD_ACCOUNT_ID',
      !env.ads.meta.pageId && 'META_PAGE_ID',
    ]);
    externalAccountId = env.ads.meta.adAccountId || null;
  }

  if (provider === 'GOOGLE_ADS') {
    missing = compact([
      !env.ads.google.developerToken && 'GOOGLE_ADS_DEVELOPER_TOKEN',
      !env.ads.google.clientId && 'GOOGLE_ADS_CLIENT_ID',
      !env.ads.google.clientSecret && 'GOOGLE_ADS_CLIENT_SECRET',
      !env.ads.google.refreshToken && 'GOOGLE_ADS_REFRESH_TOKEN',
      !env.ads.google.customerId && 'GOOGLE_ADS_CUSTOMER_ID',
    ]);
    externalAccountId = env.ads.google.customerId || null;
  }

  if (provider === 'TIKTOK_ADS') {
    missing = compact([
      !env.ads.tiktok.accessToken && 'TIKTOK_BUSINESS_ACCESS_TOKEN',
      !env.ads.tiktok.advertiserId && 'TIKTOK_ADVERTISER_ID',
      !env.ads.tiktok.identityId && 'TIKTOK_IDENTITY_ID',
      !env.ads.tiktok.identityType && 'TIKTOK_IDENTITY_TYPE',
      env.ads.tiktok.defaultLocationIds.length === 0 && 'TIKTOK_DEFAULT_LOCATION_IDS',
    ]);
    externalAccountId = env.ads.tiktok.advertiserId || null;
  }

  if (globallyDisabled) {
    return {
      provider,
      canSubmitAutomatically: false,
      fulfillmentMode: 'MANUAL',
      externalAccountId,
      missing: ['ADS_AUTO_SUBMISSION_ENABLED=true', ...missing],
      reason: 'Automatic provider submission is disabled.',
    };
  }

  return {
    provider,
    canSubmitAutomatically: missing.length === 0,
    fulfillmentMode: missing.length === 0 ? 'AUTO' : 'MANUAL',
    externalAccountId,
    missing,
    reason: missing.length ? `Missing ${missing.join(', ')}` : undefined,
  };
};

export const getProviderInitialStatus = () => env.ads.providerInitialStatus;
