import { Request, Response } from 'express';
import axios from 'axios';
import { User } from '../models/user.model';
import { Inventory } from '../models/inventory.model';
import { AdminSettings } from '../models/adminSettings.model';
import { BillingEvent } from '../models/billingEvent.model';
import { env } from '../config/env';
import { activityService } from '../services/activity.service';

const parsePaystackMetadata = (raw: unknown): Record<string, any> => {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw as Record<string, any> : {};
};

// 1. Initialize Wallet Funding
export const fundWallet = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { amount } = req.body; // Amount in Naira

    if (!amount || amount < 100) {
      return res.status(400).json({ message: 'Minimum funding amount is ₦100' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const amountInKobo = Math.round(amount * 100);

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email || `${user.phoneNumber}@tallypadi.com`,
        amount: amountInKobo,
        metadata: {
          userId: user._id.toString(),
          type: 'WALLET_FUNDING'
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

    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${env.paystackSecretKey}` } }
    );

    const data = paystackRes.data?.data;
    if (!data) return res.status(500).json({ message: 'Invalid Paystack response' });

    if (data.status !== 'success') {
      return res.status(400).json({ status: 'failed', message: 'Transaction not successful' });
    }

    const metadata = parsePaystackMetadata(data.metadata);
    if (String(metadata.type || '') !== 'WALLET_FUNDING' || String(metadata.userId || '') !== String(userId || '')) {
      console.warn('Invalid wallet funding metadata:', { reference, metadata, userId });
      return res.status(400).json({ message: 'Invalid transaction metadata' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Deduplication check: to avoid crediting twice, enterprise-grade check using BillingEvent
    const existingEvent = await BillingEvent.findOne({ reference, event: 'charge.success' });
    if (existingEvent) {
      return res.status(200).json({
        status: 'success',
        message: 'Wallet funded successfully (already processed)',
        walletBalance: user.walletBalance
      });
    }
    
    // Add to wallet balance (convert from kobo to Naira)
    const amountInNaira = data.amount / 100;
    user.walletBalance = (user.walletBalance || 0) + amountInNaira;
    await user.save();

    await BillingEvent.create({
      reference,
      event: 'charge.success',
      user: user._id,
      payload: data
    });

    await activityService.recordActivitySafely({
      user: user._id as any,
      actor: user._id as any,
      type: 'WALLET_FUNDING',
      title: 'Wallet funded successfully',
      message: `Your ads wallet was funded with ₦${amountInNaira.toLocaleString()}.`,
      amount: amountInNaira,
      metadata: {
        reference,
        provider: 'paystack',
        walletBalance: user.walletBalance || 0,
      },
    });

    return res.status(200).json({
      status: 'success',
      message: 'Wallet funded successfully',
      walletBalance: user.walletBalance
    });
  } catch (error: any) {
    console.error('Verification Error:', error?.response?.data || error?.message || error);
    return res.status(500).json({ message: 'Verification failed' });
  }
};

// 3. Get Ads Plans
export const getAdsPlans = async (req: Request, res: Response) => {
  try {
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = await AdminSettings.create({});
    }

    // Return default plans if none configured
    const plans = settings.adsPlans && settings.adsPlans.length > 0 
      ? settings.adsPlans 
      : [
          { id: '1_day', durationDays: 1, price: 500, label: '1 Day Boost' },
          { id: '5_days', durationDays: 5, price: 2000, label: '5 Days Boost' },
          { id: '7_days', durationDays: 7, price: 2500, label: '1 Week Boost' },
          { id: '30_days', durationDays: 30, price: 8000, label: '1 Month Boost' }
        ];

    return res.status(200).json({ plans });
  } catch (error) {
    console.error('Get Ads Plans Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// 4. Update Ads Plans (Admin only)
export const updateAdsPlans = async (req: Request, res: Response) => {
  try {
    const { plans } = req.body;
    
    if (!Array.isArray(plans)) {
      return res.status(400).json({ message: 'Plans must be an array' });
    }

    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = await AdminSettings.create({});
    }

    settings.adsPlans = plans;
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
    const { productId } = req.params;
    const { planId, platform } = req.body;

    if (!planId || !platform) {
      return res.status(400).json({ message: 'Plan ID and Platform are required' });
    }

    const validPlatforms = ['TALLYPADI_SEO', 'TIKTOK', 'META'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ message: 'Invalid platform selected' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.planType !== 'TYCOON') {
      return res.status(403).json({ message: 'Boosting is an exclusive feature for Tycoon plan users' });
    }

    const product = await Inventory.findOne({ _id: productId, user: userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    let settings = await AdminSettings.findOne();
    const plans = settings?.adsPlans && settings.adsPlans.length > 0 ? settings.adsPlans : [
      { id: '1_day', durationDays: 1, price: 500, label: '1 Day Boost' },
      { id: '5_days', durationDays: 5, price: 2000, label: '5 Days Boost' },
      { id: '7_days', durationDays: 7, price: 2500, label: '1 Week Boost' },
      { id: '30_days', durationDays: 30, price: 8000, label: '1 Month Boost' }
    ];

    const selectedPlan = plans.find((p: any) => p.id === planId);
    if (!selectedPlan) {
      return res.status(400).json({ message: 'Invalid plan selected' });
    }

    if ((user.walletBalance || 0) < selectedPlan.price) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }

    // Deduct wallet balance
    user.walletBalance = (user.walletBalance || 0) - selectedPlan.price;
    await user.save();

    // Add boost
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + selectedPlan.durationDays);

    if (!product.boosts) {
      product.boosts = [];
    }

    // Remove old active boost for same platform if exists to extend it instead of duplicates
    product.boosts = product.boosts.filter(b => b.platform !== platform || b.expiresAt < new Date());

    product.boosts.push({
      platform,
      planId,
      expiresAt
    });

    await product.save();

    await activityService.recordActivitySafely({
      user: user._id as any,
      actor: user._id as any,
      type: 'AD_BOOST',
      title: 'Ads boost purchased',
      message: `${product.name} was boosted on ${String(platform).replace(/_/g, ' ')} for ₦${selectedPlan.price.toLocaleString()}.`,
      amount: selectedPlan.price,
      metadata: {
        productId: product._id.toString(),
        productName: product.name,
        planId,
        planLabel: selectedPlan.label,
        platform,
        durationDays: selectedPlan.durationDays,
        walletBalance: user.walletBalance || 0,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return res.status(200).json({ 
      message: 'Product boosted successfully', 
      walletBalance: user.walletBalance,
      boosts: product.boosts 
    });

  } catch (error) {
    console.error('Boost Product Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
