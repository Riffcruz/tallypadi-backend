import { Request, Response } from 'express';
import { Types } from 'mongoose';

import { ReferralTransaction, ReferralTransactionStatus } from '../models/referralTransaction.model';
import { User } from '../models/user.model';
import { referralService } from '../services/referral.service';
import { toMajorUnits } from '../services/adBudget.service';

const VALID_STATUSES: ReferralTransactionStatus[] = [
  'PENDING_VERIFICATION',
  'PENDING_FUNDING',
  'REWARDED',
  'INELIGIBLE',
];

const getPublicBaseUrl = () => String(
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.PUBLIC_WEB_URL ||
  process.env.ADS_PUBLIC_BASE_URL ||
  'https://tallypadi.com'
).replace(/\/+$/, '');

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const serializeUser = (user: any) => {
  if (!user || typeof user !== 'object') return null;
  return {
    id: String(user._id),
    businessName: user.businessName || null,
    name: user.name || null,
    phoneNumber: user.phoneNumber || null,
    email: user.email || null,
    referralCode: user.referralCode || null,
  };
};

const serializeReferralTransaction = (tx: any) => ({
  id: String(tx._id),
  status: tx.status,
  referralCode: tx.referralCode,
  referrer: serializeUser(tx.referrer),
  referredUser: serializeUser(tx.referredUser),
  registeredAt: tx.registeredAt ? new Date(tx.registeredAt).toISOString() : null,
  verifiedAt: tx.verifiedAt ? new Date(tx.verifiedAt).toISOString() : null,
  qualifiedAt: tx.qualifiedAt ? new Date(tx.qualifiedAt).toISOString() : null,
  rewardedAt: tx.rewardedAt ? new Date(tx.rewardedAt).toISOString() : null,
  fundingAmount: toMajorUnits(tx.fundingAmountMinor || 0),
  fundingAmountMinor: tx.fundingAmountMinor || 0,
  rewardAmount: toMajorUnits(tx.rewardAmountMinor || 0),
  rewardAmountMinor: tx.rewardAmountMinor || 0,
  currency: tx.currency || 'NGN',
  paystackReference: tx.paystackReference || null,
  fundingWalletTransactionId: tx.fundingWalletTransaction ? String(tx.fundingWalletTransaction) : null,
  rewardWalletTransactionId: tx.rewardWalletTransaction ? String(tx.rewardWalletTransaction) : null,
  configSnapshot: tx.configSnapshot || null,
  metadata: tx.metadata || null,
  createdAt: tx.createdAt ? new Date(tx.createdAt).toISOString() : null,
  updatedAt: tx.updatedAt ? new Date(tx.updatedAt).toISOString() : null,
});

export const getMyReferralSummary = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId || !Types.ObjectId.isValid(userId)) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(userId).select('_id role referralCode');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'OWNER') return res.status(403).json({ error: 'Only shop owners can use referrals' });

    const referralCode = await referralService.ensureReferralCode(user._id as any);
    const referrerId = new Types.ObjectId(String(user._id));

    const [summary, recentTransactions] = await Promise.all([
      ReferralTransaction.aggregate([
        { $match: { referrer: referrerId } },
        {
          $group: {
            _id: null,
            totalReferrals: { $sum: 1 },
            pendingReferrals: {
              $sum: {
                $cond: [{ $in: ['$status', ['PENDING_VERIFICATION', 'PENDING_FUNDING']] }, 1, 0],
              },
            },
            successfulReferrals: {
              $sum: {
                $cond: [{ $eq: ['$status', 'REWARDED'] }, 1, 0],
              },
            },
            totalEarnedMinor: {
              $sum: {
                $cond: [{ $eq: ['$status', 'REWARDED'] }, '$rewardAmountMinor', 0],
              },
            },
          },
        },
      ]),
      ReferralTransaction.find({ referrer: referrerId })
        .populate('referredUser', 'businessName name phoneNumber email referralCode')
        .sort({ createdAt: -1 })
        .limit(20),
    ]);

    const stats = summary[0] || {};
    const referralLink = `${getPublicBaseUrl()}/register?ref=${encodeURIComponent(referralCode)}`;

    return res.json({
      referralCode,
      referralLink,
      totals: {
        totalReferrals: stats.totalReferrals || 0,
        pendingReferrals: stats.pendingReferrals || 0,
        successfulReferrals: stats.successfulReferrals || 0,
        totalEarned: toMajorUnits(stats.totalEarnedMinor || 0),
        totalEarnedMinor: stats.totalEarnedMinor || 0,
        currency: 'NGN',
      },
      transactions: recentTransactions.map(serializeReferralTransaction),
    });
  } catch (error) {
    console.error('Get referral summary error:', error);
    return res.status(500).json({ error: 'Failed to fetch referral summary' });
  }
};

export const getAdminReferralTransactions = async (req: Request, res: Response) => {
  try {
    const page = clampNumber(req.query.page, 1, 1, 100000);
    const limit = clampNumber(req.query.limit, 50, 1, 100);
    const skip = (page - 1) * limit;
    const statusRaw = String(req.query.status || '').toUpperCase();
    const search = String(req.query.search || '').trim().slice(0, 80);

    const match: Record<string, unknown> = {};
    if (VALID_STATUSES.includes(statusRaw as ReferralTransactionStatus)) {
      match.status = statusRaw;
    }

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matchingUsers = await User.find({
        $or: [
          { businessName: regex },
          { name: regex },
          { phoneNumber: regex },
          { email: regex },
          { referralCode: regex },
        ],
      }).select('_id');

      match.$or = [
        { referralCode: regex },
        { referrer: { $in: matchingUsers.map((user) => user._id) } },
        { referredUser: { $in: matchingUsers.map((user) => user._id) } },
        { paystackReference: regex },
      ];
    }

    const [transactions, total] = await Promise.all([
      ReferralTransaction.find(match)
        .populate('referrer', 'businessName name phoneNumber email referralCode')
        .populate('referredUser', 'businessName name phoneNumber email referralCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ReferralTransaction.countDocuments(match),
    ]);

    return res.json({
      transactions: transactions.map(serializeReferralTransaction),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get admin referrals error:', error);
    return res.status(500).json({ error: 'Failed to fetch referral logs' });
  }
};
