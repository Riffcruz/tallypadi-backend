import mongoose, { ClientSession, Types } from 'mongoose';
import { AdminSettings } from '../../models/adminSettings.model';
import { AdCampaign, AdCampaignStatus, AdPlatform, IAdCampaign } from '../../models/adCampaign.model';
import { AdminAuditLog } from '../../models/adminAuditLog.model';
import { CampaignAISuggestion } from '../../models/campaignAISuggestion.model';
import { CampaignChangeRequest } from '../../models/campaignChangeRequest.model';
import { CampaignCreativeAsset } from '../../models/campaignCreativeAsset.model';
import { CampaignMetricSnapshot } from '../../models/campaignMetricSnapshot.model';
import { CampaignPolicyCheck } from '../../models/campaignPolicyCheck.model';
import { CampaignRun, ICampaignRun } from '../../models/campaignRun.model';
import { MerchantAdConsent } from '../../models/merchantAdConsent.model';
import { NotificationLog } from '../../models/notificationLog.model';
import { OutboxEvent } from '../../models/outboxEvent.model';
import { ProviderCampaign, IProviderCampaign } from '../../models/providerCampaign.model';
import { Inventory } from '../../models/inventory.model';
import { User } from '../../models/user.model';
import { WalletTransaction } from '../../models/walletTransaction.model';
import { activityService } from '../activity.service';
import {
  AdBudgetError,
  calculateBudgetBreakdown,
  convertLegacyBudgetToMinor,
  formatMinorNaira,
  getBoostSettings,
  normalizeProviders,
  toMajorUnits,
} from './adBudget.service';
import { isTransactionUnsupportedError, walletService } from '../wallet.service';
import { queueAdProviderControl, queueAdProviderMetricsSync, queueAdProviderSubmission } from '../queue.service';
import {
  AD_PROVIDERS,
  AdProvider,
  LEGACY_PROVIDER_MAP,
  PAID_AD_PROVIDERS,
  PROVIDER_LABELS,
  ProviderCampaignStatus,
} from '../../types/ads';
import { generateAdSeoMetadata } from '../gemini.service';
import { getProviderAutomationReadiness } from './providerCredentials.service';
import { buildMarketplaceProductSeo } from '../marketplaceSeo.service';

export { AdCampaignStatus, AdPlatform };

export const AD_PLATFORMS: AdProvider[] = [...AD_PROVIDERS];
export const ALL_AD_PLATFORMS = 'ALL';

const AD_CAMPAIGN_EXPIRY_BATCH_SIZE = Number(process.env.AD_CAMPAIGN_EXPIRY_BATCH_SIZE || 500);
const AD_BOOST_METADATA_RETENTION_DAYS = Number(process.env.AD_BOOST_METADATA_RETENTION_DAYS || 15);
const AD_ORPHAN_RESERVATION_REPAIR_LIMIT = Number(process.env.AD_ORPHAN_RESERVATION_REPAIR_LIMIT || 25);
const AD_ORPHAN_RESERVATION_MIN_AGE_MS = Number(process.env.AD_ORPHAN_RESERVATION_MIN_AGE_MS || 60_000);
const AD_TERMS_VERSION = process.env.AD_TERMS_VERSION || 'managed-boost-v1';

export const DEFAULT_ADS_PLANS = [
  { id: '3_days', durationDays: 3, price: 50_000, label: '3 Days Boost' },
  { id: '7_days', durationDays: 7, price: 100_000, label: '1 Week Boost' },
  { id: '14_days', durationDays: 14, price: 180_000, label: '2 Weeks Boost' },
  { id: '30_days', durationDays: 30, price: 300_000, label: '1 Month Boost' },
];

export class AdCampaignError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const toObjectId = (value: string | Types.ObjectId) => {
  if (value instanceof Types.ObjectId) return value;
  if (!Types.ObjectId.isValid(value)) {
    throw new AdCampaignError('Invalid ID supplied', 400);
  }
  return new Types.ObjectId(value);
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const cleanKeywords = (value: unknown) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(
    raw
      .map((item) => cleanText(item, 60).toLowerCase())
      .filter(Boolean)
  )).slice(0, 12);
};

const moneyMajor = (value: number) => Math.round(value * 100) / 100;

const providerLabel = (provider: string) => PROVIDER_LABELS[provider as AdProvider] || provider;
const formatProviders = (providers: string[]) => providers.map(providerLabel).join(', ');

const mapLegacyStatus = (status: string): AdCampaignStatus => {
  if (status === 'PENDING') return 'PENDING_ADMIN_REVIEW';
  if (status === 'RUNNING') return 'ACTIVE';
  if (status === 'REJECTED') return 'REJECTED_BY_TALLYPADI';
  return status as AdCampaignStatus;
};

const RESERVATION_SETTLEMENT_TYPES = [
  'CAMPAIGN_BUDGET_RELEASED',
  'SERVICE_FEE_CAPTURED',
  'AD_SPEND_ALLOCATED',
  'PROVIDER_ALLOCATION_REFUNDED',
  'UNUSED_BUDGET_REFUNDED',
];

const providerIsTerminal = (status: string) => ['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED_BY_PROVIDER'].includes(status);

const calculateAggregateStatus = (campaignStatus: string, providers: IProviderCampaign[]) => {
  if (campaignStatus === 'PENDING_ADMIN_REVIEW' || campaignStatus === 'PENDING') return 'PENDING_ADMIN_REVIEW';
  if (campaignStatus === 'REJECTED_BY_TALLYPADI' || campaignStatus === 'REJECTED') return 'REJECTED_BY_TALLYPADI';
  if (campaignStatus === 'PAUSED') return 'PAUSED';
  if (campaignStatus === 'ACTIVE_WITH_PENDING_CHANGES' || campaignStatus === 'REQUIRES_REVIEW_AFTER_EDIT') return campaignStatus;
  if (campaignStatus === 'CANCELLED') return 'CANCELLED';

  if (!providers.length) return mapLegacyStatus(campaignStatus);

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

  return mapLegacyStatus(campaignStatus);
};

const getProductSeoFallback = (product: any, owner: any, campaign: IAdCampaign) =>
  buildMarketplaceProductSeo(
    {
      name: product.name || campaign.productSnapshot?.name || 'Product',
      category: product.category || campaign.productSnapshot?.category || '',
      description: product.description || campaign.productSnapshot?.description || '',
      lastUnitPrice: product.lastUnitPrice || campaign.productSnapshot?.price || 0,
    },
    owner,
    {
      source: 'BOOST',
      extraKeywords: [
        ...(campaign.keywords || []),
        ...(campaign.adDetails?.keywords || []),
        ...(campaign.selectedProviders || []),
      ],
      adBrief: campaign.creativeNotes || campaign.adDetails?.brief || '',
      targetAudience: campaign.targetAudience || campaign.adDetails?.audience || '',
      campaignGoal: campaign.campaignGoal || '',
    }
  );

const audit = async (input: {
  adminId?: string | Types.ObjectId | null;
  action: string;
  campaignId?: string | Types.ObjectId | null;
  campaignRunId?: string | Types.ObjectId | null;
  providerCampaignId?: string | Types.ObjectId | null;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  reason?: string | null;
  session?: ClientSession;
}) => {
  await AdminAuditLog.create([{
    admin: input.adminId ? toObjectId(input.adminId as any) : null,
    action: input.action,
    campaign: input.campaignId ? toObjectId(input.campaignId as any) : null,
    campaignRun: input.campaignRunId ? toObjectId(input.campaignRunId as any) : null,
    providerCampaign: input.providerCampaignId ? toObjectId(input.providerCampaignId as any) : null,
    beforeValue: input.beforeValue || null,
    afterValue: input.afterValue || null,
    reason: input.reason || null,
  }], { session: input.session });
};

const generateCampaignAiSuggestionSafely = async (campaignId: string, campaignRunId: string) => {
  try {
    const campaign = await AdCampaign.findById(campaignId).lean();
    if (!campaign) return;
    const [product, owner] = await Promise.all([
      campaign.product ? Inventory.findById(campaign.product).lean() : null,
      User.findById(campaign.user).select('businessName settings.location countryCode').lean(),
    ]);

    const location = owner?.settings?.location;
    const seo = await generateAdSeoMetadata({
      productName: product?.name || campaign.productSnapshot?.name || campaign.name || 'Product',
      productDescription: product?.description || campaign.productSnapshot?.description || campaign.creativeNotes || '',
      productCategory: product?.category || campaign.productSnapshot?.category || '',
      price: product?.lastUnitPrice || campaign.productSnapshot?.price || 0,
      businessName: owner?.businessName || '',
      city: location?.city || '',
      state: location?.state || '',
      country: location?.country || owner?.countryCode || 'NG',
      adBrief: campaign.creativeNotes || campaign.adDetails?.brief || '',
      adAudience: campaign.targetAudience || campaign.adDetails?.audience || '',
      adKeywords: campaign.keywords || campaign.adDetails?.keywords || [],
    });

    await CampaignAISuggestion.findOneAndUpdate(
      { campaign: campaign._id, campaignRun: campaignRunId },
      {
        $set: {
          modelName: process.env.GEMINI_MODEL || 'gemini-flash-latest',
          generatedCopy: seo.adDescription,
          generatedHeadlines: [seo.title].filter(Boolean),
          generatedKeywords: seo.keywords || [],
          generatedAudience: campaign.targetAudience || campaign.adDetails?.audience || '',
          generatedPlatformNotes: {
            providers: campaign.selectedProviders || campaign.platforms || [],
            meta: 'Review copy, creative, and landing page before creating Meta ads manually.',
            tiktok: 'Confirm creative format and hook before TikTok placement.',
            google: 'Confirm campaign type, keywords, landing page quality, and policy-sensitive claims.',
          },
          generatedPolicyWarnings: [],
          status: 'COMPLETED',
        },
      },
      { upsert: true }
    );
  } catch (error: any) {
    console.error('Campaign Gemini suggestion failed:', error?.message || error);
    await CampaignAISuggestion.findOneAndUpdate(
      { campaign: campaignId, campaignRun: campaignRunId },
      {
        $set: {
          status: 'FAILED',
          error: String(error?.message || 'Gemini suggestion failed').slice(0, 1000),
        },
      }
    ).catch(() => {});
  }
};

export const getConfiguredAdsPlans = async () => {
  const settings = await getBoostSettings();
  const adminSettings = await AdminSettings.findOne().lean();
  const configuredPlans = adminSettings?.adsPlans || [];
  const sourcePlans = configuredPlans.length > 0 ? configuredPlans : DEFAULT_ADS_PLANS;

  const normalizePlans = (plans: typeof sourcePlans) => plans
    .map((plan: any) => ({
      id: String(plan.id || '').trim(),
      durationDays: Number(plan.durationDays),
      price: Math.max(Number(plan.price || 0), toMajorUnits(settings.minimumGrossBudgetMinor)),
      label: String(plan.label || '').trim() || `${plan.durationDays} Day Boost`,
    }))
    .filter((plan) => plan.id && Number.isInteger(plan.durationDays) && plan.durationDays >= settings.minimumDurationDays && plan.durationDays <= settings.maximumDurationDays);

  const normalizedConfiguredPlans = normalizePlans(sourcePlans);
  return normalizedConfiguredPlans.length > 0 ? normalizedConfiguredPlans : normalizePlans(DEFAULT_ADS_PLANS);
};

export const expandAdPlatforms = (raw: unknown): AdProvider[] => {
  try {
    return normalizeProviders(raw);
  } catch (error) {
    if (error instanceof AdBudgetError) throw new AdCampaignError(error.message, error.statusCode);
    throw error;
  }
};

export const serializeProviderCampaign = (provider: IProviderCampaign | any) => ({
  id: String(provider._id),
  campaign: provider.campaign,
  campaignRun: provider.campaignRun,
  provider: provider.provider,
  label: providerLabel(provider.provider),
  status: provider.status,
  fulfillmentMode: provider.fulfillmentMode || 'MANUAL',
  allocatedBudgetWalletMinor: provider.allocatedBudgetWalletMinor || 0,
  allocatedBudget: toMajorUnits(provider.allocatedBudgetWalletMinor || 0),
  spentWalletMinor: provider.spentWalletMinor || 0,
  spent: toMajorUnits(provider.spentWalletMinor || 0),
  remainingBudgetWalletMinor: provider.remainingBudgetWalletMinor || 0,
  remainingBudget: toMajorUnits(provider.remainingBudgetWalletMinor || 0),
  walletCurrency: provider.walletCurrency || 'NGN',
  providerBillingCurrency: provider.providerBillingCurrency || null,
  rejectionReason: provider.rejectionReason || null,
  refundStatus: provider.refundStatus || 'NOT_APPLICABLE',
  settlementStatus: provider.settlementStatus || 'PENDING',
  impressions: provider.impressions || 0,
  clicks: provider.clicks || 0,
  views: provider.views || 0,
  conversions: provider.conversions || 0,
  allConversions: provider.allConversions || 0,
  ctr: provider.ctr || 0,
  cpc: provider.cpc || 0,
  adminNotes: provider.adminNotes || null,
  providerError: provider.providerError || null,
  lastSyncedAt: provider.lastSyncedAt || null,
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt,
});

export const serializeCampaignRun = (run: ICampaignRun | any) => run ? ({
  id: String(run._id),
  campaign: run.campaign,
  runNumber: run.runNumber,
  status: run.status,
  grossBudgetMinor: run.grossBudgetMinor || 0,
  grossBudget: toMajorUnits(run.grossBudgetMinor || 0),
  serviceFeeMinor: run.serviceFeeMinor || 0,
  serviceFee: toMajorUnits(run.serviceFeeMinor || 0),
  netCampaignBudgetMinor: run.netCampaignBudgetMinor || 0,
  netCampaignBudget: toMajorUnits(run.netCampaignBudgetMinor || 0),
  safetyReserveMinor: run.safetyReserveMinor || 0,
  safetyReserve: toMajorUnits(run.safetyReserveMinor || 0),
  fxBufferMinor: run.fxBufferMinor || 0,
  fxBuffer: toMajorUnits(run.fxBufferMinor || 0),
  adSpendBudgetMinor: run.adSpendBudgetMinor || 0,
  adSpendBudget: toMajorUnits(run.adSpendBudgetMinor || 0),
  unallocatedBudgetMinor: run.unallocatedBudgetMinor || 0,
  unallocatedBudget: toMajorUnits(run.unallocatedBudgetMinor || 0),
  walletCurrency: run.walletCurrency || 'NGN',
  budgetSplit: (run.budgetSplit || []).map((item: any) => ({
    provider: item.provider,
    label: providerLabel(item.provider),
    weight: item.weight || 0,
    allocationMinor: item.allocationMinor || 0,
    allocation: toMajorUnits(item.allocationMinor || 0),
  })),
  selectedProviders: run.selectedProviders || [],
  startsAt: run.startsAt || null,
  endsAt: run.endsAt || null,
  durationDays: run.durationDays,
  spentAmountMinor: run.spentAmountMinor || 0,
  spentAmount: toMajorUnits(run.spentAmountMinor || 0),
  remainingBudgetMinor: run.remainingBudgetMinor || 0,
  remainingBudget: toMajorUnits(run.remainingBudgetMinor || 0),
  approvedAt: run.approvedAt || null,
  approvedBy: run.approvedBy || null,
  completedAt: run.completedAt || null,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
}) : null;

export const serializeAdCampaign = (campaign: IAdCampaign | any, options?: {
  run?: ICampaignRun | any | null;
  providerCampaigns?: (IProviderCampaign | any)[];
  aiSuggestions?: any[];
  metrics?: any[];
  walletTransactions?: any[];
}) => {
  const run = options?.run || campaign.activeRun || campaign.latestRun || null;
  const providers = options?.providerCampaigns || campaign.providerCampaigns || [];
  const selectedProviders = campaign.selectedProviders?.length
    ? campaign.selectedProviders
    : (campaign.platforms || []).map((platform: string) => LEGACY_PROVIDER_MAP[String(platform).toUpperCase()] || platform);
  const status = calculateAggregateStatus(campaign.status, providers);
  const grossBudgetMinor = run?.grossBudgetMinor ?? convertLegacyBudgetToMinor(campaign.budget || 0);

  return {
    id: String(campaign._id),
    user: campaign.user,
    product: campaign.product,
    campaignType: campaign.campaignType || 'PRODUCT_BOOST',
    status,
    rawStatus: campaign.status,
    name: campaign.name || campaign.productSnapshot?.name || 'Product boost',
    activeRunId: campaign.activeRunId || null,
    latestRunId: campaign.latestRunId || null,
    selectedProviders,
    platforms: selectedProviders,
    providerCampaigns: providers.map(serializeProviderCampaign),
    run: serializeCampaignRun(run),
    grossBudgetMinor,
    grossBudget: toMajorUnits(grossBudgetMinor),
    planId: campaign.planId,
    planLabel: campaign.planLabel,
    durationDays: run?.durationDays || campaign.durationDays,
    basePrice: campaign.basePrice,
    budget: run ? toMajorUnits(run.grossBudgetMinor || 0) : campaign.budget,
    walletCharged: campaign.walletCharged,
    walletBalanceAfterCharge: campaign.walletBalanceAfterCharge ?? null,
    refundAmount: campaign.refundAmount ?? null,
    refundAmountMinor: campaign.refundAmount ? convertLegacyBudgetToMinor(campaign.refundAmount) : null,
    requestedAt: campaign.requestedAt || campaign.createdAt,
    reviewedAt: campaign.reviewedAt ?? null,
    reviewedBy: campaign.reviewedBy ?? null,
    startedAt: run?.startsAt || campaign.startedAt || null,
    expiresAt: run?.endsAt || campaign.expiresAt || null,
    completedAt: run?.completedAt || campaign.completedAt || null,
    rejectionReason: campaign.rejectionReason ?? null,
    productSnapshot: campaign.productSnapshot || {},
    adDetails: campaign.adDetails || {},
    targetAudience: campaign.targetAudience || campaign.adDetails?.audience || '',
    targetLocation: campaign.targetLocation || {},
    ageRange: campaign.ageRange || {},
    campaignGoal: campaign.campaignGoal || '',
    keywords: campaign.keywords || campaign.adDetails?.keywords || [],
    creativeNotes: campaign.creativeNotes || campaign.adDetails?.brief || '',
    seo: campaign.seo || {},
    aiSuggestions: options?.aiSuggestions || [],
    metrics: options?.metrics || [],
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
};

interface CreateManagedCampaignInput {
  userId: string;
  productId?: string;
  planId?: string;
  durationDays?: number;
  providers?: unknown;
  platform?: unknown;
  budget?: number;
  grossBudget?: number;
  adDetails?: {
    brief?: string;
    audience?: string;
    keywords?: string[];
    budgetType?: 'DAILY' | 'TOTAL';
    startDate?: string;
    endDate?: string;
    adDescription?: string;
  };
  targetAudience?: string;
  targetLocation?: {
    country?: string;
    state?: string;
    city?: string;
  };
  ageRange?: {
    min?: number;
    max?: number;
  };
  campaignGoal?: string;
  creativeNotes?: string;
  keywords?: string[];
  customSplitBasisPoints?: Partial<Record<AdProvider, number>>;
  consent?: {
    accepted?: boolean;
    version?: string;
    ipAddress?: string;
    userAgent?: string;
  };
  globalLandingPageUrl?: string;
  providerLandingPageUrls?: Record<string, string>;
}

const resolvePlan = async (input: CreateManagedCampaignInput) => {
  const plans = await getConfiguredAdsPlans();
  const selectedPlan = input.planId ? plans.find((plan) => plan.id === input.planId) : null;
  const durationDays = Number(input.durationDays || selectedPlan?.durationDays || 0);
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new AdCampaignError('Select a valid campaign duration', 400);
  }
  return {
    plan: selectedPlan || {
      id: `${durationDays}_days`,
      durationDays,
      price: Number(input.grossBudget || input.budget || 0),
      label: `${durationDays} Day Campaign`,
    },
    durationDays,
  };
};

export const createManagedCampaign = async (input: CreateManagedCampaignInput) => {
  const userObjectId = toObjectId(input.userId);
  const selectedProviders = expandAdPlatforms(input.providers || input.platform);
  const { plan, durationDays } = await resolvePlan(input);
  const grossBudget = Number(input.grossBudget ?? input.budget ?? plan.price);

  const user = await User.findById(userObjectId);
  if (!user) throw new AdCampaignError('User not found', 404);
  if (user.role !== 'OWNER') {
    throw new AdCampaignError('Only the shop owner can request ads boosts', 403);
  }
  if (String(user.planType || '').toUpperCase() !== 'TYCOON') {
    throw new AdCampaignError('Boosting is an exclusive feature for Tycoon plan users', 403);
  }

  let product: any = null;
  const productObjectId = input.productId ? toObjectId(input.productId) : null;
  if (productObjectId) {
    product = await Inventory.findOne({ _id: productObjectId, user: userObjectId, isDeleted: { $ne: true } });
    if (!product) throw new AdCampaignError('Product not found', 404);
  }

  let breakdown;
  try {
    breakdown = await calculateBudgetBreakdown({
      grossBudgetMajor: grossBudget,
      selectedProviders,
      durationDays,
      customSplitBasisPoints: input.customSplitBasisPoints,
      providerCurrencyDiffers: false,
    });
  } catch (error) {
    if (error instanceof AdBudgetError) throw new AdCampaignError(error.message, error.statusCode);
    throw error;
  }

  let createdCampaign: any = null;
  let createdRun: any = null;
  let providerCampaigns: IProviderCampaign[] = [];
  let walletBalance = 0;
  let walletBalanceMinor = 0;

  const applyCreation = async (session?: ClientSession) => {
    const createOptions = session ? { session } : undefined;
    const campaignDocs = await AdCampaign.create([{
      user: userObjectId,
      product: productObjectId,
      campaignType: productObjectId ? 'PRODUCT_BOOST' : 'CUSTOM_CAMPAIGN',
      status: 'PENDING_ADMIN_REVIEW',
      name: product?.name || 'Custom ad campaign',
      selectedProviders,
      platforms: selectedProviders,
      globalLandingPageUrl: input.globalLandingPageUrl,
      providerLandingPageUrls: input.providerLandingPageUrls,
      walletCurrency: 'NGN',
      targetAudience: cleanText(input.targetAudience || input.adDetails?.audience, 500),
      targetLocation: {
        country: cleanText(input.targetLocation?.country || user.settings?.location?.country || user.countryCode || 'NG', 3).toUpperCase(),
        state: cleanText(input.targetLocation?.state || user.settings?.location?.state, 80),
        city: cleanText(input.targetLocation?.city || user.settings?.location?.city, 80),
      },
      ageRange: {
        min: input.ageRange?.min || null,
        max: input.ageRange?.max || null,
      },
      campaignGoal: cleanText(input.campaignGoal || 'Drive product enquiries', 120),
      keywords: cleanKeywords(input.keywords || input.adDetails?.keywords),
      creativeNotes: cleanText(input.creativeNotes || input.adDetails?.brief, 1000),
      merchantConsentAccepted: Boolean(input.consent?.accepted ?? true),
      merchantConsentVersion: input.consent?.version || AD_TERMS_VERSION,
      planId: plan.id,
      planLabel: plan.label,
      durationDays,
      basePrice: moneyMajor(toMajorUnits(breakdown.settings.minimumGrossBudgetMinor)),
      budget: moneyMajor(toMajorUnits(breakdown.grossBudgetMinor)),
      walletCharged: true,
      requestedAt: new Date(),
      productSnapshot: {
        name: product?.name || 'Custom campaign',
        description: product?.description || '',
        image: product?.image || null,
        price: product?.lastUnitPrice || 0,
        category: product?.category || null,
      },
      adDetails: {
        brief: cleanText(input.creativeNotes || input.adDetails?.brief, 1000),
        audience: cleanText(input.targetAudience || input.adDetails?.audience, 300),
        keywords: cleanKeywords(input.keywords || input.adDetails?.keywords),
        budgetType: input.adDetails?.budgetType || 'TOTAL',
        startDate: input.adDetails?.startDate || '',
        endDate: input.adDetails?.endDate || '',
        adDescription: cleanText(input.adDetails?.adDescription || '', 1000),
      },
    }], createOptions);

    createdCampaign = campaignDocs[0];

    const latestRun = await CampaignRun.countDocuments({ campaign: createdCampaign._id }).session(session || null);
    const runDocs = await CampaignRun.create([{
      campaign: createdCampaign._id,
      user: userObjectId,
      product: productObjectId,
      runNumber: latestRun + 1,
      status: 'PENDING_ADMIN_REVIEW',
      grossBudgetMinor: breakdown.grossBudgetMinor,
      serviceFeeMinor: breakdown.serviceFeeMinor,
      netCampaignBudgetMinor: breakdown.netCampaignBudgetMinor,
      safetyReserveMinor: breakdown.safetyReserveMinor,
      fxBufferMinor: breakdown.fxBufferMinor,
      adSpendBudgetMinor: breakdown.adSpendBudgetMinor,
      unallocatedBudgetMinor: breakdown.unallocatedBudgetMinor,
      walletCurrency: 'NGN',
      budgetSplit: breakdown.budgetSplit,
      selectedProviders,
      durationDays,
      spentAmountMinor: 0,
      remainingBudgetMinor: breakdown.adSpendBudgetMinor,
      serviceFeeBasisPoints: breakdown.settings.serviceFeeBasisPoints,
      safetyReserveBasisPoints: breakdown.settings.safetyReserveBasisPoints,
      fxBufferBasisPoints: breakdown.settings.fxBufferBasisPoints,
      lowBudgetAlertThresholdBasisPoints: breakdown.settings.lowBudgetAlertThresholdBasisPoints,
    }], createOptions);
    createdRun = runDocs[0];

    const reservation = await walletService.reserveCampaignBudget({
      userId: userObjectId,
      amountMinor: breakdown.grossBudgetMinor,
      campaignId: createdCampaign._id as any,
      campaignRunId: createdRun._id as any,
      idempotencyKey: `campaign-reserve:${createdRun._id}`,
      session,
    });

    createdRun.wallet = reservation.wallet._id as any;
    createdRun.walletReservationTransaction = reservation.transaction._id as any;
    await createdRun.save(createOptions);

    createdCampaign.latestRunId = createdRun._id as any;
    createdCampaign.walletBalanceAfterCharge = toMajorUnits(reservation.wallet.availableBalanceMinor);
    await createdCampaign.save(createOptions);

    const providerDocs = await ProviderCampaign.create(selectedProviders.map((provider) => {
      const allocation = breakdown.budgetSplit.find((item) => item.provider === provider)?.allocationMinor || 0;
      return {
        campaign: createdCampaign!._id,
        campaignRun: createdRun!._id,
        user: userObjectId,
        provider,
        status: 'PENDING_TALLYPADI_REVIEW',
        fulfillmentMode: 'MANUAL',
        allocatedBudgetWalletMinor: allocation,
        spentWalletMinor: 0,
        remainingBudgetWalletMinor: allocation,
        walletCurrency: 'NGN',
        refundStatus: allocation > 0 ? 'HELD' : 'NOT_APPLICABLE',
        settlementStatus: 'PENDING',
      };
    }), createOptions);
    providerCampaigns = providerDocs as IProviderCampaign[];

    walletBalance = toMajorUnits(reservation.wallet.availableBalanceMinor);
    walletBalanceMinor = reservation.wallet.availableBalanceMinor;
  };

  const session = await mongoose.startSession();

  try {
    try {
      await session.withTransaction(async () => {
        await applyCreation(session);
      });
    } catch (error) {
      if (!isTransactionUnsupportedError(error)) throw error;
      createdCampaign = null;
      createdRun = null;
      providerCampaigns = [];
      walletBalance = 0;
      walletBalanceMinor = 0;
      await applyCreation();
    }
  } catch (error: any) {
    if (String(error?.message || '').includes('Insufficient wallet balance')) {
      throw new AdCampaignError('Insufficient wallet balance', 400);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!createdCampaign || !createdRun) throw new AdCampaignError('Unable to create campaign', 500);

  const sidecarWrites: Promise<unknown>[] = [];

  if (product?.image) {
    sidecarWrites.push(CampaignCreativeAsset.create([{
      campaign: createdCampaign._id,
      campaignRun: createdRun._id,
      product: product._id,
      user: userObjectId,
      assetType: 'IMAGE',
      sourceType: 'PRODUCT_IMAGE',
      publicUrl: product.image,
      mimeType: 'image/*',
      status: 'ACTIVE',
      isDefaultProductImage: true,
      referenceCount: 1,
    }]));
  }

  sidecarWrites.push(
    MerchantAdConsent.create([{
      user: userObjectId,
      campaign: createdCampaign._id,
      campaignRun: createdRun._id,
      acceptedTermsVersion: input.consent?.version || AD_TERMS_VERSION,
      acceptedAt: new Date(),
      ipAddress: input.consent?.ipAddress || null,
      userAgent: input.consent?.userAgent || null,
    }]),
    CampaignPolicyCheck.create([{
      campaign: createdCampaign._id,
      campaignRun: createdRun._id,
      productCategory: product?.category || '',
      restrictedProductDetected: false,
      prohibitedWordsDetected: [],
      landingPageValid: true,
      sellerVerified: true,
      policyRiskLevel: 'LOW',
      result: 'PASS',
      notes: 'Initial automated policy pass. Admin review still required.',
    }]),
    CampaignAISuggestion.create([{
      campaign: createdCampaign._id,
      campaignRun: createdRun._id,
      status: 'PENDING',
      modelProvider: 'GEMINI',
      promptVersion: 'managed-boost-v1',
    }]),
    OutboxEvent.create([{
      eventType: 'ADS_GEMINI_SUGGESTION_REQUESTED',
      payload: {
        campaignId: String(createdCampaign._id),
        campaignRunId: String(createdRun._id),
        productName: product?.name || '',
        selectedProviders,
      },
    }, {
      eventType: 'ADS_ADMIN_REVIEW_REQUESTED',
      payload: {
        campaignId: String(createdCampaign._id),
        campaignRunId: String(createdRun._id),
      },
    }]),
    NotificationLog.create([{
      user: userObjectId,
      campaign: createdCampaign._id,
      campaignRun: createdRun._id,
      type: 'CAMPAIGN_SUBMITTED',
      channel: 'IN_APP',
      recipient: String(user.email || user.phoneNumber || user._id),
      subject: 'Campaign submitted',
      status: 'PENDING',
      idempotencyKey: `campaign-submitted:${createdRun._id}`,
    }]),
    audit({
      action: 'Campaign submitted',
      campaignId: createdCampaign._id as any,
      campaignRunId: createdRun._id as any,
      afterValue: {
        selectedProviders,
        grossBudgetMinor: breakdown.grossBudgetMinor,
      },
    })
  );

  const sidecarResults = await Promise.allSettled(sidecarWrites);
  sidecarResults.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('Managed ad sidecar write failed:', result.reason);
    }
  });

  await activityService.recordActivitySafely({
    user: userObjectId,
    actor: userObjectId,
    type: 'AD_BOOST',
    title: 'Ads campaign pending review',
    message: `${createdCampaign.productSnapshot?.name || 'Campaign'} is pending TallyPadi review on ${formatProviders(selectedProviders)}. ${formatMinorNaira(breakdown.grossBudgetMinor)} has been reserved from your ads wallet.`,
    amount: toMajorUnits(breakdown.grossBudgetMinor),
    metadata: {
      campaignId: (createdCampaign._id as any).toString(),
      campaignRunId: (createdRun._id as any).toString(),
      productId: productObjectId?.toString() || null,
      selectedProviders,
      grossBudgetMinor: breakdown.grossBudgetMinor,
      walletBalanceMinor,
    },
  });

  setImmediate(() => {
    generateCampaignAiSuggestionSafely(String(createdCampaign!._id), String(createdRun!._id)).catch(() => {});
  });

  return {
    campaign: createdCampaign,
    run: createdRun,
    providerCampaigns,
    walletBalance,
    walletBalanceMinor,
  };
};

export const createPendingAdCampaign = async (input: {
  userId: string;
  productId: string;
  planId: string;
  platform: string;
  budget?: number;
  adDetails?: {
    brief?: string;
    audience?: string;
    keywords?: string[];
    budgetType?: 'DAILY' | 'TOTAL';
    startDate?: string;
    endDate?: string;
    adDescription?: string;
  };
  globalLandingPageUrl?: string;
  providerLandingPageUrls?: Record<string, string>;
}) => createManagedCampaign({
  userId: input.userId,
  productId: input.productId,
  planId: input.planId,
  providers: input.platform,
  budget: input.budget,
  adDetails: input.adDetails,
  creativeNotes: input.adDetails?.brief,
  targetAudience: input.adDetails?.audience,
  keywords: input.adDetails?.keywords,
  globalLandingPageUrl: input.globalLandingPageUrl,
  providerLandingPageUrls: input.providerLandingPageUrls,
});

export const repairOrphanCampaignReservations = async (userId?: string | Types.ObjectId) => {
  const query: Record<string, unknown> = {
    type: 'CAMPAIGN_BUDGET_RESERVED',
    status: 'COMPLETED',
    campaign: { $ne: null },
    amountMinor: { $gt: 0 },
    createdAt: { $lte: new Date(Date.now() - AD_ORPHAN_RESERVATION_MIN_AGE_MS) },
  };
  if (userId) query.user = toObjectId(userId as any);

  const reservations = await WalletTransaction.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.max(1, Math.min(100, AD_ORPHAN_RESERVATION_REPAIR_LIMIT)))
    .lean();

  const repaired: { reservationId: string; userId: string; amountMinor: number }[] = [];

  for (const reservation of reservations) {
    const applyRepair = async (session?: ClientSession) => {
      const freshReservation = await WalletTransaction.findById(reservation._id).session(session || null);
      if (!freshReservation?.campaign || freshReservation.type !== 'CAMPAIGN_BUDGET_RESERVED' || freshReservation.amountMinor <= 0) {
        return;
      }

      const campaignExists = await AdCampaign.exists({ _id: freshReservation.campaign }).session(session || null);
      if (campaignExists) return;

      const settlementQuery: Record<string, unknown> = {
        _id: { $ne: freshReservation._id },
        type: { $in: RESERVATION_SETTLEMENT_TYPES },
      };
      if (freshReservation.campaignRun) {
        settlementQuery.campaignRun = freshReservation.campaignRun;
      } else {
        settlementQuery.campaign = freshReservation.campaign;
      }

      const alreadySettled = await WalletTransaction.exists(settlementQuery).session(session || null);
      if (alreadySettled) return;

      const idempotencyKey = `orphan-campaign-reservation-release:${freshReservation._id}`;
      const alreadyRepaired = await WalletTransaction.exists({ idempotencyKey }).session(session || null);
      if (alreadyRepaired) return;

      await walletService.releaseReserved({
        userId: freshReservation.user,
        amountMinor: freshReservation.amountMinor,
        campaignId: freshReservation.campaign,
        campaignRunId: freshReservation.campaignRun || null,
        type: 'CAMPAIGN_BUDGET_RELEASED',
        idempotencyKey,
        session,
        metadata: {
          reason: 'orphan_campaign_reservation_repair',
          originalReservationId: String(freshReservation._id),
        },
      });

      repaired.push({
        reservationId: String(freshReservation._id),
        userId: String(freshReservation.user),
        amountMinor: freshReservation.amountMinor,
      });
    };

    const session = await mongoose.startSession();
    try {
      try {
        await session.withTransaction(async () => {
          await applyRepair(session);
        });
      } catch (error) {
        if (!isTransactionUnsupportedError(error)) throw error;
        await applyRepair();
      }
    } catch (error) {
      console.error('Orphan ad reservation repair failed:', error);
    } finally {
      await session.endSession();
    }
  }

  return {
    repairedCount: repaired.length,
    repairedAmountMinor: repaired.reduce((sum, item) => sum + item.amountMinor, 0),
    repaired,
  };
};

export const approveAdCampaign = async (campaignId: string, adminId: string) => {
  const campaignObjectId = toObjectId(campaignId);
  const adminObjectId = toObjectId(adminId);
  const session = await mongoose.startSession();
  let campaign: any = null;
  let run: any = null;
  let providers: IProviderCampaign[] = [];
  let autoProviderCampaignIds: string[] = [];

  try {
    await session.withTransaction(async () => {
      campaign = await AdCampaign.findById(campaignObjectId).session(session);
      if (!campaign) throw new AdCampaignError('Ad campaign not found', 404);
      if (!['PENDING_ADMIN_REVIEW', 'PENDING'].includes(campaign.status)) {
        throw new AdCampaignError('Only pending ad campaigns can be approved', 400);
      }

      run = await CampaignRun.findById(campaign.latestRunId).session(session);
      if (!run) throw new AdCampaignError('Campaign run not found', 404);

      providers = await ProviderCampaign.find({ campaignRun: run._id }).session(session);
      if (!providers.length) throw new AdCampaignError('Provider campaign records are missing', 400);

      const now = new Date();
      const endsAt = new Date(now.getTime() + run.durationDays * 24 * 60 * 60 * 1000);

      await walletService.captureReserved({
        userId: campaign.user,
        amountMinor: run.serviceFeeMinor,
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        type: 'SERVICE_FEE_CAPTURED',
        idempotencyKey: `service-fee:${run._id}`,
        session,
      });

      await walletService.recordNoBalanceLedger({
        userId: campaign.user,
        amountMinor: run.adSpendBudgetMinor,
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        type: 'AD_SPEND_ALLOCATED',
        idempotencyKey: `ad-spend-allocated:${run._id}`,
        session,
      });
      await walletService.recordNoBalanceLedger({
        userId: campaign.user,
        amountMinor: run.safetyReserveMinor,
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        type: 'SAFETY_RESERVE_HELD',
        idempotencyKey: `safety-reserve:${run._id}`,
        session,
      });
      if (run.fxBufferMinor > 0) {
        await walletService.recordNoBalanceLedger({
          userId: campaign.user,
          amountMinor: run.fxBufferMinor,
          campaignId: campaign._id as any,
          campaignRunId: run._id as any,
          type: 'FX_BUFFER_HELD',
          idempotencyKey: `fx-buffer:${run._id}`,
          session,
        });
      }

      for (const provider of providers) {
        if (provider.provider === 'TALLYPADI_MARKETPLACE_BOOST') {
          provider.status = 'RUNNING';
          provider.fulfillmentMode = 'MANUAL';
          provider.providerError = null;
        } else {
          const readiness = getProviderAutomationReadiness(provider.provider);
          provider.status = 'READY_TO_SUBMIT';
          provider.fulfillmentMode = readiness.fulfillmentMode;
          provider.externalAccountId = readiness.externalAccountId || provider.externalAccountId || null;
          provider.providerError = readiness.canSubmitAutomatically ? null : readiness.reason || null;
          if (readiness.canSubmitAutomatically) {
            autoProviderCampaignIds.push(String(provider._id));
          }
        }
        provider.lastSyncedAt = now;
        await provider.save({ session });
      }

      const refreshedProviders = await ProviderCampaign.find({ campaignRun: run._id }).session(session);
      const aggregateStatus = calculateAggregateStatus('APPROVED_BY_TALLYPADI', refreshedProviders);

      run.status = aggregateStatus as any;
      run.startsAt = now;
      run.endsAt = endsAt;
      run.approvedAt = now;
      run.approvedBy = adminObjectId;
      await run.save({ session });

      campaign.status = aggregateStatus as any;
      campaign.activeRunId = run._id as any;
      campaign.reviewedAt = now;
      campaign.reviewedBy = adminObjectId;
      campaign.startedAt = now;
      campaign.expiresAt = endsAt;
      await campaign.save({ session });

      if (campaign.product) {
        const product = await Inventory.findOne({ _id: campaign.product, user: campaign.user, isDeleted: { $ne: true } }).session(session);
        if (!product) throw new AdCampaignError('Product not found', 404);
        const owner = await User.findById(campaign.user)
          .select('businessName countryCode settings.location settings.currencyCode marketplaceVerificationStatus marketplaceVerifiedAt')
          .session(session);

        const seo = getProductSeoFallback(product, owner, campaign);
        product.boosts = (product.boosts || []).filter((boost) => {
          const provider = LEGACY_PROVIDER_MAP[String(boost.platform).toUpperCase()] || boost.platform;
          const sameProvider = (campaign!.selectedProviders || []).includes(provider as AdProvider);
          const expired = new Date(boost.expiresAt).getTime() <= now.getTime();
          return !sameProvider && !expired;
        });

        for (const provider of campaign.selectedProviders || []) {
          product.boosts.push({
            platform: provider,
            planId: campaign.planId || 'managed',
            expiresAt: endsAt,
            campaignId: campaign._id as any,
            seoTitle: seo.title,
            seoDescription: seo.metaDescription,
            seoKeywords: seo.keywords,
            adDescription: seo.adDescription,
          });
        }

        campaign.seo = {
          title: seo.title,
          metaDescription: seo.metaDescription,
          adDescription: seo.adDescription,
          keywords: seo.keywords,
          generatedAt: now,
          source: 'FALLBACK',
        };
        await Promise.all([product.save({ session }), campaign.save({ session })]);
      }

      await audit({
        adminId: adminObjectId,
        action: 'Campaign approved',
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        afterValue: {
          status: aggregateStatus,
          serviceFeeMinor: run.serviceFeeMinor,
          adSpendBudgetMinor: run.adSpendBudgetMinor,
        },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!campaign || !run) throw new AdCampaignError('Ad campaign not found', 404);

  await activityService.recordActivitySafely({
    user: campaign.user,
    actor: adminObjectId,
    type: 'AD_BOOST',
    title: 'Ads campaign approved',
    message: `${campaign.productSnapshot?.name || 'Campaign'} has been approved. TallyPadi will manage fulfillment across ${formatProviders(campaign.selectedProviders || [])}.${autoProviderCampaignIds.length ? ' Automatic provider submission has been queued.' : ''}`,
    amount: toMajorUnits(run.grossBudgetMinor),
    metadata: {
      campaignId: (campaign._id as any).toString(),
      campaignRunId: (run._id as any).toString(),
      selectedProviders: campaign.selectedProviders,
      autoProviderCampaignIds,
    },
  });

  const queueResults = await Promise.allSettled(autoProviderCampaignIds.map((id) => queueAdProviderSubmission(id, 'campaign-approved')));
  queueResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to queue provider automation for ${autoProviderCampaignIds[index]}:`, result.reason);
    }
  });

  return campaign;
};

export const rejectAdCampaign = async (campaignId: string, adminId: string, rawReason?: string) => {
  const campaignObjectId = toObjectId(campaignId);
  const adminObjectId = toObjectId(adminId);
  const reason = cleanText(rawReason || 'Rejected by TallyPadi admin', 500);
  const session = await mongoose.startSession();
  let campaign: any = null;
  let run: any = null;
  let refundAmountMinor = 0;

  try {
    await session.withTransaction(async () => {
      campaign = await AdCampaign.findById(campaignObjectId).session(session);
      if (!campaign) throw new AdCampaignError('Ad campaign not found', 404);
      if (!['PENDING_ADMIN_REVIEW', 'PENDING'].includes(campaign.status)) {
        throw new AdCampaignError('Only campaigns pending TallyPadi review can receive a full rejection refund', 400);
      }

      run = await CampaignRun.findById(campaign.latestRunId).session(session);
      if (!run) throw new AdCampaignError('Campaign run not found', 404);
      refundAmountMinor = run.grossBudgetMinor;

      await walletService.releaseReserved({
        userId: campaign.user,
        amountMinor: refundAmountMinor,
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        type: 'CAMPAIGN_BUDGET_RELEASED',
        idempotencyKey: `reject-refund:${campaign._id}:${run._id}`,
        session,
        metadata: { reason },
      });

      await ProviderCampaign.updateMany(
        { campaignRun: run._id },
        { $set: { status: 'CANCELLED', refundStatus: 'REFUNDED' } },
        { session }
      );

      run.status = 'CANCELLED';
      run.completedAt = new Date();
      await run.save({ session });

      campaign.status = 'REJECTED_BY_TALLYPADI';
      campaign.reviewedAt = new Date();
      campaign.reviewedBy = adminObjectId;
      campaign.completedAt = new Date();
      campaign.rejectionReason = reason;
      campaign.refundAmount = toMajorUnits(refundAmountMinor);
      campaign.walletCharged = false;
      await campaign.save({ session });

      await audit({
        adminId: adminObjectId,
        action: 'Campaign rejected',
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        reason,
        afterValue: { refundAmountMinor },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!campaign || !run) throw new AdCampaignError('Ad campaign not found', 404);

  await activityService.recordActivitySafely({
    user: campaign.user,
    actor: adminObjectId,
    type: 'AD_BOOST',
    title: 'Ads campaign rejected',
    message: `${campaign.productSnapshot?.name || 'Campaign'} was rejected. ${formatMinorNaira(refundAmountMinor)} has been returned to your ads wallet.`,
    amount: toMajorUnits(refundAmountMinor),
    metadata: {
      campaignId: (campaign._id as any).toString(),
      campaignRunId: (run._id as any).toString(),
      reason,
      refundAmountMinor,
    },
  });

  return campaign;
};

export const completeAdCampaign = async (campaignId: string, adminId?: string) => {
  const campaignObjectId = toObjectId(campaignId);
  const adminObjectId = adminId ? toObjectId(adminId) : null;
  const session = await mongoose.startSession();
  let campaign: any = null;
  let run: any = null;
  let refundMinor = 0;

  try {
    await session.withTransaction(async () => {
      campaign = await AdCampaign.findById(campaignObjectId).session(session);
      if (!campaign) throw new AdCampaignError('Ad campaign not found', 404);

      run = await CampaignRun.findById(campaign.activeRunId || campaign.latestRunId).session(session);
      if (!run) throw new AdCampaignError('Campaign run not found', 404);

      const providers = await ProviderCampaign.find({ campaignRun: run._id }).session(session);
      await ProviderCampaign.updateMany(
        { campaignRun: run._id, status: { $nin: ['REJECTED_BY_PROVIDER', 'FAILED', 'CANCELLED'] } },
        { $set: { status: 'COMPLETED', settlementStatus: 'RECONCILED' } },
        { session }
      );

      refundMinor = Math.max(0, run.remainingBudgetMinor + run.safetyReserveMinor + run.fxBufferMinor + run.unallocatedBudgetMinor);
      if (refundMinor > 0) {
        await walletService.releaseReserved({
          userId: campaign.user,
          amountMinor: refundMinor,
          campaignId: campaign._id as any,
          campaignRunId: run._id as any,
          type: 'UNUSED_BUDGET_REFUNDED',
          idempotencyKey: `completion-unused-refund:${run._id}`,
          session,
        });
      }

      if (campaign.product) {
        await Inventory.updateOne(
          { _id: campaign.product, user: campaign.user },
          { $pull: { boosts: { campaignId: campaign._id } } },
          { session }
        );
      }

      run.status = 'COMPLETED';
      run.remainingBudgetMinor = 0;
      run.completedAt = new Date();
      await run.save({ session });

      campaign.status = 'COMPLETED';
      campaign.completedAt = new Date();
      if (adminObjectId) campaign.reviewedBy = adminObjectId;
      await campaign.save({ session });

      await audit({
        adminId: adminObjectId,
        action: 'Campaign completed',
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        afterValue: {
          refundMinor,
          providerCount: providers.length,
        },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!campaign || !run) throw new AdCampaignError('Ad campaign not found', 404);

  await activityService.recordActivitySafely({
    user: campaign.user,
    actor: adminObjectId,
    type: 'AD_BOOST',
    title: 'Ads campaign completed',
    message: `${campaign.productSnapshot?.name || 'Campaign'} has been marked completed.${refundMinor > 0 ? ` ${formatMinorNaira(refundMinor)} unused budget was returned to your ads wallet.` : ''}`,
    amount: toMajorUnits(refundMinor),
    metadata: {
      campaignId: (campaign._id as any).toString(),
      campaignRunId: (run._id as any).toString(),
      refundMinor,
    },
  });

  return campaign;
};

export const pauseAdCampaign = async (campaignId: string, adminId: string, reason?: string) => {
  const campaign = await AdCampaign.findByIdAndUpdate(
    toObjectId(campaignId),
    { $set: { status: 'PAUSED', adminNotes: cleanText(reason, 1000) } },
    { new: true }
  );
  if (!campaign) throw new AdCampaignError('Ad campaign not found', 404);
  if (campaign.activeRunId) {
    await CampaignRun.updateOne({ _id: campaign.activeRunId }, { $set: { status: 'PAUSED' } });
    await ProviderCampaign.updateMany({ campaignRun: campaign.activeRunId, status: 'RUNNING' }, { $set: { status: 'PAUSED' } });
  }
  await audit({ adminId, action: 'Campaign paused', campaignId, campaignRunId: campaign.activeRunId as any, reason });
  return campaign;
};

export const resumeAdCampaign = async (campaignId: string, adminId: string) => {
  const campaign = await AdCampaign.findById(toObjectId(campaignId));
  if (!campaign) throw new AdCampaignError('Ad campaign not found', 404);
  if (!campaign.activeRunId) throw new AdCampaignError('No active campaign run to resume', 400);
  const providers = await ProviderCampaign.find({ campaignRun: campaign.activeRunId });
  await ProviderCampaign.updateMany({ campaignRun: campaign.activeRunId, status: 'PAUSED' }, { $set: { status: 'RUNNING' } });
  const freshProviders = providers.map((provider) => {
    if (provider.status === 'PAUSED') provider.status = 'RUNNING';
    return provider;
  });
  const status = calculateAggregateStatus('APPROVED_BY_TALLYPADI', freshProviders);
  await Promise.all([
    CampaignRun.updateOne({ _id: campaign.activeRunId }, { $set: { status } }),
    AdCampaign.updateOne({ _id: campaign._id }, { $set: { status } }),
  ]);
  await audit({ adminId, action: 'Campaign resumed', campaignId, campaignRunId: campaign.activeRunId as any });
  campaign.status = status as any;
  return campaign;
};

export const pauseCampaignByMerchant = async (input: {
  campaignId: string;
  userId: string;
  reason?: string;
}) => {
  const campaignObjectId = toObjectId(input.campaignId);
  const userObjectId = toObjectId(input.userId);
  const reason = cleanText(input.reason || 'Paused by merchant', 500);
  const session = await mongoose.startSession();
  let campaign: any = null;
  let providerIds: string[] = [];

  try {
    await session.withTransaction(async () => {
      campaign = await AdCampaign.findOne({ _id: campaignObjectId, user: userObjectId }).session(session);
      if (!campaign) throw new AdCampaignError('Campaign not found', 404);
      if (!['ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON', 'ACTIVE_WITH_PENDING_CHANGES'].includes(String(campaign.status))) {
        throw new AdCampaignError('Only running or starting campaigns can be paused', 400);
      }
      const runId = campaign.activeRunId || campaign.latestRunId;
      if (!runId) throw new AdCampaignError('Campaign run not found', 404);

      const providers = await ProviderCampaign.find({
        campaignRun: runId,
        status: { $in: ['READY_TO_SUBMIT', 'SUBMITTED_TO_PROVIDER', 'PROVIDER_REVIEW', 'APPROVED_BY_PROVIDER', 'RUNNING'] },
      }).session(session);
      providerIds = providers.map((provider) => String(provider._id));

      await ProviderCampaign.updateMany(
        { _id: { $in: providers.map((provider) => provider._id) } },
        { $set: { status: 'PAUSED', adminNotes: reason, lastSyncedAt: new Date() } },
        { session }
      );
      await CampaignRun.updateOne({ _id: runId }, { $set: { status: 'PAUSED' } }, { session });

      campaign.status = 'PAUSED';
      campaign.adminNotes = reason;
      await campaign.save({ session });

      await audit({
        action: 'Campaign paused by merchant',
        campaignId: campaign._id as any,
        campaignRunId: runId as any,
        reason,
        afterValue: { providerIds },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!campaign) throw new AdCampaignError('Campaign not found', 404);

  await Promise.allSettled(providerIds.map((id) => queueAdProviderControl(id, 'PAUSE', 'merchant-paused')));
  await activityService.recordActivitySafely({
    user: userObjectId,
    actor: userObjectId,
    type: 'AD_BOOST',
    title: 'Ads campaign paused',
    message: `${campaign.productSnapshot?.name || 'Campaign'} has been paused. TallyPadi is pausing provider delivery where automation is connected.`,
    metadata: { campaignId: String(campaign._id), providerIds },
  });

  return campaign;
};

export const stopCampaignByMerchant = async (input: {
  campaignId: string;
  userId: string;
  reason?: string;
}) => {
  const campaignObjectId = toObjectId(input.campaignId);
  const userObjectId = toObjectId(input.userId);
  const reason = cleanText(input.reason || 'Stopped by merchant', 500);
  const session = await mongoose.startSession();
  let campaign: any = null;
  let runId: Types.ObjectId | null = null;
  let providerIds: string[] = [];

  try {
    await session.withTransaction(async () => {
      campaign = await AdCampaign.findOne({ _id: campaignObjectId, user: userObjectId }).session(session);
      if (!campaign) throw new AdCampaignError('Campaign not found', 404);
      if (['COMPLETED', 'CANCELLED', 'REJECTED_BY_TALLYPADI', 'REJECTED'].includes(String(campaign.status))) {
        throw new AdCampaignError('Campaign is already closed', 400);
      }
      runId = (campaign.activeRunId || campaign.latestRunId) as Types.ObjectId | null;
      if (!runId) throw new AdCampaignError('Campaign run not found', 404);

      const providers = await ProviderCampaign.find({
        campaignRun: runId,
        status: { $nin: ['COMPLETED', 'CANCELLED', 'FAILED', 'REJECTED_BY_PROVIDER'] },
      }).session(session);
      providerIds = providers.map((provider) => String(provider._id));

      await ProviderCampaign.updateMany(
        { _id: { $in: providers.map((provider) => provider._id) } },
        {
          $set: {
            status: 'CANCELLED',
            adminNotes: reason,
            refundStatus: 'PENDING_REFUND',
            lastSyncedAt: new Date(),
          },
        },
        { session }
      );
      await CampaignRun.updateOne(
        { _id: runId },
        { $set: { status: 'CANCELLED', completedAt: new Date() } },
        { session }
      );

      if (campaign.product) {
        await Inventory.updateOne(
          { _id: campaign.product, user: campaign.user },
          { $pull: { boosts: { campaignId: campaign._id } } },
          { session }
        );
      }

      campaign.status = 'CANCELLED';
      campaign.completedAt = new Date();
      campaign.adminNotes = reason;
      await campaign.save({ session });

      await audit({
        action: 'Campaign stopped by merchant',
        campaignId: campaign._id as any,
        campaignRunId: runId as any,
        reason,
        afterValue: {
          providerIds,
          refundStatus: 'PENDING_REFUND',
        },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!campaign) throw new AdCampaignError('Campaign not found', 404);

  await Promise.allSettled([
    ...providerIds.map((id) => queueAdProviderMetricsSync(id, 'merchant-stopped-before-reconciliation')),
    ...providerIds.map((id) => queueAdProviderControl(id, 'STOP', 'merchant-stopped')),
  ]);
  await activityService.recordActivitySafely({
    user: userObjectId,
    actor: userObjectId,
    type: 'AD_BOOST',
    title: 'Ads campaign stopped',
    message: `${campaign.productSnapshot?.name || 'Campaign'} has been stopped. Any unused provider balance will be reconciled before refund.`,
    metadata: { campaignId: String(campaign._id), campaignRunId: runId ? String(runId) : null, providerIds },
  });

  return campaign;
};

export const queueCampaignMetricsSync = async (campaignId: string, userId?: string) => {
  const query: Record<string, unknown> = { _id: toObjectId(campaignId) };
  if (userId) query.user = toObjectId(userId);
  const campaign = await AdCampaign.findOne(query).select('_id activeRunId latestRunId');
  if (!campaign) throw new AdCampaignError('Campaign not found', 404);
  const runId = campaign.activeRunId || campaign.latestRunId;
  if (!runId) return { queued: 0 };

  const providers = await ProviderCampaign.find({
    campaignRun: runId,
    provider: { $in: PAID_AD_PROVIDERS },
    externalCampaignId: { $nin: ['', null] },
  }).select('_id');

  const results = await Promise.allSettled(providers.map((provider) => queueAdProviderMetricsSync(String(provider._id))));
  return {
    queued: results.filter((result) => result.status === 'fulfilled').length,
  };
};

export const updateProviderCampaignStatus = async (input: {
  providerCampaignId: string;
  adminId: string;
  status: ProviderCampaignStatus;
  rejectionReason?: string;
  adminNotes?: string;
}) => {
  const provider = await ProviderCampaign.findById(toObjectId(input.providerCampaignId));
  if (!provider) throw new AdCampaignError('Provider campaign not found', 404);

  const before = { status: provider.status, rejectionReason: provider.rejectionReason };
  provider.status = input.status;
  provider.adminNotes = cleanText(input.adminNotes, 2000) || provider.adminNotes;
  if (input.status === 'REJECTED_BY_PROVIDER') {
    provider.rejectionReason = cleanText(input.rejectionReason || 'Rejected by provider', 1000);
    provider.rejectedAt = new Date();
    provider.refundStatus = provider.remainingBudgetWalletMinor > 0 ? 'HELD' : 'NOT_APPLICABLE';
  }
  if (input.status === 'RUNNING' && provider.refundStatus === 'HELD_FOR_RESUBMISSION') {
    provider.refundStatus = provider.remainingBudgetWalletMinor > 0 ? 'HELD' : 'NOT_APPLICABLE';
  }
  await provider.save();

  const providers = await ProviderCampaign.find({ campaignRun: provider.campaignRun });
  const campaign = await AdCampaign.findById(provider.campaign);
  if (campaign) {
    const nextStatus = calculateAggregateStatus(campaign.status, providers);
    await Promise.all([
      AdCampaign.updateOne({ _id: campaign._id }, { $set: { status: nextStatus } }),
      CampaignRun.updateOne({ _id: provider.campaignRun }, { $set: { status: nextStatus } }),
    ]);
  }

  await audit({
    adminId: input.adminId,
    action: 'Provider status changed',
    campaignId: provider.campaign,
    campaignRunId: provider.campaignRun,
    providerCampaignId: provider._id as any,
    beforeValue: before,
    afterValue: { status: provider.status, rejectionReason: provider.rejectionReason },
  });

  return provider;
};

export const updateProviderCampaignMetrics = async (input: {
  providerCampaignId: string;
  adminId: string;
  impressions?: number;
  clicks?: number;
  views?: number;
  conversions?: number;
  allConversions?: number;
  spentMinor?: number;
  spent?: number;
}) => {
  const session = await mongoose.startSession();
  let provider: any = null;
  let beforeSpent = 0;

  try {
    await session.withTransaction(async () => {
      provider = await ProviderCampaign.findById(toObjectId(input.providerCampaignId)).session(session);
      if (!provider) throw new AdCampaignError('Provider campaign not found', 404);
      const run = await CampaignRun.findById(provider.campaignRun).session(session);
      if (!run) throw new AdCampaignError('Campaign run not found', 404);

      const spentMinor = input.spentMinor !== undefined ? Number(input.spentMinor) : Math.round(Number(input.spent || 0) * 100);
      const requestedSpent = Number.isFinite(spentMinor) ? spentMinor : provider.spentWalletMinor;
      const safeSpentMinor = Math.max(provider.spentWalletMinor, Math.min(provider.allocatedBudgetWalletMinor, requestedSpent));

      beforeSpent = provider.spentWalletMinor;
      const spendDelta = safeSpentMinor - beforeSpent;
      if (spendDelta > 0) {
        await walletService.captureReserved({
          userId: provider.user,
          amountMinor: spendDelta,
          campaignId: provider.campaign,
          campaignRunId: provider.campaignRun,
          type: 'AD_SPEND_ALLOCATED',
          idempotencyKey: `provider-spend:${provider._id}:${safeSpentMinor}`,
          session,
          metadata: {
            provider: provider.provider,
            previousSpentMinor: beforeSpent,
            newSpentMinor: safeSpentMinor,
          },
        });
      }

      provider.impressions = Math.max(0, Number(input.impressions ?? provider.impressions ?? 0));
      provider.clicks = Math.max(0, Number(input.clicks ?? provider.clicks ?? 0));
      provider.views = Math.max(0, Number(input.views ?? provider.views ?? 0));
      provider.conversions = Math.max(0, Number(input.conversions ?? provider.conversions ?? 0));
      provider.allConversions = Math.max(0, Number(input.allConversions ?? provider.allConversions ?? provider.conversions ?? 0));
      provider.spentWalletMinor = safeSpentMinor;
      provider.remainingBudgetWalletMinor = Math.max(0, provider.allocatedBudgetWalletMinor - safeSpentMinor);
      provider.ctr = provider.impressions > 0 ? provider.clicks / provider.impressions : 0;
      provider.cpc = provider.clicks > 0 ? safeSpentMinor / provider.clicks : 0;
      provider.lastSyncedAt = new Date();
      await provider.save({ session });

      const providers = await ProviderCampaign.find({ campaignRun: provider.campaignRun }).session(session);
      run.spentAmountMinor = providers.reduce((sum, item) => sum + (item.spentWalletMinor || 0), 0);
      run.remainingBudgetMinor = providers.reduce((sum, item) => sum + (item.remainingBudgetWalletMinor || 0), 0);
      await run.save({ session });

      await CampaignMetricSnapshot.create([{
        campaign: provider.campaign,
        campaignRun: provider.campaignRun,
        providerCampaign: provider._id,
        provider: provider.provider,
        source: 'MANUAL_ADMIN',
        date: new Date().toISOString().slice(0, 10),
        impressions: provider.impressions,
        clicks: provider.clicks,
        views: provider.views,
        conversions: provider.conversions,
        allConversions: provider.allConversions,
        spendMinor: provider.spentWalletMinor,
        currency: provider.walletCurrency,
        ctr: provider.ctr,
        cpc: provider.cpc,
      }], { session });

      await audit({
        adminId: input.adminId,
        action: 'Provider metrics updated',
        campaignId: provider.campaign,
        campaignRunId: provider.campaignRun,
        providerCampaignId: provider._id as any,
        beforeValue: { spentWalletMinor: beforeSpent },
        afterValue: { spentWalletMinor: provider.spentWalletMinor, impressions: provider.impressions, clicks: provider.clicks, conversions: provider.conversions },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  if (!provider) throw new AdCampaignError('Provider campaign not found', 404);
  return provider;
};

export const refundProviderCampaignBalance = async (providerCampaignId: string, adminId?: string | null) => {
  const session = await mongoose.startSession();
  let provider: any = null;
  let refundMinor = 0;
  try {
    await session.withTransaction(async () => {
      provider = await ProviderCampaign.findById(toObjectId(providerCampaignId)).session(session);
      if (!provider) throw new AdCampaignError('Provider campaign not found', 404);
      if (provider.refundStatus === 'REFUNDED') throw new AdCampaignError('Provider balance already refunded', 400);
      refundMinor = Math.max(0, provider.remainingBudgetWalletMinor || 0);
      if (refundMinor <= 0) throw new AdCampaignError('No provider balance available to refund', 400);

      await walletService.releaseReserved({
        userId: provider.user,
        amountMinor: refundMinor,
        campaignId: provider.campaign,
        campaignRunId: provider.campaignRun,
        providerCampaignId: provider._id as any,
        type: 'PROVIDER_ALLOCATION_REFUNDED',
        idempotencyKey: `provider-refund:${provider._id}`,
        session,
      });

      provider.remainingBudgetWalletMinor = 0;
      provider.refundStatus = 'REFUNDED';
      await provider.save({ session });

      const run = await CampaignRun.findById(provider.campaignRun).session(session);
      if (run) {
        run.remainingBudgetMinor = Math.max(0, run.remainingBudgetMinor - refundMinor);
        await run.save({ session });
      }

      await audit({
        adminId: adminId ? adminId : null,
        action: 'Provider allocation refunded',
        campaignId: provider.campaign,
        campaignRunId: provider.campaignRun,
        providerCampaignId: provider._id as any,
        afterValue: { refundMinor },
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  if (!provider) throw new AdCampaignError('Provider campaign not found', 404);
  return provider;
};

export const processAutomatedAdRejection = async (providerCampaignId: string, reason: string) => {
  const provider = await ProviderCampaign.findById(toObjectId(providerCampaignId))
    .populate('campaign')
    .populate('campaignRun');
    
  if (!provider) throw new AdCampaignError('Provider campaign not found', 404);
  if (provider.status === 'REJECTED_BY_PROVIDER') return provider;

  const campaign = provider.campaign as any;

  // 1. Mark as rejected by provider
  provider.status = 'REJECTED_BY_PROVIDER';
  provider.rejectionReason = cleanText(reason, 1000);
  provider.rejectedAt = new Date();
  provider.providerReviewStatus = 'REJECTED';
  provider.lastSyncedAt = new Date();
  await provider.save();

  // 2. Refund wallet allocation automatically (adminId = null)
  if (provider.remainingBudgetWalletMinor > 0 && provider.refundStatus !== 'REFUNDED') {
    try {
      await refundProviderCampaignBalance(providerCampaignId, null);
    } catch (error) {
      console.error(`Automated refund failed for provider campaign ${providerCampaignId}:`, error);
    }
  }

  // 3. Update aggregate campaign status
  const providers = await ProviderCampaign.find({ campaignRun: provider.campaignRun });
  const campaignInfo = await AdCampaign.findById(provider.campaign);
  if (campaignInfo) {
    const nextStatus = calculateAggregateStatus(campaignInfo.status, providers);
    await Promise.all([
      AdCampaign.updateOne({ _id: campaignInfo._id }, { $set: { status: nextStatus } }),
      CampaignRun.updateOne({ _id: provider.campaignRun }, { $set: { status: nextStatus } }),
    ]);
  }

  // 4. Record Activity Log
  await activityService.recordActivitySafely({
    user: provider.user,
    type: 'AD_BOOST',
    title: 'Ad Campaign Rejected by Provider',
    message: `Your ad campaign "${campaign?.name || 'Campaign'}" was rejected by ${provider.provider}. Your remaining ad budget has been refunded to your wallet.`,
    metadata: {
      providerCampaignId: String(provider._id),
      reason,
    }
  });

  return provider;
};

export const reallocateProviderCampaignBalance = async (input: {
  providerCampaignId: string;
  targetProviderCampaignIds: string[];
  adminId: string;
}) => {
  const source = await ProviderCampaign.findById(toObjectId(input.providerCampaignId));
  if (!source) throw new AdCampaignError('Provider campaign not found', 404);
  const amount = source.remainingBudgetWalletMinor || 0;
  if (amount <= 0) throw new AdCampaignError('No provider balance available to reallocate', 400);
  const targets = await ProviderCampaign.find({
    _id: { $in: input.targetProviderCampaignIds.map(toObjectId) },
    campaignRun: source.campaignRun,
    status: { $in: ['RUNNING', 'READY_TO_SUBMIT', 'PROVIDER_REVIEW', 'APPROVED_BY_PROVIDER'] },
  });
  if (!targets.length) throw new AdCampaignError('Select at least one active or runnable provider to receive this budget', 400);

  const base = Math.floor(amount / targets.length);
  let remainder = amount - base * targets.length;
  for (const target of targets) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    target.allocatedBudgetWalletMinor += base + extra;
    target.remainingBudgetWalletMinor += base + extra;
    await target.save();
  }

  source.remainingBudgetWalletMinor = 0;
  source.refundStatus = 'REALLOCATED';
  await source.save();

  await audit({
    adminId: input.adminId,
    action: 'Provider allocation reallocated',
    campaignId: source.campaign,
    campaignRunId: source.campaignRun,
    providerCampaignId: source._id as any,
    afterValue: { amountMinor: amount, targetProviderCampaignIds: input.targetProviderCampaignIds },
  });

  return source;
};

export const resubmitProviderCampaign = async (providerCampaignId: string, adminId: string, notes?: string) => {
  const provider = await ProviderCampaign.findById(toObjectId(providerCampaignId));
  if (!provider) throw new AdCampaignError('Provider campaign not found', 404);
  const readiness = getProviderAutomationReadiness(provider.provider);
  provider.status = 'READY_TO_SUBMIT';
  provider.refundStatus = provider.remainingBudgetWalletMinor > 0 ? 'HELD_FOR_RESUBMISSION' : 'NOT_APPLICABLE';
  provider.fulfillmentMode = readiness.fulfillmentMode;
  provider.externalAccountId = readiness.externalAccountId || provider.externalAccountId || null;
  provider.adminNotes = cleanText(notes, 2000) || provider.adminNotes;
  provider.providerError = readiness.canSubmitAutomatically ? null : readiness.reason || null;
  await provider.save();
  await audit({ adminId, action: 'Provider campaign resubmitted', campaignId: provider.campaign, campaignRunId: provider.campaignRun, providerCampaignId: provider._id as any, reason: notes });
  if (readiness.canSubmitAutomatically) {
    queueAdProviderSubmission(String(provider._id), 'admin-resubmitted').catch((error) => {
      console.error(`Failed to queue provider resubmission for ${provider._id}:`, error);
    });
  }
  return provider;
};

export const createCampaignChangeRequest = async (input: {
  campaignId: string;
  userId: string;
  changeType: any;
  requestedValues: Record<string, unknown>;
}) => {
  const campaign = await AdCampaign.findOne({ _id: toObjectId(input.campaignId), user: toObjectId(input.userId) });
  if (!campaign) throw new AdCampaignError('Campaign not found', 404);
  if (!campaign.activeRunId && !campaign.latestRunId) throw new AdCampaignError('Campaign run not found', 404);

  const runId = (campaign.activeRunId || campaign.latestRunId) as Types.ObjectId;
  const request = await CampaignChangeRequest.create({
    campaign: campaign._id,
    campaignRun: runId as any,
    requestedByUser: campaign.user,
    changeType: input.changeType,
    previousValues: {
      targetAudience: campaign.targetAudience,
      targetLocation: campaign.targetLocation,
      ageRange: campaign.ageRange,
      keywords: campaign.keywords,
      creativeNotes: campaign.creativeNotes,
      selectedProviders: campaign.selectedProviders,
    },
    requestedValues: input.requestedValues,
    status: 'PENDING_ADMIN_REVIEW',
  });

  campaign.status = campaign.status === 'ACTIVE' ? 'ACTIVE_WITH_PENDING_CHANGES' : 'REQUIRES_REVIEW_AFTER_EDIT';
  await campaign.save();
  await CampaignRun.updateOne({ _id: runId }, { $set: { status: campaign.status } });
  return request;
};

export const topUpCampaign = async (input: {
  campaignId: string;
  userId: string;
  amount: number;
}) => {
  const campaign = await AdCampaign.findOne({ _id: toObjectId(input.campaignId), user: toObjectId(input.userId) });
  if (!campaign) throw new AdCampaignError('Campaign not found', 404);
  const run = await CampaignRun.findById(campaign.activeRunId || campaign.latestRunId);
  if (!run) throw new AdCampaignError('Campaign run not found', 404);
  if (!['ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON'].includes(String(campaign.status))) {
    throw new AdCampaignError('Only active or starting campaigns can be topped up', 400);
  }

  const topUpMinor = convertLegacyBudgetToMinor(input.amount);
  if (topUpMinor <= 0) throw new AdCampaignError('Top-up amount must be valid', 400);
  const providers = await ProviderCampaign.find({
    campaignRun: run._id,
    status: { $ne: 'REJECTED_BY_PROVIDER' },
    provider: { $in: PAID_AD_PROVIDERS },
  });
  if (!providers.length) throw new AdCampaignError('No runnable paid providers can receive this top-up', 400);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await walletService.reserveCampaignBudget({
        userId: campaign.user,
        amountMinor: topUpMinor,
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        idempotencyKey: `campaign-top-up:${run._id}:${Date.now()}`,
        session,
      });

      const base = Math.floor(topUpMinor / providers.length);
      let remainder = topUpMinor - base * providers.length;
      for (const provider of providers) {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        await ProviderCampaign.updateOne(
          { _id: provider._id },
          { $inc: { allocatedBudgetWalletMinor: base + extra, remainingBudgetWalletMinor: base + extra } },
          { session }
        );
      }

      await CampaignRun.updateOne(
        { _id: run._id },
        { $inc: { grossBudgetMinor: topUpMinor, adSpendBudgetMinor: topUpMinor, remainingBudgetMinor: topUpMinor } },
        { session }
      );

      await walletService.recordNoBalanceLedger({
        userId: campaign.user,
        amountMinor: topUpMinor,
        campaignId: campaign._id as any,
        campaignRunId: run._id as any,
        type: 'CAMPAIGN_TOP_UP',
        idempotencyKey: `campaign-top-up-ledger:${run._id}:${Date.now()}`,
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  return AdCampaign.findById(campaign._id);
};

export const resumeCompletedCampaign = async (input: {
  campaignId: string;
  userId: string;
  amount?: number;
  durationDays?: number;
}) => {
  const original = await AdCampaign.findOne({ _id: toObjectId(input.campaignId), user: toObjectId(input.userId) }).lean();
  if (!original) throw new AdCampaignError('Campaign not found', 404);
  const result = await createManagedCampaign({
    userId: input.userId,
    productId: original.product ? String(original.product) : undefined,
    durationDays: input.durationDays || original.durationDays || 3,
    providers: original.selectedProviders || original.platforms || ['TALLYPADI_MARKETPLACE_BOOST'],
    budget: input.amount || Number(original.budget || 0),
    targetAudience: original.targetAudience || original.adDetails?.audience || '',
    targetLocation: original.targetLocation,
    ageRange: original.ageRange as any,
    campaignGoal: original.campaignGoal || '',
    creativeNotes: original.creativeNotes || original.adDetails?.brief || '',
    keywords: original.keywords || original.adDetails?.keywords || [],
  });
  return result;
};

export const getCampaignDetail = async (campaignId: string, userId?: string) => {
  const query: Record<string, unknown> = { _id: toObjectId(campaignId) };
  if (userId) query.user = toObjectId(userId);
  const campaign = await AdCampaign.findOne(query)
    .populate('user', 'businessName name email phoneNumber planType walletBalance shopSlug')
    .populate('product', 'name quantity lastUnitPrice image category isPublished')
    .populate('reviewedBy', 'businessName name email phoneNumber role')
    .lean();
  if (!campaign) throw new AdCampaignError('Campaign not found', 404);
  const [run, providerCampaigns, aiSuggestions, metrics] = await Promise.all([
    CampaignRun.findById(campaign.activeRunId || campaign.latestRunId).lean(),
    ProviderCampaign.find({ campaign: campaign._id }).sort({ createdAt: 1 }).lean(),
    CampaignAISuggestion.find({ campaign: campaign._id }).sort({ createdAt: -1 }).limit(5).lean(),
    CampaignMetricSnapshot.find({ campaign: campaign._id }).sort({ date: -1, createdAt: -1 }).limit(50).lean(),
  ]);
  return serializeAdCampaign(campaign, { run, providerCampaigns, aiSuggestions, metrics });
};

export const markExpiredCampaignsCompleted = async (limit = AD_CAMPAIGN_EXPIRY_BATCH_SIZE) => {
  const now = new Date();
  const expiredRuns = await CampaignRun.find({
    status: { $in: ['ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON'] },
    endsAt: { $ne: null, $lte: now },
  }).limit(Math.max(1, Math.min(2000, limit)));

  let completedCount = 0;
  for (const run of expiredRuns) {
    try {
      await completeAdCampaign(String(run.campaign));
      completedCount += 1;
    } catch (error) {
      console.error('Failed to complete expired managed campaign:', error);
    }
  }

  const legacyExpiredCampaigns = await AdCampaign.find({
    status: 'RUNNING',
    expiresAt: { $ne: null, $lte: now },
    $or: [{ latestRunId: null }, { latestRunId: { $exists: false } }],
  }).limit(Math.max(1, Math.min(2000, limit)));

  for (const campaign of legacyExpiredCampaigns) {
    campaign.status = 'COMPLETED';
    campaign.completedAt = campaign.expiresAt || now;
    await campaign.save();
    completedCount += 1;
  }

  return { completedCount };
};

export const purgeExpiredBoostMetadata = async (retentionDays = AD_BOOST_METADATA_RETENTION_DAYS) => {
  const safeRetentionDays = Math.max(1, Math.min(365, Number(retentionDays) || 15));
  const cutoff = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000);

  const [campaignResult, productResult] = await Promise.all([
    AdCampaign.updateMany(
      {
        status: 'COMPLETED',
        expiresAt: { $ne: null, $lte: cutoff },
        $or: [
          { 'seo.title': { $exists: true, $ne: '' } },
          { 'seo.metaDescription': { $exists: true, $ne: '' } },
          { 'seo.adDescription': { $exists: true, $ne: '' } },
          { 'seo.keywords.0': { $exists: true } },
        ],
      },
      {
        $set: {
          'seo.title': '',
          'seo.metaDescription': '',
          'seo.adDescription': '',
          'seo.keywords': [],
          'seo.generatedAt': null,
          'seo.source': null,
        },
      }
    ),
    Inventory.updateMany(
      { 'boosts.expiresAt': { $lte: cutoff } },
      { $pull: { boosts: { expiresAt: { $lte: cutoff } } } }
    ),
  ]);

  return {
    cutoff,
    campaignMetadataPurged: campaignResult.modifiedCount || 0,
    productBoostsRemoved: productResult.modifiedCount || 0,
  };
};

export const runAdBoostMaintenance = async () => {
  const expiry = await markExpiredCampaignsCompleted();
  const cleanup = await purgeExpiredBoostMetadata();

  return {
    ...expiry,
    ...cleanup,
  };
};

export const normalizeCampaignStatus = (raw: unknown): AdCampaignStatus | undefined => {
  const status = String(raw || '').trim().toUpperCase();
  const allowed: AdCampaignStatus[] = [
    'DRAFT',
    'PENDING_ADMIN_REVIEW',
    'REJECTED_BY_TALLYPADI',
    'APPROVED_BY_TALLYPADI',
    'SUBMITTING_TO_PROVIDERS',
    'STARTING_SOON',
    'ACTIVE',
    'ACTIVE_WITH_PENDING_CHANGES',
    'PARTIALLY_ACTIVE',
    'PARTIALLY_REJECTED',
    'PAUSED',
    'REQUIRES_REVIEW_AFTER_EDIT',
    'COMPLETED',
    'CANCELLED',
    'FAILED',
    'PENDING',
    'RUNNING',
    'REJECTED',
  ];
  return allowed.includes(status as AdCampaignStatus) ? status as AdCampaignStatus : undefined;
};
