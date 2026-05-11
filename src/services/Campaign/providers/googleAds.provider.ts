import axios from 'axios';
import { env } from '../../../config/env';
import { AdsProviderAdapter, ProviderSubmissionContext, ProviderSubmissionResult } from './types';
import {
  assertPublicLandingPage,
  axiosTimeout,
  majorFromMinor,
  normalizeExternalId,
  providerLaunchStatus,
  toDateYYYYMMDD,
  toDateYYYYMMDDDashed,
  truncateForProvider,
} from './providerUtils';

const cleanCustomerId = (value: string) => value.replace(/[^\d]/g, '');

const getAccessToken = async () => {
  const response = await axios.post<{ access_token: string }>(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: env.ads.google.clientId,
      client_secret: env.ads.google.clientSecret,
      refresh_token: env.ads.google.refreshToken,
      grant_type: 'refresh_token',
    }),
    {
      timeout: axiosTimeout(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  return response.data.access_token;
};

const googleHeaders = async () => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getAccessToken()}`,
    'developer-token': env.ads.google.developerToken,
    'Content-Type': 'application/json',
  };
  if (env.ads.google.loginCustomerId) {
    headers['login-customer-id'] = cleanCustomerId(env.ads.google.loginCustomerId);
  }
  return headers;
};

const mutate = async (customerId: string, mutateOperations: any[]) => {
  const response = await axios.post<any>(
    `https://googleads.googleapis.com/${env.ads.google.apiVersion}/customers/${customerId}/googleAds:mutate`,
    { mutateOperations },
    {
      timeout: axiosTimeout(),
      headers: await googleHeaders(),
    }
  );
  return response.data;
};

const searchStream = async (customerId: string, query: string) => {
  const response = await axios.post<any[]>(
    `https://googleads.googleapis.com/${env.ads.google.apiVersion}/customers/${customerId}/googleAds:searchStream`,
    { query },
    {
      timeout: axiosTimeout(),
      headers: await googleHeaders(),
    }
  );
  return Array.isArray(response.data) ? response.data : [];
};

const keywordOperations = (context: ProviderSubmissionContext, customerId: string, adGroupTempResource: string) => {
  const keywords = (context.keywords || [])
    .map((keyword) => truncateForProvider(keyword, 80, ''))
    .filter(Boolean)
    .slice(0, 8);

  return keywords.map((keyword) => ({
    adGroupCriterionOperation: {
      create: {
        adGroup: adGroupTempResource,
        status: 'ENABLED',
        keyword: {
          text: keyword,
          matchType: 'BROAD',
        },
      },
    },
  }));
};

export const googleAdsProvider: AdsProviderAdapter = {
  async submitCampaign(context: ProviderSubmissionContext): Promise<ProviderSubmissionResult> {
    assertPublicLandingPage(context.landingPageUrl);

    const customerId = cleanCustomerId(env.ads.google.customerId);
    const providerStatus = env.ads.providerInitialStatus === 'ACTIVE' ? 'ENABLED' : 'PAUSED';
    const stamp = String(context.providerCampaign._id).slice(-8);
    const baseName = truncateForProvider(`TallyPadi ${context.headline} ${stamp}`, 120, `TallyPadi boost ${stamp}`);
    const dailyBudgetMicros = Math.max(1_000_000, Math.round(majorFromMinor(context.dailyBudgetMinor) * 1_000_000));
    const cpcBidMicros = Math.max(100_000, Math.round(dailyBudgetMicros / 20));

    const budgetResource = `customers/${customerId}/campaignBudgets/-1`;
    const campaignResource = `customers/${customerId}/campaigns/-2`;
    const adGroupResource = `customers/${customerId}/adGroups/-3`;

    const mutateOperations = [
      {
        campaignBudgetOperation: {
          create: {
            resourceName: budgetResource,
            name: `${baseName} budget`,
            deliveryMethod: 'STANDARD',
            amountMicros: dailyBudgetMicros,
            explicitlyShared: false,
          },
        },
      },
      {
        campaignOperation: {
          create: {
            resourceName: campaignResource,
            name: baseName,
            advertisingChannelType: 'SEARCH',
            status: providerStatus,
            manualCpc: {},
            campaignBudget: budgetResource,
            startDate: toDateYYYYMMDD(context.startsAt),
            endDate: toDateYYYYMMDD(context.endsAt),
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
              targetContentNetwork: false,
              targetPartnerSearchNetwork: false,
            },
          },
        },
      },
      {
        adGroupOperation: {
          create: {
            resourceName: adGroupResource,
            campaign: campaignResource,
            name: `${baseName} ad group`,
            status: providerStatus,
            type: 'SEARCH_STANDARD',
            cpcBidMicros,
          },
        },
      },
      {
        adGroupAdOperation: {
          create: {
            adGroup: adGroupResource,
            status: providerStatus,
            ad: {
              finalUrls: [context.landingPageUrl],
              responsiveSearchAd: {
                headlines: [
                  { text: truncateForProvider(context.headline, 30, 'Shop on TallyPadi') },
                  { text: truncateForProvider(context.campaign?.campaignGoal, 30, 'Available now') },
                  { text: truncateForProvider(context.locationText, 30, 'Buy from local seller') },
                ],
                descriptions: [
                  { text: truncateForProvider(context.description, 90, 'View price, details, and seller contact on TallyPadi.') },
                  { text: truncateForProvider(`Order or ask about ${context.headline} today.`, 90, 'Contact the seller today.') },
                ],
              },
            },
          },
        },
      },
      ...keywordOperations(context, customerId, adGroupResource),
    ];

    const result = await mutate(customerId, mutateOperations);
    const campaignResult = result?.mutateOperationResponses?.find((item: any) => item.campaignResult)?.campaignResult;
    const adGroupResult = result?.mutateOperationResponses?.find((item: any) => item.adGroupResult)?.adGroupResult;
    const adResult = result?.mutateOperationResponses?.find((item: any) => item.adGroupAdResult)?.adGroupAdResult;

    return {
      status: providerLaunchStatus(),
      externalAccountId: customerId,
      externalCampaignId: normalizeExternalId(campaignResult?.resourceName),
      externalAdGroupId: normalizeExternalId(adGroupResult?.resourceName),
      externalAdId: normalizeExternalId(adResult?.resourceName),
      providerReviewStatus: providerStatus,
      raw: {
        requestId: result?.requestId,
        campaignResourceName: campaignResult?.resourceName,
        adGroupResourceName: adGroupResult?.resourceName,
        adResourceName: adResult?.resourceName,
      },
    };
  },

  async pullMetrics(context, dateRange) {
    if (!context.providerCampaign.externalCampaignId) return [];
    const customerId = cleanCustomerId(env.ads.google.customerId);
    const from = toDateYYYYMMDDDashed(dateRange.from);
    const to = toDateYYYYMMDDDashed(dateRange.to);
    const query = `
      SELECT
        campaign.resource_name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.all_conversions,
        segments.date
      FROM campaign
      WHERE campaign.resource_name = '${context.providerCampaign.externalCampaignId}'
        AND segments.date BETWEEN '${from}' AND '${to}'
    `;

    const chunks = await searchStream(customerId, query);
    const rows = chunks.flatMap((chunk) => Array.isArray(chunk?.results) ? chunk.results : []);

    return rows.map((row: any) => {
      const impressions = Number(row?.metrics?.impressions || 0);
      const clicks = Number(row?.metrics?.clicks || 0);
      const spendMinor = Math.max(0, Math.round(Number(row?.metrics?.costMicros || row?.metrics?.cost_micros || 0) / 10000));
      return {
        date: String(row?.segments?.date || to),
        impressions,
        clicks,
        conversions: Number(row?.metrics?.conversions || 0),
        allConversions: Number(row?.metrics?.allConversions || row?.metrics?.all_conversions || 0),
        spendMinor,
        currency: context.providerCampaign.walletCurrency || 'NGN',
        raw: row,
      };
    });
  },

  async updateCampaignStatus(context, action) {
    if (!context.providerCampaign.externalCampaignId) return { providerReviewStatus: null };
    const customerId = cleanCustomerId(env.ads.google.customerId);
    const status = action === 'ENABLE' ? 'ENABLED' : action === 'STOP' ? 'REMOVED' : 'PAUSED';
    const result = await mutate(customerId, [{
      campaignOperation: {
        update: {
          resourceName: context.providerCampaign.externalCampaignId,
          status,
        },
        updateMask: 'status',
      },
    }]);

    return {
      providerReviewStatus: status,
      raw: {
        requestId: result?.requestId,
        status,
      },
    };
  },
};
