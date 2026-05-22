import axios from 'axios';
import FormData from 'form-data';
import { env } from '../../../config/env';
import { AdsProviderAdapter, ProviderSubmissionContext, ProviderSubmissionResult } from './types';
import {
  assertPublicLandingPage,
  axiosTimeout,
  majorFromMinor,
  normalizeExternalId,
  providerLaunchStatus,
  readImageAsBuffer,
  toDateYYYYMMDDDashed,
  toTikTokDateTime,
  truncateForProvider,
} from './providerUtils';

const endpoint = (path: string) => `${env.ads.tiktok.apiBaseUrl}/open_api/${env.ads.tiktok.apiVersion}${path}`;

const tiktokHeaders = () => ({
  'Access-Token': env.ads.tiktok.accessToken,
  'Content-Type': 'application/json',
});

const postJson = async <T = any>(path: string, body: Record<string, unknown>): Promise<T> => {
  const response = await axios.post<T>(endpoint(path), body, {
    timeout: axiosTimeout(),
    headers: tiktokHeaders(),
  });
  return response.data;
};

const getJson = async <T = any>(path: string, params: Record<string, unknown>): Promise<T> => {
  const response = await axios.get<T>(endpoint(path), {
    params,
    timeout: axiosTimeout(),
    headers: tiktokHeaders(),
  });
  return response.data;
};

const assertTikTokOk = (response: any, action: string) => {
  const code = response?.code;
  if (code !== 0 && code !== '0') {
    throw new Error(`${action} failed: ${response?.message || response?.msg || 'TikTok API rejected the request'}`);
  }
};

const uploadImage = async (imageUrl: string) => {
  const form = new FormData();
  form.append('advertiser_id', env.ads.tiktok.advertiserId);
  form.append('upload_type', 'UPLOAD_BY_FILE');
  form.append('image_file', await readImageAsBuffer(imageUrl), {
    filename: 'tallypadi-product.jpg',
    contentType: 'image/jpeg',
  });

  const response = await axios.post<any>(endpoint('/file/image/ad/upload/'), form, {
    timeout: axiosTimeout(),
    headers: {
      'Access-Token': env.ads.tiktok.accessToken,
      ...form.getHeaders(),
    },
  });
  assertTikTokOk(response.data, 'TikTok image upload');
  const imageId = response.data?.data?.image_id;
  if (!imageId) throw new Error('TikTok image upload succeeded without returning image_id.');
  return String(imageId);
};

export const tiktokAdsProvider: AdsProviderAdapter = {
  async submitCampaign(context: ProviderSubmissionContext): Promise<ProviderSubmissionResult> {
    assertPublicLandingPage(context.landingPageUrl);
    if (!context.creativeAsset?.publicUrl) {
      throw new Error('TikTok automation requires a public product image creative.');
    }

    const operationStatus = env.ads.providerInitialStatus === 'ACTIVE' ? 'ENABLE' : 'DISABLE';
    const totalBudget = Math.max(1, majorFromMinor(context.totalBudgetMinor));
    const campaignName = truncateForProvider(`TallyPadi | ${context.headline}`, 512, 'TallyPadi product boost');

    const campaign = await postJson<any>('/campaign/create/', {
      advertiser_id: env.ads.tiktok.advertiserId,
      campaign_name: campaignName,
      objective_type: 'TRAFFIC',
      campaign_type: 'REGULAR_CAMPAIGN',
      budget_mode: 'BUDGET_MODE_TOTAL',
      budget: totalBudget,
    });
    assertTikTokOk(campaign, 'TikTok campaign creation');
    const campaignId = campaign?.data?.campaign_id;
    if (!campaignId) throw new Error('TikTok campaign creation succeeded without returning campaign_id.');

    const adGroup = await postJson<any>('/adgroup/create/', {
      advertiser_id: env.ads.tiktok.advertiserId,
      campaign_id: campaignId,
      adgroup_name: truncateForProvider(`${campaignName} ad group`, 512, campaignName),
      promotion_type: 'WEBSITE',
      placement_type: 'PLACEMENT_TYPE_NORMAL',
      placements: ['PLACEMENT_TIKTOK'],
      location_ids: env.ads.tiktok.defaultLocationIds,
      billing_event: 'CPC',
      optimization_goal: 'CLICK',
      bid_type: 'BID_TYPE_NO_BID',
      budget_mode: 'BUDGET_MODE_TOTAL',
      budget: totalBudget,
      schedule_type: 'SCHEDULE_START_END',
      schedule_start_time: toTikTokDateTime(context.startsAt),
      schedule_end_time: toTikTokDateTime(context.endsAt),
      operation_status: operationStatus,
    });
    assertTikTokOk(adGroup, 'TikTok ad group creation');
    const adGroupId = adGroup?.data?.adgroup_id;
    if (!adGroupId) throw new Error('TikTok ad group creation succeeded without returning adgroup_id.');

    const imageId = await uploadImage(context.creativeAsset.publicUrl);
    const ad = await postJson<any>('/ad/create/', {
      advertiser_id: env.ads.tiktok.advertiserId,
      adgroup_id: adGroupId,
      creatives: [{
        ad_name: truncateForProvider(`${campaignName} ad`, 512, 'TallyPadi ad'),
        identity_id: env.ads.tiktok.identityId,
        identity_type: env.ads.tiktok.identityType,
        ad_text: truncateForProvider(context.description, 100, `Discover ${context.headline} on TallyPadi.`),
        image_ids: [imageId],
        call_to_action: 'LEARN_MORE',
        landing_page_url: context.landingPageUrl,
      }],
      operation_status: operationStatus,
    });
    assertTikTokOk(ad, 'TikTok ad creation');

    return {
      status: providerLaunchStatus(),
      externalAccountId: env.ads.tiktok.advertiserId,
      externalCampaignId: normalizeExternalId(campaignId),
      externalAdGroupId: normalizeExternalId(adGroupId),
      externalAdId: normalizeExternalId(ad?.data?.ad_ids?.[0] || ad?.data?.ad_id),
      providerReviewStatus: operationStatus,
      raw: {
        campaignId,
        adGroupId,
        imageId,
        adIds: ad?.data?.ad_ids || [],
      },
    };
  },

  async pullMetrics(context, dateRange) {
    if (!context.providerCampaign.externalCampaignId) return [];
    const result = await postJson<any>('/report/integrated/get/', {
      advertiser_id: env.ads.tiktok.advertiserId,
      service_type: 'AUCTION',
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: ['campaign_id', 'stat_time_day'],
      metrics: ['impressions', 'clicks', 'spend', 'conversion'],
      start_date: toDateYYYYMMDDDashed(dateRange.from),
      end_date: toDateYYYYMMDDDashed(dateRange.to),
      filtering: [{
        field_name: 'campaign_ids',
        filter_type: 'IN',
        filter_value: JSON.stringify([context.providerCampaign.externalCampaignId]),
      }],
    });
    assertTikTokOk(result, 'TikTok reporting');

    const rows = Array.isArray(result?.data?.list) ? result.data.list : [];
    
    let adPreviewUrl: string | null = null;
    if (context.providerCampaign.externalAdId && rows.length > 0) {
      try {
        const previewReq = await getJson<any>('/ad/get/', {
          advertiser_id: env.ads.tiktok.advertiserId,
          filtering: JSON.stringify({ ad_ids: [context.providerCampaign.externalAdId] })
        });
        const adInfo = previewReq?.data?.list?.[0];
        // Sometimes TikTok returns an ad preview link in ad_text or deep_link, or we could construct a pseudo link
        // We'll capture it if it exists or fallback
        if (adInfo?.ad_format === 'URL' || adInfo?.ad_url) {
          adPreviewUrl = adInfo.ad_url || adInfo.video_url;
        }
      } catch (error) {
         console.warn(`Failed to fetch TikTok ad preview for ${context.providerCampaign.externalAdId}:`, error);
      }
    }
    return rows.map((row: any, index: number) => {
      const metrics = row?.metrics || {};
      const dimensions = row?.dimensions || {};
      const impressions = Number(metrics.impressions || 0);
      const clicks = Number(metrics.clicks || 0);
      const spendMinor = Math.max(0, Math.round(Number(metrics.spend || 0) * 100));
      const conversions = Number(metrics.conversion || 0);
      return {
        date: String(dimensions.stat_time_day || toDateYYYYMMDDDashed(dateRange.to)).slice(0, 10),
        impressions,
        clicks,
        conversions,
        allConversions: conversions,
        spendMinor,
        currency: context.providerCampaign.walletCurrency || 'NGN',
        adPreviewUrl: index === 0 && adPreviewUrl ? adPreviewUrl : undefined,
        raw: row,
      };
    });
  },

  async updateCampaignStatus(context, action) {
    if (!context.providerCampaign.externalCampaignId) return { providerReviewStatus: null };
    const operationStatus = action === 'ENABLE' ? 'ENABLE' : 'DISABLE';
    const result = await postJson<any>('/campaign/update/', {
      advertiser_id: env.ads.tiktok.advertiserId,
      campaign_id: context.providerCampaign.externalCampaignId,
      operation_status: operationStatus,
    });
    assertTikTokOk(result, 'TikTok campaign status update');
    return {
      providerReviewStatus: operationStatus,
      raw: result,
    };
  },
};
