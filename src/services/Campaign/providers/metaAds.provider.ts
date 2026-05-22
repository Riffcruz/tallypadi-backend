import axios from 'axios';
import { env } from '../../../config/env';
import { AdsProviderAdapter, ProviderSubmissionContext, ProviderSubmissionResult } from './types';
import {
  assertPublicLandingPage,
  axiosTimeout,
  normalizeExternalId,
  providerLaunchStatus,
  toDateYYYYMMDDDashed,
  truncateForProvider,
} from './providerUtils';

const graphBaseUrl = () => `https://graph.facebook.com/${env.ads.meta.apiVersion}`;

const adAccountId = () => {
  const raw = env.ads.meta.adAccountId.trim();
  return raw.startsWith('act_') ? raw : `act_${raw}`;
};

const metaPost = async <T = any>(path: string, body: Record<string, unknown>): Promise<T> => {
  const params = new URLSearchParams();
  Object.entries(body).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  });
  params.set('access_token', env.ads.meta.accessToken);

  const response = await axios.post<T>(`${graphBaseUrl()}${path}`, params, {
    timeout: axiosTimeout(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return response.data;
};

const metaGet = async <T = any>(path: string, params: Record<string, unknown>): Promise<T> => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      search.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  });
  search.set('access_token', env.ads.meta.accessToken);
  const response = await axios.get<T>(`${graphBaseUrl()}${path}?${search.toString()}`, {
    timeout: axiosTimeout(),
  });
  return response.data;
};

const buildTargeting = (context: ProviderSubmissionContext) => {
  const targeting: Record<string, unknown> = {
    geo_locations: {
      countries: [context.countryCode || 'NG'],
    },
  };
  if (context.campaign?.ageRange?.min) targeting.age_min = context.campaign.ageRange.min;
  if (context.campaign?.ageRange?.max) targeting.age_max = context.campaign.ageRange.max;
  return targeting;
};

export const metaAdsProvider: AdsProviderAdapter = {
  async submitCampaign(context: ProviderSubmissionContext): Promise<ProviderSubmissionResult> {
    assertPublicLandingPage(context.landingPageUrl);

    const status = env.ads.providerInitialStatus;
    const campaignName = truncateForProvider(`TallyPadi | ${context.headline}`, 120, 'TallyPadi product boost');
    const adSetName = truncateForProvider(`${campaignName} | ${context.providerCampaign._id}`, 120, campaignName);
    const dailyBudget = Math.max(100, Math.floor(context.dailyBudgetMinor));

    const campaign = await metaPost<{ id: string }>(`/${adAccountId()}/campaigns`, {
      name: campaignName,
      objective: 'OUTCOME_TRAFFIC',
      status,
      special_ad_categories: [],
    });

    const adSet = await metaPost<{ id: string }>(`/${adAccountId()}/adsets`, {
      name: adSetName,
      campaign_id: campaign.id,
      daily_budget: dailyBudget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      destination_type: 'WEBSITE',
      start_time: context.startsAt.toISOString(),
      end_time: context.endsAt.toISOString(),
      targeting: buildTargeting(context),
      status,
    });

    let imageHash: string | null = null;
    if (context.creativeAsset?.publicUrl) {
      const uploaded = await metaPost<any>(`/${adAccountId()}/adimages`, {
        url: context.creativeAsset.publicUrl,
      });
      const firstImage = uploaded?.images ? Object.values(uploaded.images)[0] as any : null;
      imageHash = firstImage?.hash ? String(firstImage.hash) : null;
    }

    const linkData: Record<string, unknown> = {
      link: context.landingPageUrl,
      message: truncateForProvider(context.description, 450, `Discover ${context.headline} on TallyPadi.`),
      name: truncateForProvider(context.headline, 80, 'TallyPadi product boost'),
      description: truncateForProvider(context.description, 120, 'Shop this product on TallyPadi.'),
      call_to_action: {
        type: 'LEARN_MORE',
        value: { link: context.landingPageUrl },
      },
    };
    if (imageHash) linkData.image_hash = imageHash;

    const creative = await metaPost<{ id: string }>(`/${adAccountId()}/adcreatives`, {
      name: truncateForProvider(`${campaignName} creative`, 100, 'TallyPadi creative'),
      object_story_spec: {
        page_id: env.ads.meta.pageId,
        ...(env.ads.meta.instagramActorId ? { instagram_actor_id: env.ads.meta.instagramActorId } : {}),
        link_data: linkData,
      },
    });

    const ad = await metaPost<{ id: string }>(`/${adAccountId()}/ads`, {
      name: truncateForProvider(`${campaignName} ad`, 100, 'TallyPadi ad'),
      adset_id: adSet.id,
      creative: { creative_id: creative.id },
      status,
    });

    return {
      status: providerLaunchStatus(),
      externalAccountId: adAccountId(),
      externalCampaignId: normalizeExternalId(campaign.id),
      externalAdSetId: normalizeExternalId(adSet.id),
      externalAdId: normalizeExternalId(ad.id),
      providerReviewStatus: status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED_DRAFT_CREATED',
      raw: {
        campaignId: campaign.id,
        adSetId: adSet.id,
        creativeId: creative.id,
        adId: ad.id,
      },
    };
  },

  async pullMetrics(context, dateRange) {
    if (!context.providerCampaign.externalCampaignId) return [];
    const from = toDateYYYYMMDDDashed(dateRange.from);
    const to = toDateYYYYMMDDDashed(dateRange.to);
    const result = await metaGet<any>(`/${context.providerCampaign.externalCampaignId}/insights`, {
      fields: 'date_start,impressions,clicks,spend,actions',
      time_range: { since: from, until: to },
      time_increment: 1,
    });

    const rows = Array.isArray(result?.data) ? result.data : [];
    
    let adPreviewUrl: string | null = null;
    if (context.providerCampaign.externalAdId && rows.length > 0) {
      try {
        const previewReq = await metaGet<any>(`/${context.providerCampaign.externalAdId}/previews`, {
          ad_format: 'SHAREABLE_LINK',
        });
        if (previewReq?.data?.[0]?.body) {
           adPreviewUrl = previewReq.data[0].body; // SHAREABLE_LINK usually returns a direct URL in the body
        }
      } catch (error) {
        console.warn(`Failed to fetch Meta ad preview for ${context.providerCampaign.externalAdId}:`, error);
      }
    }

    return rows.map((row: any, index: number) => {
      const impressions = Number(row?.impressions || 0);
      const clicks = Number(row?.clicks || 0);
      const spendMinor = Math.max(0, Math.round(Number(row?.spend || 0) * 100));
      const conversions = Array.isArray(row?.actions)
        ? row.actions.reduce((sum: number, action: any) => sum + Number(action?.value || 0), 0)
        : 0;
      return {
        date: String(row?.date_start || to),
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
    const status = action === 'ENABLE' ? 'ACTIVE' : action === 'STOP' ? 'ARCHIVED' : 'PAUSED';
    const result = await metaPost<any>(`/${context.providerCampaign.externalCampaignId}`, { status });
    return {
      providerReviewStatus: status,
      raw: result,
    };
  },
};
