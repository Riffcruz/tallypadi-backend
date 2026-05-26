import { Request, Response } from 'express';
import axios from 'axios';
import { User } from '../models/user.model';
import { AdminSettings } from '../models/adminSettings.model';
import { env } from '../config/env';
import { walletService } from '../services/wallet.service';
import { AdCampaign } from '../models/adCampaign.model';
import { CampaignMetricSnapshot } from '../models/campaignMetricSnapshot.model';
import { CampaignRun } from '../models/campaignRun.model';
import { ProviderCampaign } from '../models/providerCampaign.model';
import { r2Service } from '../services/r2.service';
import {
  AdCampaignError,
  createCampaignChangeRequest,
  createManagedCampaign,
  createPendingAdCampaign,
  DEFAULT_ADS_PLANS,
  getCampaignDetail,
  getConfiguredAdsPlans,
  markExpiredCampaignsCompleted,
  normalizeCampaignStatus,
  pauseCampaignByMerchant,
  queueCampaignMetricsSync,
  repairOrphanCampaignReservations,
  resumeCompletedCampaign,
  serializeAdCampaign,
  stopCampaignByMerchant,
  topUpCampaign,
} from '../services/adCampaign.service';

const MAX_WALLET_FUNDING_NAIRA = Number(process.env.MAX_WALLET_FUNDING_NAIRA || 5_000_000);
const PAYSTACK_REFERENCE_PATTERN = /^[A-Za-z0-9._=-]{4,120}$/;
const getAdsManagerCallbackUrl = () => `${env.ads.publicBaseUrl.replace(/\/+$/, '')}/ads-manager`;

const parsePaystackMetadata = (raw: unknown): Record<string, unknown> => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw as Record<string, unknown> : {};
};

const getWalletFundingAmount = (raw: unknown) => {
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return null;
  if (amount < 100 || amount > MAX_WALLET_FUNDING_NAIRA) return null;
  return Math.round(amount * 100) / 100;
};

const getAuthUserId = (req: Request) => String(req.user?.id || '');

const getStatusQuery = (raw: unknown) => {
  const status = normalizeCampaignStatus(raw);
  if (!status) return undefined;
  if (status === 'PENDING') return { $in: ['PENDING', 'PENDING_ADMIN_REVIEW'] };
  if (status === 'RUNNING') return { $in: ['RUNNING', 'APPROVED_BY_TALLYPADI', 'SUBMITTING_TO_PROVIDERS', 'ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON', 'ACTIVE_WITH_PENDING_CHANGES', 'REQUIRES_REVIEW_AFTER_EDIT', 'PAUSED'] };
  if (status === 'REJECTED') return { $in: ['REJECTED', 'REJECTED_BY_TALLYPADI', 'PARTIALLY_REJECTED', 'FAILED', 'CANCELLED'] };
  return status;
};

export const fundWallet = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const amount = getWalletFundingAmount(req.body?.amount);

    if (!amount) {
      return res.status(400).json({ message: `Funding amount must be between ₦100 and ₦${MAX_WALLET_FUNDING_NAIRA.toLocaleString()}` });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'OWNER') {
      return res.status(403).json({ message: 'Only the shop owner can fund the ads wallet' });
    }

    const amountInKobo = Math.round(amount * 100);

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email || `${user.phoneNumber}@tallypadi.com`,
        amount: amountInKobo,
        metadata: {
          userId: user._id.toString(),
          type: 'WALLET_FUNDING',
          amountInKobo,
          amountInNaira: amount,
        },
        callback_url: getAdsManagerCallbackUrl(),
      },
      {
        headers: {
          Authorization: `Bearer ${env.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return res.status(200).json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (error: any) {
    console.error('Wallet Funding Error:', error?.response?.data || error?.message || error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const verifyWalletFunding = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const reference = String(req.params.reference || '').trim();

    if (!reference) return res.status(400).json({ message: 'No reference provided' });
    if (!PAYSTACK_REFERENCE_PATTERN.test(reference)) {
      return res.status(400).json({ message: 'Invalid payment reference' });
    }

    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${env.paystackSecretKey}` } }
    );

    const data = paystackRes.data?.data;
    if (!data) return res.status(500).json({ message: 'Invalid Paystack response' });

    if (data.status !== 'success') {
      return res.status(400).json({ status: 'failed', message: 'Transaction not successful' });
    }

    const providerReference = String(data.reference || '').trim();
    if (!providerReference || providerReference !== reference) {
      return res.status(400).json({ message: 'Payment reference mismatch' });
    }

    const metadata = parsePaystackMetadata(data.metadata);
    if (String(metadata.type || '') !== 'WALLET_FUNDING' || String(metadata.userId || '') !== String(userId || '')) {
      return res.status(400).json({ message: 'Invalid transaction metadata' });
    }

    const amountInKobo = Number(data.amount);
    const expectedAmountInKobo = metadata.amountInKobo !== undefined ? Number(metadata.amountInKobo) : null;
    if (!Number.isInteger(amountInKobo) || amountInKobo <= 0) {
      return res.status(400).json({ message: 'Invalid payment amount' });
    }
    if (expectedAmountInKobo !== null && expectedAmountInKobo !== amountInKobo) {
      return res.status(400).json({ message: 'Payment amount mismatch' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'OWNER') {
      return res.status(403).json({ message: 'Only the shop owner can verify ads wallet funding' });
    }

    const creditResult = await walletService.creditWalletFromPaystack({
      userId: user._id as any,
      reference,
      paystackData: data,
    });

    return res.status(200).json({
      status: 'success',
      message: creditResult.credited ? 'Wallet funded successfully' : 'Wallet funded successfully (already processed)',
      walletBalance: creditResult.walletBalance,
      walletBalanceMinor: creditResult.walletBalanceMinor,
    });
  } catch (error: any) {
    console.error('Verification Error:', error?.response?.data || error?.message || error);
    return res.status(500).json({ message: 'Verification failed' });
  }
};

export const getAdsPlans = async (_req: Request, res: Response) => {
  try {
    const plans = await getConfiguredAdsPlans();
    return res.status(200).json({ plans });
  } catch (error) {
    console.error('Get Ads Plans Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateAdsPlans = async (req: Request, res: Response) => {
  try {
    const adminUser = await User.findById(req.user?.id).select('role').lean();
    const role = String(adminUser?.role || '').toUpperCase();
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { plans } = req.body;
    if (!Array.isArray(plans)) {
      return res.status(400).json({ message: 'Plans must be an array' });
    }

    const cleanPlans = plans.map((plan) => ({
      id: String(plan?.id || '').trim(),
      durationDays: Number(plan?.durationDays),
      price: Number(plan?.price),
      label: String(plan?.label || '').trim(),
    }));

    const invalidPlan = cleanPlans.find((plan) => (
      !plan.id ||
      !plan.label ||
      !Number.isInteger(plan.durationDays) ||
      plan.durationDays < 3 ||
      plan.durationDays > 30 ||
      !Number.isFinite(plan.price) ||
      plan.price < 50_000
    ));

    if (invalidPlan) {
      return res.status(400).json({ message: 'Each plan must have a valid id, label, 3-30 duration days, and minimum ₦50,000 price' });
    }

    let settings = await AdminSettings.findOne();
    if (!settings) settings = await AdminSettings.create({});

    settings.adsPlans = cleanPlans.length > 0 ? cleanPlans : DEFAULT_ADS_PLANS;
    await settings.save();

    return res.status(200).json({ message: 'Ads plans updated', plans: settings.adsPlans });
  } catch (error) {
    console.error('Update Ads Plans Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const createCampaign = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const result = await createManagedCampaign({
      userId,
      productId: req.body?.productId ? String(req.body.productId) : undefined,
      planId: req.body?.planId ? String(req.body.planId) : undefined,
      durationDays: req.body?.durationDays === undefined ? undefined : Number(req.body.durationDays),
      providers: req.body?.providers || req.body?.platforms || req.body?.platform,
      grossBudget: req.body?.grossBudget === undefined ? undefined : Number(req.body.grossBudget),
      budget: req.body?.budget === undefined ? undefined : Number(req.body.budget),
      targetAudience: req.body?.targetAudience,
      targetLocation: req.body?.targetLocation,
      ageRange: req.body?.ageRange,
      campaignGoal: req.body?.campaignGoal,
      creativeNotes: req.body?.creativeNotes,
      keywords: Array.isArray(req.body?.keywords) ? req.body.keywords : undefined,
      customSplitBasisPoints: req.body?.customSplitBasisPoints,
      adDetails: req.body?.adDetails,
      globalLandingPageUrl: req.body?.globalLandingPageUrl,
      providerLandingPageUrls: req.body?.providerLandingPageUrls,
      consent: {
        accepted: Boolean(req.body?.adTermsAccepted ?? req.body?.consent?.accepted ?? true),
        version: req.body?.consent?.version,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.status(201).json({
      message: 'Campaign submitted for TallyPadi review',
      walletBalance: result.walletBalance,
      walletBalanceMinor: result.walletBalanceMinor,
      campaign: serializeAdCampaign(result.campaign, {
        run: result.run,
        providerCampaigns: result.providerCampaigns,
      }),
    });
  } catch (error) {
    if (error instanceof AdCampaignError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Create Campaign Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const boostProduct = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const productId = String(req.params.productId || '');
    const { planId, platform, providers, budget, adDetails } = req.body;

    if (!planId && !req.body?.durationDays) {
      return res.status(400).json({ message: 'Plan ID or duration is required' });
    }
    if (!platform && !providers) {
      return res.status(400).json({ message: 'Select at least one promotion channel' });
    }
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const result = await createPendingAdCampaign({
      userId,
      productId,
      planId: String(planId || ''),
      platform: providers || platform,
      budget: budget === undefined || budget === null ? undefined : Number(budget),
      adDetails: {
        brief: String(adDetails?.brief || req.body?.creativeNotes || '').trim(),
        audience: String(adDetails?.audience || req.body?.targetAudience || '').trim(),
        keywords: Array.isArray(adDetails?.keywords) ? adDetails.keywords : [],
      },
    });

    return res.status(200).json({
      message: 'Campaign submitted for TallyPadi review',
      walletBalance: result.walletBalance,
      walletBalanceMinor: result.walletBalanceMinor,
      campaign: serializeAdCampaign(result.campaign, {
        run: result.run,
        providerCampaigns: result.providerCampaigns,
      }),
    });
  } catch (error) {
    if (error instanceof AdCampaignError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Boost Product Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const listCampaigns = async (query: Record<string, unknown>, page: number, limit: number) => {
  const [campaigns, total] = await Promise.all([
    AdCampaign.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AdCampaign.countDocuments(query),
  ]);

  const campaignIds = campaigns.map((campaign) => campaign._id);
  const runIds = campaigns
    .map((campaign) => campaign.activeRunId || campaign.latestRunId)
    .filter((id): id is NonNullable<typeof id> => Boolean(id));
  const [runs, providers] = await Promise.all([
    CampaignRun.find({ _id: { $in: runIds } }).lean(),
    ProviderCampaign.find({ campaign: { $in: campaignIds } }).sort({ createdAt: 1 }).lean(),
  ]);

  const runMap = new Map(runs.map((run) => [String(run._id), run]));
  const providerMap = providers.reduce((acc, provider) => {
    const key = String(provider.campaign);
    acc.set(key, [...(acc.get(key) || []), provider]);
    return acc;
  }, new Map<string, any[]>());

  return {
    campaigns: campaigns.map((campaign) => serializeAdCampaign(campaign, {
      run: runMap.get(String(campaign.activeRunId || campaign.latestRunId)),
      providerCampaigns: providerMap.get(String(campaign._id)) || [],
    })),
    pagination: {
      page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
};

export const getMyAdCampaigns = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    await markExpiredCampaignsCompleted();
    const walletRepair = await repairOrphanCampaignReservations(userId);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const status = getStatusQuery(req.query.status);
    const query: Record<string, unknown> = { user: userId };
    if (status) query.status = status;

    const result = await listCampaigns(query, page, limit);
    const walletSummary = walletRepair.repairedCount > 0
      ? await walletService.getWalletSummary(userId)
      : null;
    return res.status(200).json({
      ...result,
      walletRepair,
      ...(walletSummary ? {
        walletBalance: walletSummary.walletBalance,
        walletBalanceMinor: walletSummary.walletBalanceMinor,
        reservedBalanceMinor: walletSummary.reservedBalanceMinor,
      } : {}),
    });
  } catch (error) {
    console.error('Get My Ads Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getCampaignById = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const campaign = await getCampaignDetail(String(req.params.id || ''), userId);
    return res.json({ campaign });
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Get Campaign Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const topUpAdCampaign = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const campaign = await topUpCampaign({
      campaignId: String(req.params.id || ''),
      userId,
      amount: Number(req.body?.amount),
    });
    const detail = await getCampaignDetail(String(campaign?._id || req.params.id), userId);
    return res.json({ message: 'Campaign top-up submitted', campaign: detail });
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Top Up Campaign Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const resumeAdCampaignRun = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const result = await resumeCompletedCampaign({
      campaignId: String(req.params.id || ''),
      userId,
      amount: req.body?.amount === undefined ? undefined : Number(req.body.amount),
      durationDays: req.body?.durationDays === undefined ? undefined : Number(req.body.durationDays),
    });
    return res.status(201).json({
      message: 'Campaign resumed as a new run pending TallyPadi review',
      campaign: serializeAdCampaign(result.campaign, {
        run: result.run,
        providerCampaigns: result.providerCampaigns,
      }),
    });
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Resume Campaign Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const createAdCampaignChangeRequest = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const changeRequest = await createCampaignChangeRequest({
      campaignId: String(req.params.id || ''),
      userId,
      changeType: String(req.body?.changeType || 'TARGETING'),
      requestedValues: req.body?.requestedValues || req.body || {},
    });
    return res.status(201).json({ message: 'Campaign changes submitted for review', changeRequest });
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Create Change Request Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const pauseMyAdCampaign = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const campaign = await pauseCampaignByMerchant({
      campaignId: String(req.params.id || ''),
      userId,
      reason: req.body?.reason,
    });
    const detail = await getCampaignDetail(String(campaign._id), userId);
    return res.json({ message: 'Campaign paused', campaign: detail });
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Pause Campaign Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const stopMyAdCampaign = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const campaign = await stopCampaignByMerchant({
      campaignId: String(req.params.id || ''),
      userId,
      reason: req.body?.reason,
    });
    const detail = await getCampaignDetail(String(campaign._id), userId);
    return res.json({ message: 'Campaign stopped. Refund reconciliation is pending.', campaign: detail });
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Stop Campaign Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAdCampaignMetrics = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const campaign = await AdCampaign.findOne({ _id: req.params.id, user: userId }).select('_id');
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    const syncResult = await queueCampaignMetricsSync(String(campaign._id), userId).catch((error) => {
      console.error('Queue Campaign Metrics Sync Error:', error);
      return { queued: 0 };
    });
    const metrics = await CampaignMetricSnapshot.find({ campaign: campaign._id })
      .sort({ date: -1, createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({ metrics, syncQueued: syncResult.queued });
  } catch (error) {
    console.error('Get Campaign Metrics Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const syncAdCampaignMetrics = async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const result = await queueCampaignMetricsSync(String(req.params.id || ''), userId);
    return res.json({ message: 'Campaign metrics sync queued', queued: result.queued });
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Sync Campaign Metrics Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAdAssetUploadUrl = async (req: Request, res: Response) => {
  try {
    const { mime, ext } = req.body || {};
    const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedImageMimes.includes(String(mime))) {
      return res.status(400).json({ message: 'Only image campaign assets are supported for now' });
    }
    const result = await r2Service.getPresignedPutUrl(String(mime), String(ext || 'jpg'));
    return res.json(result);
  } catch (error) {
    console.error('Campaign Asset Upload URL Error:', error);
    return res.status(500).json({ message: 'Failed to create upload URL' });
  }
};
