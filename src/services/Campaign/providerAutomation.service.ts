import mongoose from 'mongoose';
import { AdCampaign } from '../../models/adCampaign.model';
import { AdProviderAccount } from '../../models/adProviderAccount.model';
import { AdminAuditLog } from '../../models/adminAuditLog.model';
import { CampaignAISuggestion } from '../../models/campaignAISuggestion.model';
import { CampaignCreativeAsset } from '../../models/campaignCreativeAsset.model';
import { CampaignMetricSnapshot } from '../../models/campaignMetricSnapshot.model';
import { CampaignRun } from '../../models/campaignRun.model';
import { Inventory } from '../../models/inventory.model';
import { ProviderCampaign, IProviderCampaign } from '../../models/providerCampaign.model';
import { User } from '../../models/user.model';
import { AdProvider, ProviderCampaignStatus } from '../../types/ads';
import { env } from '../../config/env';
import { getProviderAutomationReadiness } from './providerCredentials.service';
import { googleAdsProvider } from './providers/googleAds.provider';
import { metaAdsProvider } from './providers/metaAds.provider';
import { tiktokAdsProvider } from './providers/tiktokAds.provider';
import { AdsProviderAdapter, ProviderSubmissionContext } from './providers/types';
import { providerErrorMessage, truncateForProvider } from './providers/providerUtils';
import { walletService } from '../wallet.service';

const providerAdapters: Partial<Record<AdProvider, AdsProviderAdapter>> = {
  META_ADS: metaAdsProvider,
  GOOGLE_ADS: googleAdsProvider,
  TIKTOK_ADS: tiktokAdsProvider,
};

const providerIsTerminal = (status: string) => ['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED_BY_PROVIDER'].includes(status);

const calculateAggregateStatus = (campaignStatus: string, providers: IProviderCampaign[]) => {
  if (campaignStatus === 'PENDING_ADMIN_REVIEW' || campaignStatus === 'PENDING') return 'PENDING_ADMIN_REVIEW';
  if (campaignStatus === 'REJECTED_BY_TALLYPADI' || campaignStatus === 'REJECTED') return 'REJECTED_BY_TALLYPADI';
  if (campaignStatus === 'PAUSED') return 'PAUSED';
  if (campaignStatus === 'ACTIVE_WITH_PENDING_CHANGES' || campaignStatus === 'REQUIRES_REVIEW_AFTER_EDIT') return campaignStatus;
  if (campaignStatus === 'CANCELLED') return 'CANCELLED';
  if (!providers.length) return campaignStatus;

  const running = providers.filter((provider) => provider.status === 'RUNNING').length;
  const rejected = providers.filter((provider) => provider.status === 'REJECTED_BY_PROVIDER').length;
  const completed = providers.filter((provider) => provider.status === 'COMPLETED').length;
  const pendingLike = providers.filter((provider) => ['READY_TO_SUBMIT', 'SUBMITTED_TO_PROVIDER', 'PROVIDER_REVIEW', 'APPROVED_BY_PROVIDER', 'PENDING_TALLYPADI_REVIEW'].includes(provider.status)).length;
  const failed = providers.filter((provider) => provider.status === 'FAILED' || provider.status === 'CANCELLED').length;

  if (completed === providers.length) return 'COMPLETED';
  if (running === providers.length) return 'ACTIVE';
  if (running > 0 && (rejected > 0 || failed > 0 || pendingLike > 0)) return 'PARTIALLY_ACTIVE';
  if (rejected > 0 && running === 0) return 'PARTIALLY_REJECTED';
  if (pendingLike > 0 && running === 0) return 'STARTING_SOON';
  if (failed === providers.length) return 'FAILED';
  if (providers.some((provider) => providerIsTerminal(provider.status))) return 'PARTIALLY_REJECTED';

  return campaignStatus === 'APPROVED_BY_TALLYPADI' ? 'STARTING_SOON' : campaignStatus;
};

export const refreshCampaignAggregateStatusFromProviders = async (campaignId: any, campaignRunId: any) => {
  const [campaign, providers] = await Promise.all([
    AdCampaign.findById(campaignId),
    ProviderCampaign.find({ campaignRun: campaignRunId }),
  ]);
  if (!campaign) return null;

  const nextStatus = calculateAggregateStatus(campaign.status, providers);
  await Promise.all([
    AdCampaign.updateOne({ _id: campaign._id }, { $set: { status: nextStatus } }),
    CampaignRun.updateOne({ _id: campaignRunId }, { $set: { status: nextStatus } }),
  ]);
  return nextStatus;
};

const buildLandingPageUrl = (productId?: unknown) => {
  const base = env.ads.publicBaseUrl.replace(/\/+$/, '');
  if (!productId) return `${base}/marketplace`;
  const url = new URL(`${base}/marketplace/product/${encodeURIComponent(String(productId))}`);
  url.searchParams.set('utm_source', 'ads');
  url.searchParams.set('utm_medium', 'paid');
  url.searchParams.set('utm_campaign', 'tallypadi_managed_boost');
  return url.toString();
};

const buildLocationText = (campaign: any, merchant: any) => {
  const parts = [
    campaign?.targetLocation?.city,
    campaign?.targetLocation?.state,
    campaign?.targetLocation?.country || merchant?.countryCode || 'NG',
  ].map((item) => String(item || '').trim()).filter(Boolean);
  return parts.join(', ') || 'Nigeria';
};

const buildSubmissionContext = async (providerCampaign: IProviderCampaign): Promise<ProviderSubmissionContext> => {
  const [campaign, run] = await Promise.all([
    AdCampaign.findById(providerCampaign.campaign).lean(),
    CampaignRun.findById(providerCampaign.campaignRun).lean(),
  ]);
  if (!campaign || !run) throw new Error('Campaign or campaign run not found for provider submission.');

  const [merchant, product, creativeAsset, aiSuggestion] = await Promise.all([
    User.findById(providerCampaign.user).select('businessName name phoneNumber email countryCode shopSlug settings').lean(),
    campaign.product ? Inventory.findById(campaign.product).lean() : null,
    CampaignCreativeAsset.findOne({
      campaign: campaign._id,
      campaignRun: run._id,
      assetType: 'IMAGE',
      status: 'ACTIVE',
    }).sort({ isDefaultProductImage: -1, createdAt: 1 }).lean(),
    CampaignAISuggestion.findOne({
      campaign: campaign._id,
      campaignRun: run._id,
      status: 'COMPLETED',
    }).sort({ updatedAt: -1 }).lean(),
  ]);

  const headline = truncateForProvider(
    aiSuggestion?.adminEditedHeadlines?.[0]
      || aiSuggestion?.generatedHeadlines?.[0]
      || campaign.seo?.title
      || campaign.productSnapshot?.name
      || campaign.name,
    80,
    'TallyPadi product boost'
  );

  const description = truncateForProvider(
    aiSuggestion?.adminEditedCopy
      || aiSuggestion?.generatedCopy
      || campaign.seo?.adDescription
      || campaign.productSnapshot?.description
      || campaign.creativeNotes,
    900,
    `Discover ${headline} on TallyPadi.`
  );

  const keywords = Array.from(new Set([
    ...(aiSuggestion?.adminEditedKeywords || []),
    ...(aiSuggestion?.generatedKeywords || []),
    ...(campaign.keywords || []),
    ...(campaign.adDetails?.keywords || []),
    campaign.productSnapshot?.name,
    campaign.productSnapshot?.category,
  ].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))).slice(0, 12);

  const startsAt = run.startsAt ? new Date(run.startsAt) : new Date();
  const endsAt = run.endsAt ? new Date(run.endsAt) : new Date(Date.now() + Math.max(1, run.durationDays || 1) * 24 * 60 * 60 * 1000);
  const durationDays = Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / (24 * 60 * 60 * 1000)));
  const totalBudgetMinor = Math.max(0, providerCampaign.allocatedBudgetWalletMinor || 0);

  return {
    provider: providerCampaign.provider,
    providerCampaign,
    campaign,
    run,
    merchant,
    product,
    creativeAsset,
    aiSuggestion,
    landingPageUrl: buildLandingPageUrl(campaign.product || product?._id),
    headline,
    description,
    keywords,
    dailyBudgetMinor: Math.max(1, Math.floor(totalBudgetMinor / durationDays)),
    totalBudgetMinor,
    startsAt,
    endsAt,
    countryCode: String(campaign.targetLocation?.country || merchant?.countryCode || 'NG').toUpperCase(),
    locationText: buildLocationText(campaign, merchant),
  };
};

const recordSystemAudit = async (input: {
  action: string;
  provider: IProviderCampaign;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
  reason?: string;
}) => {
  await AdminAuditLog.create({
    admin: null,
    action: input.action,
    campaign: input.provider.campaign,
    campaignRun: input.provider.campaignRun,
    providerCampaign: input.provider._id,
    beforeValue: input.beforeValue || null,
    afterValue: input.afterValue || null,
    reason: input.reason || null,
  });
};

const upsertProviderAccountMetadata = async (provider: IProviderCampaign) => {
  const readiness = getProviderAutomationReadiness(provider.provider);
  await AdProviderAccount.findOneAndUpdate(
    {
      provider: provider.provider,
      externalAccountId: readiness.externalAccountId,
    },
    {
      $set: {
        accountName: `TallyPadi ${provider.provider}`,
        externalAccountId: readiness.externalAccountId,
        billingCurrency: provider.providerBillingCurrency || provider.walletCurrency || 'NGN',
        country: 'NG',
        fulfillmentModeSupported: readiness.canSubmitAutomatically ? 'AUTO_SUPPORTED' : 'MANUAL_ONLY',
        apiCredentialsConfigured: readiness.canSubmitAutomatically,
        webhookConfigured: false,
        isActive: true,
      },
    },
    { upsert: true, new: true }
  );
};

export const submitProviderCampaignToProvider = async (providerCampaignId: string) => {
  if (!mongoose.Types.ObjectId.isValid(providerCampaignId)) {
    throw new Error('Invalid provider campaign ID supplied for automation.');
  }

  const existing = await ProviderCampaign.findById(providerCampaignId);
  if (!existing) throw new Error('Provider campaign not found.');

  const readiness = getProviderAutomationReadiness(existing.provider);
  if (!readiness.canSubmitAutomatically) {
    existing.fulfillmentMode = 'MANUAL';
    existing.status = 'READY_TO_SUBMIT';
    existing.externalAccountId = readiness.externalAccountId || existing.externalAccountId || null;
    existing.providerError = readiness.reason || 'Provider automation is not configured.';
    existing.lastSyncedAt = new Date();
    await existing.save();
    await upsertProviderAccountMetadata(existing);
    await recordSystemAudit({
      action: 'Provider automation skipped',
      provider: existing,
      afterValue: {
        fulfillmentMode: existing.fulfillmentMode,
        status: existing.status,
        missing: readiness.missing,
      },
      reason: existing.providerError || undefined,
    });
    return existing;
  }

  const locked = await ProviderCampaign.findOneAndUpdate(
    {
      _id: existing._id,
      provider: { $in: ['META_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS'] },
      status: 'READY_TO_SUBMIT',
    },
    {
      $set: {
        status: 'SUBMITTED_TO_PROVIDER',
        fulfillmentMode: 'AUTO',
        externalAccountId: readiness.externalAccountId || null,
        providerError: null,
        lastSyncedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!locked) return existing;

  const adapter = providerAdapters[locked.provider];
  if (!adapter) throw new Error(`No automation adapter registered for ${locked.provider}.`);

  try {
    const before = {
      status: locked.status,
      fulfillmentMode: locked.fulfillmentMode,
      externalCampaignId: locked.externalCampaignId,
    };
    const context = await buildSubmissionContext(locked);
    const result = await adapter.submitCampaign(context);

    locked.status = result.status;
    locked.externalAccountId = result.externalAccountId || locked.externalAccountId;
    locked.externalCampaignId = result.externalCampaignId || locked.externalCampaignId;
    locked.externalAdSetId = result.externalAdSetId || locked.externalAdSetId;
    locked.externalAdGroupId = result.externalAdGroupId || locked.externalAdGroupId;
    locked.externalAdId = result.externalAdId || locked.externalAdId;
    locked.providerReviewStatus = result.providerReviewStatus || locked.providerReviewStatus;
    locked.providerError = null;
    locked.lastSyncedAt = new Date();
    await locked.save();

    await upsertProviderAccountMetadata(locked);
    await recordSystemAudit({
      action: 'Provider campaign submitted automatically',
      provider: locked,
      beforeValue: before,
      afterValue: {
        status: locked.status,
        externalCampaignId: locked.externalCampaignId,
        externalAdSetId: locked.externalAdSetId,
        externalAdGroupId: locked.externalAdGroupId,
        externalAdId: locked.externalAdId,
        providerReviewStatus: locked.providerReviewStatus,
      },
    });
    await refreshCampaignAggregateStatusFromProviders(locked.campaign, locked.campaignRun);
    return locked;
  } catch (error: any) {
    const message = providerErrorMessage(error);
    const hasProviderResponse = Boolean(error?.response);
    locked.status = hasProviderResponse ? 'FAILED' as ProviderCampaignStatus : 'READY_TO_SUBMIT';
    locked.providerError = message;
    locked.lastSyncedAt = new Date();
    await locked.save();
    await recordSystemAudit({
      action: hasProviderResponse ? 'Provider automation failed' : 'Provider automation retry scheduled',
      provider: locked,
      afterValue: { status: locked.status, providerError: message },
      reason: message,
    });
    await refreshCampaignAggregateStatusFromProviders(locked.campaign, locked.campaignRun);
    if (!hasProviderResponse) throw error;
    return locked;
  }
};

export const syncProviderCampaignMetricsFromProvider = async (providerCampaignId: string) => {
  if (!mongoose.Types.ObjectId.isValid(providerCampaignId)) {
    throw new Error('Invalid provider campaign ID supplied for metrics sync.');
  }

  const provider = await ProviderCampaign.findById(providerCampaignId);
  if (!provider) throw new Error('Provider campaign not found.');
  const adapter = providerAdapters[provider.provider];
  if (!adapter?.pullMetrics || !provider.externalCampaignId) {
    provider.lastSyncedAt = new Date();
    provider.providerError = adapter?.pullMetrics ? provider.providerError : 'Provider metrics sync is not implemented for this channel.';
    await provider.save();
    return provider;
  }

  const context = await buildSubmissionContext(provider);
  const from = context.run.startsAt ? new Date(context.run.startsAt) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = new Date();

  try {
    const rows = await adapter.pullMetrics(context, { from, to });
    const totals = rows.reduce((acc, row) => {
      acc.impressions += Number(row.impressions || 0);
      acc.clicks += Number(row.clicks || 0);
      acc.views += Number(row.views || 0);
      acc.conversions += Number(row.conversions || 0);
      acc.allConversions += Number(row.allConversions || 0);
      acc.spendMinor += Number(row.spendMinor || 0);
      return acc;
    }, { impressions: 0, clicks: 0, views: 0, conversions: 0, allConversions: 0, spendMinor: 0 });

    const safeSpentMinor = Math.max(provider.spentWalletMinor, Math.min(provider.allocatedBudgetWalletMinor, totals.spendMinor));
    const spendDelta = safeSpentMinor - provider.spentWalletMinor;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (spendDelta > 0) {
          await walletService.captureReserved({
            userId: provider.user,
            amountMinor: spendDelta,
            campaignId: provider.campaign,
            campaignRunId: provider.campaignRun,
            type: 'AD_SPEND_ALLOCATED',
            idempotencyKey: `provider-api-spend:${provider._id}:${safeSpentMinor}`,
            session,
            metadata: {
              provider: provider.provider,
              previousSpentMinor: provider.spentWalletMinor,
              newSpentMinor: safeSpentMinor,
              source: 'PROVIDER_API',
            },
          });
        }

        for (const row of rows) {
          await CampaignMetricSnapshot.updateOne(
            {
              campaign: provider.campaign,
              campaignRun: provider.campaignRun,
              providerCampaign: provider._id,
              provider: provider.provider,
              source: 'PROVIDER_API',
              date: row.date,
            },
            {
              $set: {
                impressions: Math.max(0, Number(row.impressions || 0)),
                clicks: Math.max(0, Number(row.clicks || 0)),
                views: Math.max(0, Number(row.views || 0)),
                conversions: Math.max(0, Number(row.conversions || 0)),
                allConversions: Math.max(0, Number(row.allConversions || 0)),
                spendMinor: Math.max(0, Number(row.spendMinor || 0)),
                currency: row.currency || provider.walletCurrency || 'NGN',
                ctr: Number(row.impressions || 0) > 0 ? Number(row.clicks || 0) / Number(row.impressions || 0) : 0,
                cpc: Number(row.clicks || 0) > 0 ? Number(row.spendMinor || 0) / Number(row.clicks || 0) : 0,
              },
            },
            { upsert: true, session }
          );
        }

        provider.impressions = totals.impressions;
        provider.clicks = totals.clicks;
        provider.views = totals.views;
        provider.conversions = totals.conversions;
        provider.allConversions = totals.allConversions;
        provider.spentWalletMinor = safeSpentMinor;
        provider.remainingBudgetWalletMinor = Math.max(0, provider.allocatedBudgetWalletMinor - safeSpentMinor);
        provider.ctr = provider.impressions > 0 ? provider.clicks / provider.impressions : 0;
        provider.cpc = provider.clicks > 0 ? provider.spentWalletMinor / provider.clicks : 0;
        provider.providerError = null;
        provider.lastSyncedAt = new Date();
        await provider.save({ session });

        const providers = await ProviderCampaign.find({ campaignRun: provider.campaignRun }).session(session);
        const run = await CampaignRun.findById(provider.campaignRun).session(session);
        if (run) {
          run.spentAmountMinor = providers.reduce((sum, item) => sum + (item.spentWalletMinor || 0), 0);
          run.remainingBudgetMinor = providers.reduce((sum, item) => sum + (item.remainingBudgetWalletMinor || 0), 0);
          await run.save({ session });
        }

        await AdminAuditLog.create([{
          admin: null,
          action: 'Provider metrics synced automatically',
          campaign: provider.campaign,
          campaignRun: provider.campaignRun,
          providerCampaign: provider._id,
          afterValue: {
            rows: rows.length,
            spentWalletMinor: provider.spentWalletMinor,
            impressions: provider.impressions,
            clicks: provider.clicks,
            conversions: totals.conversions,
          },
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    return provider;
  } catch (error: any) {
    provider.providerError = providerErrorMessage(error);
    provider.lastSyncedAt = new Date();
    await provider.save();
    throw error;
  }
};

export const applyProviderCampaignControl = async (
  providerCampaignId: string,
  action: 'PAUSE' | 'STOP' | 'ENABLE'
) => {
  if (!mongoose.Types.ObjectId.isValid(providerCampaignId)) {
    throw new Error('Invalid provider campaign ID supplied for provider control.');
  }

  const provider = await ProviderCampaign.findById(providerCampaignId);
  if (!provider) throw new Error('Provider campaign not found.');
  const adapter = providerAdapters[provider.provider];
  const before = {
    status: provider.status,
    providerReviewStatus: provider.providerReviewStatus,
    providerError: provider.providerError,
  };

  if (!adapter?.updateCampaignStatus || !provider.externalCampaignId) {
    provider.providerError = adapter?.updateCampaignStatus ? provider.providerError : 'Provider campaign control is not implemented for this channel.';
    provider.status = action === 'ENABLE' ? 'RUNNING' : action === 'STOP' ? 'CANCELLED' : 'PAUSED';
    provider.lastSyncedAt = new Date();
    await provider.save();
    await recordSystemAudit({
      action: 'Provider campaign control applied locally',
      provider,
      beforeValue: before,
      afterValue: { action, status: provider.status, providerError: provider.providerError },
    });
    return provider;
  }

  try {
    const context = await buildSubmissionContext(provider);
    const result = await adapter.updateCampaignStatus(context, action);
    provider.status = action === 'ENABLE' ? 'RUNNING' : action === 'STOP' ? 'CANCELLED' : 'PAUSED';
    provider.providerReviewStatus = result.providerReviewStatus || provider.providerReviewStatus;
    provider.providerError = null;
    provider.lastSyncedAt = new Date();
    await provider.save();
    await recordSystemAudit({
      action: 'Provider campaign control submitted automatically',
      provider,
      beforeValue: before,
      afterValue: { action, status: provider.status, providerReviewStatus: provider.providerReviewStatus },
    });
    await refreshCampaignAggregateStatusFromProviders(provider.campaign, provider.campaignRun);
    return provider;
  } catch (error: any) {
    provider.providerError = providerErrorMessage(error);
    provider.lastSyncedAt = new Date();
    await provider.save();
    await recordSystemAudit({
      action: 'Provider campaign control failed',
      provider,
      beforeValue: before,
      afterValue: { action, status: provider.status, providerError: provider.providerError },
      reason: provider.providerError || undefined,
    });
    throw error;
  }
};
