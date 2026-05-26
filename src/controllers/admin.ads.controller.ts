import { Request, Response } from 'express';
import { AdCampaign } from '../models/adCampaign.model';
import { CampaignRun } from '../models/campaignRun.model';
import { ProviderCampaign } from '../models/providerCampaign.model';
import {
  AdCampaignError,
  approveAdCampaign,
  completeAdCampaign,
  getCampaignDetail,
  markExpiredCampaignsCompleted,
  normalizeCampaignStatus,
  pauseAdCampaign,
  repairOrphanCampaignReservations,
  refundProviderCampaignBalance,
  reallocateProviderCampaignBalance,
  rejectAdCampaign,
  resubmitProviderCampaign,
  resumeAdCampaign,
  serializeAdCampaign,
  updateProviderCampaignMetrics,
  updateProviderCampaignStatus,
} from '../services/adCampaign.service';
import { getProviderAutomationReadiness } from '../services/Campaign/providerCredentials.service';
import { AD_PROVIDERS } from '../types/ads';

const providerStatusValues = [
  'PENDING_TALLYPADI_REVIEW',
  'READY_TO_SUBMIT',
  'SUBMITTED_TO_PROVIDER',
  'PROVIDER_REVIEW',
  'APPROVED_BY_PROVIDER',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'REJECTED_BY_PROVIDER',
  'FAILED',
  'CANCELLED',
] as const;

const getAdminId = (req: Request) => String(req.admin?._id || req.user?.id || '');

const getStatusQuery = (raw: unknown) => {
  const status = normalizeCampaignStatus(raw);
  if (!status) return undefined;
  if (status === 'PENDING') return { $in: ['PENDING', 'PENDING_ADMIN_REVIEW'] };
  if (status === 'RUNNING') return { $in: ['RUNNING', 'APPROVED_BY_TALLYPADI', 'SUBMITTING_TO_PROVIDERS', 'ACTIVE', 'PARTIALLY_ACTIVE', 'STARTING_SOON', 'ACTIVE_WITH_PENDING_CHANGES', 'REQUIRES_REVIEW_AFTER_EDIT', 'PAUSED'] };
  if (status === 'REJECTED') return { $in: ['REJECTED', 'REJECTED_BY_TALLYPADI', 'PARTIALLY_REJECTED', 'FAILED', 'CANCELLED'] };
  return status;
};

const listAdminCampaigns = async (req: Request, res: Response) => {
  await markExpiredCampaignsCompleted();
  const walletRepair = await repairOrphanCampaignReservations();

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const statusQuery = getStatusQuery(req.query.status);
  const query: Record<string, unknown> = {};
  if (statusQuery) query.status = statusQuery;

  const [campaigns, total, statusCounts] = await Promise.all([
    AdCampaign.find(query)
      .populate('user', 'businessName name email phoneNumber planType walletBalance shopSlug settings.currencyCode countryCode')
      .populate('product', 'name quantity lastUnitPrice image category isPublished')
      .populate('reviewedBy', 'businessName name email phoneNumber role')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AdCampaign.countDocuments(query),
    AdCampaign.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
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

  const rawCounts = statusCounts.reduce((acc: Record<string, number>, item: { _id: string; count: number }) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  const counts = {
    ...rawCounts,
    ALL: statusCounts.reduce((sum: number, item: { _id: string; count: number }) => sum + item.count, 0),
    PENDING: (rawCounts.PENDING || 0) + (rawCounts.PENDING_ADMIN_REVIEW || 0),
    RUNNING: (rawCounts.RUNNING || 0) + (rawCounts.APPROVED_BY_TALLYPADI || 0) + (rawCounts.SUBMITTING_TO_PROVIDERS || 0) + (rawCounts.ACTIVE || 0) + (rawCounts.PARTIALLY_ACTIVE || 0) + (rawCounts.STARTING_SOON || 0) + (rawCounts.ACTIVE_WITH_PENDING_CHANGES || 0) + (rawCounts.REQUIRES_REVIEW_AFTER_EDIT || 0) + (rawCounts.PAUSED || 0),
    REJECTED: (rawCounts.REJECTED || 0) + (rawCounts.REJECTED_BY_TALLYPADI || 0) + (rawCounts.PARTIALLY_REJECTED || 0) + (rawCounts.FAILED || 0) + (rawCounts.CANCELLED || 0),
    COMPLETED: rawCounts.COMPLETED || 0,
  };

  return res.json({
    campaigns: campaigns.map((campaign) => serializeAdCampaign(campaign, {
      run: runMap.get(String(campaign.activeRunId || campaign.latestRunId)),
      providerCampaigns: providerMap.get(String(campaign._id)) || [],
    })),
    counts,
    walletRepair,
    pagination: {
      page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
};

export const getAdminAdCampaigns = async (req: Request, res: Response) => {
  try {
    return await listAdminCampaigns(req, res);
  } catch (error) {
    console.error('Admin Ads List Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAdminAdCampaignById = async (req: Request, res: Response) => {
  try {
    const campaign = await getCampaignDetail(String(req.params.id || ''));
    return res.json({ campaign });
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Ads Detail Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAdminAdProviderReadiness = async (_req: Request, res: Response) => {
  try {
    return res.json({
      providers: AD_PROVIDERS.map((provider) => getProviderAutomationReadiness(provider)),
    });
  } catch (error) {
    console.error('Admin Ads Provider Readiness Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const respondWithFreshCampaign = async (res: Response, campaignId: unknown, message: string) => {
  const campaign = await getCampaignDetail(String(campaignId || ''));
  return res.json({ message, campaign });
};

export const approveAdminAdCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await approveAdCampaign(String(req.params.id || ''), getAdminId(req));
    return respondWithFreshCampaign(res, campaign._id, 'Ad campaign approved for TallyPadi-managed fulfillment');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Ads Approve Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const rejectAdminAdCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await rejectAdCampaign(String(req.params.id || ''), getAdminId(req), req.body?.reason);
    return respondWithFreshCampaign(res, campaign._id, 'Ad campaign rejected and wallet reservation released');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Ads Reject Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const pauseAdminAdCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await pauseAdCampaign(String(req.params.id || ''), getAdminId(req), req.body?.reason);
    return respondWithFreshCampaign(res, campaign._id, 'Ad campaign paused');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Ads Pause Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const resumeAdminAdCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await resumeAdCampaign(String(req.params.id || ''), getAdminId(req));
    return respondWithFreshCampaign(res, campaign._id, 'Ad campaign resumed');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Ads Resume Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const completeAdminAdCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await completeAdCampaign(String(req.params.id || ''), getAdminId(req));
    return respondWithFreshCampaign(res, campaign._id, 'Ad campaign marked completed');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Ads Complete Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateAdminProviderCampaignStatus = async (req: Request, res: Response) => {
  try {
    const status = String(req.body?.status || '');
    if (!providerStatusValues.includes(status as any)) {
      return res.status(400).json({ message: 'Invalid provider campaign status' });
    }

    const provider = await updateProviderCampaignStatus({
      providerCampaignId: String(req.params.id || ''),
      adminId: getAdminId(req),
      status: status as any,
      rejectionReason: req.body?.rejectionReason || req.body?.reason,
      adminNotes: req.body?.adminNotes,
    });
    return respondWithFreshCampaign(res, provider.campaign, 'Provider campaign status updated');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Provider Status Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateAdminProviderCampaignMetrics = async (req: Request, res: Response) => {
  try {
    const provider = await updateProviderCampaignMetrics({
      providerCampaignId: String(req.params.id || ''),
      adminId: getAdminId(req),
      impressions: req.body?.impressions,
      clicks: req.body?.clicks,
      views: req.body?.views,
      conversions: req.body?.conversions,
      allConversions: req.body?.allConversions,
      spentMinor: req.body?.spentMinor,
      spent: req.body?.spent,
    });
    return respondWithFreshCampaign(res, provider.campaign, 'Provider campaign metrics updated');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Provider Metrics Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const refundAdminProviderCampaign = async (req: Request, res: Response) => {
  try {
    const provider = await refundProviderCampaignBalance(String(req.params.id || ''), getAdminId(req));
    return respondWithFreshCampaign(res, provider.campaign, 'Provider allocation refunded');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Provider Refund Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const reallocateAdminProviderCampaign = async (req: Request, res: Response) => {
  try {
    const provider = await reallocateProviderCampaignBalance({
      providerCampaignId: String(req.params.id || ''),
      targetProviderCampaignIds: Array.isArray(req.body?.targetProviderCampaignIds) ? req.body.targetProviderCampaignIds : [],
      adminId: getAdminId(req),
    });
    return respondWithFreshCampaign(res, provider.campaign, 'Provider allocation reallocated');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Provider Reallocate Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const resubmitAdminProviderCampaign = async (req: Request, res: Response) => {
  try {
    const provider = await resubmitProviderCampaign(String(req.params.id || ''), getAdminId(req), req.body?.notes);
    return respondWithFreshCampaign(res, provider.campaign, 'Provider campaign marked ready for resubmission');
  } catch (error) {
    if (error instanceof AdCampaignError) return res.status(error.statusCode).json({ message: error.message });
    console.error('Admin Provider Resubmit Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
