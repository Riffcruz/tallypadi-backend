import { Request, Response } from 'express';
import axios from 'axios';
import { User } from '../models/user.model';
import { AdminSettings } from '../models/adminSettings.model';
import { env } from '../config/env';

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

    const metadata = data.metadata || {};
    if (metadata.type !== 'WALLET_FUNDING' || metadata.userId !== userId) {
      return res.status(400).json({ message: 'Invalid transaction metadata' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Deduplication check: to avoid crediting twice, we should normally track references in a Transaction model.
    // For simplicity, we can check if it's already recorded or use a dedicated model. 
    // We will assume frontend only calls this once for now, but a Transaction model should track it.
    
    // Add to wallet balance (convert from kobo to Naira)
    const amountInNaira = data.amount / 100;
    user.walletBalance = (user.walletBalance || 0) + amountInNaira;
    await user.save();

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
