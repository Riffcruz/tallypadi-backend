import { Types } from 'mongoose';
import { AdminSettings } from '../models/adminSettings.model';
import { AdCampaign, AdCampaignStatus, AdPlatform, IAdCampaign } from '../models/adCampaign.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import { activityService } from './activity.service';

export const AD_PLATFORMS: AdPlatform[] = ['TALLYPADI_SEO', 'META', 'TIKTOK'];
export const ALL_AD_PLATFORMS = 'ALL';

const MAX_AD_BOOST_BUDGET_NAIRA = Number(process.env.MAX_AD_BOOST_BUDGET_NAIRA || 50_000_000);

export const DEFAULT_ADS_PLANS = [
  { id: '1_day', durationDays: 1, price: 500, label: '1 Day Boost' },
  { id: '5_days', durationDays: 5, price: 2000, label: '5 Days Boost' },
  { id: '7_days', durationDays: 7, price: 2500, label: '1 Week Boost' },
  { id: '30_days', durationDays: 30, price: 8000, label: '1 Month Boost' },
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

const money = (value: number) => Math.round(value * 100) / 100;

const platformLabel = (platform: AdPlatform) => {
  if (platform === 'TALLYPADI_SEO') return 'TallyPadi SEO & Google';
  if (platform === 'META') return 'Meta Ads';
  return 'TikTok Ads';
};

const formatPlatforms = (platforms: AdPlatform[]) => platforms.map(platformLabel).join(', ');

export const getConfiguredAdsPlans = async () => {
  let settings = await AdminSettings.findOne();
  if (!settings) settings = await AdminSettings.create({});

  return settings.adsPlans && settings.adsPlans.length > 0 ? settings.adsPlans : DEFAULT_ADS_PLANS;
};

export const expandAdPlatforms = (raw: unknown): AdPlatform[] => {
  const value = String(raw || '').trim().toUpperCase();
  if (value === ALL_AD_PLATFORMS) return [...AD_PLATFORMS];
  if (AD_PLATFORMS.includes(value as AdPlatform)) return [value as AdPlatform];
  throw new AdCampaignError('Invalid platform selected', 400);
};

export const serializeAdCampaign = (campaign: IAdCampaign | any) => ({
  id: String(campaign._id),
  user: campaign.user,
  product: campaign.product,
  status: campaign.status,
  platforms: campaign.platforms || [],
  planId: campaign.planId,
  planLabel: campaign.planLabel,
  durationDays: campaign.durationDays,
  basePrice: campaign.basePrice,
  budget: campaign.budget,
  walletCharged: campaign.walletCharged,
  walletBalanceAfterCharge: campaign.walletBalanceAfterCharge ?? null,
  refundAmount: campaign.refundAmount ?? null,
  requestedAt: campaign.requestedAt,
  reviewedAt: campaign.reviewedAt ?? null,
  reviewedBy: campaign.reviewedBy ?? null,
  startedAt: campaign.startedAt ?? null,
  expiresAt: campaign.expiresAt ?? null,
  completedAt: campaign.completedAt ?? null,
  rejectionReason: campaign.rejectionReason ?? null,
  productSnapshot: campaign.productSnapshot,
  createdAt: campaign.createdAt,
  updatedAt: campaign.updatedAt,
});

export const markExpiredCampaignsCompleted = async () => {
  const now = new Date();
  const expiredCampaigns = await AdCampaign.find({
    status: 'RUNNING',
    expiresAt: { $ne: null, $lte: now },
  }).limit(100);

  for (const campaign of expiredCampaigns) {
    campaign.status = 'COMPLETED';
    campaign.completedAt = campaign.expiresAt || now;
    await campaign.save();

    await activityService.recordActivitySafely({
      user: campaign.user,
      type: 'AD_BOOST',
      title: 'Ads boost completed',
      message: `${campaign.productSnapshot.name} boost has completed on ${formatPlatforms(campaign.platforms)}.`,
      amount: campaign.budget,
      metadata: {
        campaignId: campaign._id.toString(),
        productId: campaign.product.toString(),
        platforms: campaign.platforms,
        planId: campaign.planId,
        completedAt: (campaign.completedAt || now).toISOString(),
      },
    });
  }
};

interface CreatePendingCampaignInput {
  userId: string;
  productId: string;
  planId: string;
  platform: string;
  budget?: number;
}

export const createPendingAdCampaign = async (input: CreatePendingCampaignInput) => {
  const userObjectId = toObjectId(input.userId);
  const productObjectId = toObjectId(input.productId);
  const platforms = expandAdPlatforms(input.platform);

  const user = await User.findById(userObjectId);
  if (!user) throw new AdCampaignError('User not found', 404);
  if (user.role !== 'OWNER') {
    throw new AdCampaignError('Only the shop owner can request ads boosts', 403);
  }
  if (String(user.planType || '').toUpperCase() !== 'TYCOON') {
    throw new AdCampaignError('Boosting is an exclusive feature for Tycoon plan users', 403);
  }

  const product = await Inventory.findOne({ _id: productObjectId, user: userObjectId, isDeleted: { $ne: true } });
  if (!product) throw new AdCampaignError('Product not found', 404);

  const plans = await getConfiguredAdsPlans();
  const selectedPlan = plans.find((p: any) => p.id === input.planId);
  if (!selectedPlan) throw new AdCampaignError('Invalid plan selected', 400);

  const requestedBudget = input.budget === undefined || input.budget === null
    ? Number(selectedPlan.price)
    : Number(input.budget);

  if (!Number.isFinite(requestedBudget) || requestedBudget <= 0) {
    throw new AdCampaignError('Budget must be a valid amount', 400);
  }

  const budget = money(requestedBudget);
  const minimumBudget = Number(selectedPlan.price);

  if (budget < minimumBudget) {
    throw new AdCampaignError(`Budget must be at least ₦${minimumBudget.toLocaleString()}`, 400);
  }
  if (budget > MAX_AD_BOOST_BUDGET_NAIRA) {
    throw new AdCampaignError(`Budget cannot exceed ₦${MAX_AD_BOOST_BUDGET_NAIRA.toLocaleString()}`, 400);
  }

  const chargedUser = await User.findOneAndUpdate(
    { _id: userObjectId, walletBalance: { $gte: budget } },
    { $inc: { walletBalance: -budget } },
    { new: true }
  );

  if (!chargedUser) {
    throw new AdCampaignError('Insufficient wallet balance', 400);
  }

  try {
    const campaign = await AdCampaign.create({
      user: userObjectId,
      product: productObjectId,
      status: 'PENDING',
      platforms,
      planId: selectedPlan.id,
      planLabel: selectedPlan.label,
      durationDays: selectedPlan.durationDays,
      basePrice: money(Number(selectedPlan.price)),
      budget,
      walletCharged: true,
      walletBalanceAfterCharge: chargedUser.walletBalance || 0,
      productSnapshot: {
        name: product.name,
        description: product.description || '',
        image: product.image || null,
        price: product.lastUnitPrice || 0,
        category: product.category || null,
      },
    });

    await activityService.recordActivitySafely({
      user: userObjectId,
      actor: userObjectId,
      type: 'AD_BOOST',
      title: 'Ads boost pending review',
      message: `${product.name} boost is pending admin review on ${formatPlatforms(platforms)}. ₦${budget.toLocaleString()} has been reserved from your ads wallet.`,
      amount: budget,
      metadata: {
        campaignId: campaign._id.toString(),
        productId: product._id.toString(),
        productName: product.name,
        platforms,
        planId: selectedPlan.id,
        planLabel: selectedPlan.label,
        durationDays: selectedPlan.durationDays,
        walletBalanceAfterCharge: chargedUser.walletBalance || 0,
      },
    });

    return { campaign, walletBalance: chargedUser.walletBalance || 0 };
  } catch (error) {
    await User.updateOne({ _id: userObjectId }, { $inc: { walletBalance: budget } });
    throw error;
  }
};

export const approveAdCampaign = async (campaignId: string, adminId: string) => {
  const campaign = await AdCampaign.findById(toObjectId(campaignId));
  if (!campaign) throw new AdCampaignError('Ad campaign not found', 404);
  if (campaign.status !== 'PENDING') {
    throw new AdCampaignError('Only pending ad campaigns can be approved', 400);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + campaign.durationDays * 24 * 60 * 60 * 1000);

  const product = await Inventory.findOne({ _id: campaign.product, user: campaign.user, isDeleted: { $ne: true } });
  if (!product) throw new AdCampaignError('Product not found', 404);

  product.boosts = (product.boosts || []).filter((boost) => {
    const isSamePlatform = campaign.platforms.includes(boost.platform as AdPlatform);
    const isExpired = new Date(boost.expiresAt).getTime() <= now.getTime();
    return !isSamePlatform && !isExpired;
  });

  for (const platform of campaign.platforms) {
    product.boosts.push({
      platform,
      planId: campaign.planId,
      expiresAt,
    });
  }

  campaign.status = 'RUNNING';
  campaign.reviewedAt = now;
  campaign.reviewedBy = toObjectId(adminId);
  campaign.startedAt = now;
  campaign.expiresAt = expiresAt;

  await Promise.all([product.save(), campaign.save()]);

  await activityService.recordActivitySafely({
    user: campaign.user,
    actor: toObjectId(adminId),
    type: 'AD_BOOST',
    title: 'Ads boost approved',
    message: `${campaign.productSnapshot.name} boost is now running on ${formatPlatforms(campaign.platforms)} until ${expiresAt.toLocaleString('en-NG')}.`,
    amount: campaign.budget,
    metadata: {
      campaignId: campaign._id.toString(),
      productId: campaign.product.toString(),
      platforms: campaign.platforms,
      planId: campaign.planId,
      planLabel: campaign.planLabel,
      durationDays: campaign.durationDays,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return campaign;
};

export const rejectAdCampaign = async (campaignId: string, adminId: string, rawReason?: string) => {
  const campaign = await AdCampaign.findById(toObjectId(campaignId));
  if (!campaign) throw new AdCampaignError('Ad campaign not found', 404);
  if (campaign.status !== 'PENDING') {
    throw new AdCampaignError('Only pending ad campaigns can be rejected', 400);
  }

  const now = new Date();
  const reason = String(rawReason || '').trim().slice(0, 500) || 'Rejected by admin';
  let refundAmount = 0;

  if (campaign.walletCharged) {
    refundAmount = campaign.budget;
    await User.updateOne({ _id: campaign.user }, { $inc: { walletBalance: refundAmount } });
  }

  campaign.status = 'REJECTED';
  campaign.reviewedAt = now;
  campaign.reviewedBy = toObjectId(adminId);
  campaign.completedAt = now;
  campaign.rejectionReason = reason;
  campaign.refundAmount = refundAmount;
  campaign.walletCharged = false;
  await campaign.save();

  await activityService.recordActivitySafely({
    user: campaign.user,
    actor: toObjectId(adminId),
    type: 'AD_BOOST',
    title: 'Ads boost rejected',
    message: `${campaign.productSnapshot.name} boost was rejected. ₦${refundAmount.toLocaleString()} has been returned to your ads wallet.`,
    amount: refundAmount,
    metadata: {
      campaignId: campaign._id.toString(),
      productId: campaign.product.toString(),
      platforms: campaign.platforms,
      reason,
      refundAmount,
    },
  });

  return campaign;
};

export const completeAdCampaign = async (campaignId: string, adminId?: string) => {
  const campaign = await AdCampaign.findById(toObjectId(campaignId));
  if (!campaign) throw new AdCampaignError('Ad campaign not found', 404);
  if (campaign.status !== 'RUNNING') {
    throw new AdCampaignError('Only running ad campaigns can be completed', 400);
  }

  const now = new Date();
  await Inventory.updateOne(
    { _id: campaign.product, user: campaign.user },
    { $pull: { boosts: { platform: { $in: campaign.platforms }, planId: campaign.planId } } }
  );

  campaign.status = 'COMPLETED';
  campaign.completedAt = now;
  if (adminId) {
    campaign.reviewedBy = toObjectId(adminId);
  }
  await campaign.save();

  await activityService.recordActivitySafely({
    user: campaign.user,
    actor: adminId ? toObjectId(adminId) : null,
    type: 'AD_BOOST',
    title: 'Ads boost completed',
    message: `${campaign.productSnapshot.name} boost has been marked completed on ${formatPlatforms(campaign.platforms)}.`,
    amount: campaign.budget,
    metadata: {
      campaignId: campaign._id.toString(),
      productId: campaign.product.toString(),
      platforms: campaign.platforms,
      planId: campaign.planId,
      completedAt: now.toISOString(),
    },
  });

  return campaign;
};

export const normalizeCampaignStatus = (raw: unknown): AdCampaignStatus | undefined => {
  const status = String(raw || '').trim().toUpperCase();
  if (['PENDING', 'RUNNING', 'COMPLETED', 'REJECTED'].includes(status)) {
    return status as AdCampaignStatus;
  }
  return undefined;
};
