import { Request, Response } from 'express';
import axios from 'axios';
import { User } from '../models/user.model';
import { AdminSettings } from '../models/adminSettings.model';
import { env } from '../config/env';
import { walletService } from '../services/wallet.service';
import { AdCampaign } from '../models/adCampaign.model';
import {
  AdCampaignError,
  createPendingAdCampaign,
  DEFAULT_ADS_PLANS,
  getConfiguredAdsPlans,
  markExpiredCampaignsCompleted,
  normalizeCampaignStatus,
  serializeAdCampaign,
} from '../services/adCampaign.service';

const MAX_WALLET_FUNDING_NAIRA = Number(process.env.MAX_WALLET_FUNDING_NAIRA || 5_000_000);
const PAYSTACK_REFERENCE_PATTERN = /^[A-Za-z0-9._=-]{4,120}$/;

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

// 1. Initialize Wallet Funding
export const fundWallet = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const amount = getWalletFundingAmount(req.body?.amount); // Amount in Naira

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
        callback_url: 'https://tallypadi.com/ads-manager'
      },
      {
        headers: {
          Authorization: `Bearer ${env.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return res.status(200).json({ authorization_url: response.data.data.authorization_url, reference: response.data.data.reference });
  } catch (error: any) {
    console.error('Wallet Funding Error:', error?.response?.data || error?.message || error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// 2. Verify Wallet Funding
export const verifyWalletFunding = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
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
      console.warn('Wallet funding reference mismatch:', { requested: reference, providerReference });
      return res.status(400).json({ message: 'Payment reference mismatch' });
    }

    const metadata = parsePaystackMetadata(data.metadata);
    if (String(metadata.type || '') !== 'WALLET_FUNDING' || String(metadata.userId || '') !== String(userId || '')) {
      console.warn('Invalid wallet funding metadata:', { reference, metadata, userId });
      return res.status(400).json({ message: 'Invalid transaction metadata' });
    }

    const amountInKobo = Number(data.amount);
    const expectedAmountInKobo = metadata.amountInKobo !== undefined ? Number(metadata.amountInKobo) : null;
    if (!Number.isInteger(amountInKobo) || amountInKobo <= 0) {
      return res.status(400).json({ message: 'Invalid payment amount' });
    }
    if (expectedAmountInKobo !== null && expectedAmountInKobo !== amountInKobo) {
      console.warn('Wallet funding amount mismatch:', { reference, expectedAmountInKobo, amountInKobo });
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
      walletBalance: creditResult.walletBalance
    });
  } catch (error: any) {
    console.error('Verification Error:', error?.response?.data || error?.message || error);
    return res.status(500).json({ message: 'Verification failed' });
  }
};

// 3. Get Ads Plans
export const getAdsPlans = async (req: Request, res: Response) => {
  try {
    const plans = await getConfiguredAdsPlans();

    return res.status(200).json({ plans });
  } catch (error) {
    console.error('Get Ads Plans Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// 4. Update Ads Plans (Admin only)
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
      plan.durationDays < 1 ||
      !Number.isFinite(plan.price) ||
      plan.price < 0
    ));

    if (invalidPlan) {
      return res.status(400).json({ message: 'Each plan must have a valid id, label, durationDays, and price' });
    }

    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = await AdminSettings.create({});
    }

    settings.adsPlans = cleanPlans.length > 0 ? cleanPlans : DEFAULT_ADS_PLANS;
    await settings.save();

    return res.status(200).json({ message: 'Ads plans updated', plans: settings.adsPlans });
  } catch (error) {
    console.error('Update Ads Plans Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// 5. Boost Product
export const boostProduct = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const productId = String(req.params.productId || '');
    const { planId, platform, budget, adDetails } = req.body;

    if (!planId || !platform) {
      return res.status(400).json({ message: 'Plan ID and Platform are required' });
    }

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const result = await createPendingAdCampaign({
      userId,
      productId,
      planId: String(planId),
      platform: String(platform),
      budget: budget === undefined || budget === null ? undefined : Number(budget),
      adDetails: {
        brief: String(adDetails?.brief || '').trim(),
        audience: String(adDetails?.audience || '').trim(),
        keywords: Array.isArray(adDetails?.keywords) ? adDetails.keywords : [],
      },
    });

    return res.status(200).json({ 
      message: 'Boost request submitted for admin review',
      walletBalance: result.walletBalance,
      campaign: serializeAdCampaign(result.campaign),
    });

  } catch (error) {
    if (error instanceof AdCampaignError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Boost Product Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getMyAdCampaigns = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    await markExpiredCampaignsCompleted();

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const status = normalizeCampaignStatus(req.query.status);
    const query: Record<string, unknown> = { user: userId };
    if (status) query.status = status;

    const [campaigns, total] = await Promise.all([
      AdCampaign.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AdCampaign.countDocuments(query),
    ]);

    return res.status(200).json({
      campaigns: campaigns.map(serializeAdCampaign),
      pagination: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error('Get My Ads Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
