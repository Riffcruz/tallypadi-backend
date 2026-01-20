import { User, IUser } from '../models/user.model';
import axios from 'axios';
import { env } from '../config/env';
import { queueOutboundMessage } from './queue.service'; // ✅ QUEUED SENDER

// 🟢 CONFIGURATION: Plan Details
const PLAN_CONFIG = {
  OGA_BOSS: {
    name: 'Oga Boss Plan',
    // key = duration (months)
    pricing: {
      1: 3000 * 100,      // ₦3,000 (1 month)
      6: 15000 * 100,     // ₦2,500 * 6 = 15,000 (6 months)
      12: 28800 * 100,    // ₦2,400 * 12 = 28,800 (1 year)
    },
  },
  TYCOON: {
    name: 'Tycoon Plan',
    pricing: {
      1: 5000 * 100,      // ₦5,000 (1 month)
      6: 27000 * 100,     // ₦4,500 * 6 = 27,000 (6 months)
      12: 42000 * 100,    // ₦3,500 * 12 = 42,000 (1 year)
    },
  },
};

// ... (keep existing imports and helpers)

// 🟢 UPDATED: Dynamic Plan Selection
export const initializePayment = async (
  user: IUser, 
  email: string, 
  targetPlan?: 'OGA_BOSS' | 'TYCOON',
  durationMonths: 1 | 6 | 12 = 1
) => {
  try {
    // 1. Determine which plan to charge for
    const selectedPlanType = targetPlan || user.planType || 'OGA_BOSS';
    const planConfig = (PLAN_CONFIG as any)[selectedPlanType];

    if (!planConfig) {
      throw new Error(`Invalid plan type: ${selectedPlanType}`);
    }

    // 2. Get price for duration
    const amount = planConfig.pricing[durationMonths];
    if (!amount) {
      throw new Error(`Invalid duration ${durationMonths} for plan ${selectedPlanType}`);
    }

    console.log(
      `💳 Initializing Paystack for ${user.phoneNumber} - Plan: ${planConfig.name} (${amount}) Duration: ${durationMonths}m`
    );

    // 3. Call Paystack API
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: email,
        amount: amount,
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer', 'eft'],
        metadata: {
          userId: user._id.toString(),
          phoneNumber: user.phoneNumber,
          planType: selectedPlanType,
          durationMonths: durationMonths, // ✅ Pass duration to metadata so webhook knows
          custom_fields: [
            {
              display_name: 'Phone Number',
              variable_name: 'phone_number',
              value: user.phoneNumber,
            },
            {
              display_name: 'Shop Name',
              variable_name: 'shop_name',
              value: user.businessName,
            },
            {
              display_name: 'Plan Duration',
              variable_name: 'plan_duration',
              value: `${durationMonths} Month(s)`,
            }
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data.authorization_url;
  } catch (error: any) {
    console.error('❌ Paystack Initialization Error:', error.response?.data || error.message);
    return null;
  }
};

// 🟢 NEW: Check Subscription Status
export const checkSubscriptionStatus = async (user: IUser): Promise<boolean> => {
  // 1. If active, allow
  if (user.subscriptionStatus === 'active') {
    // Optional: Double check expiry if cron missed it
    if (user.nextBillingDate && user.nextBillingDate < new Date()) {
      user.subscriptionStatus = 'past_due';
      await user.save();
      // fall through to failure handling
    } else {
      return true;
    }
  }

  // 2. If trial
  if (user.subscriptionStatus === 'trial') {
    // If trial is still valid
    if (user.trialEndsAt && user.trialEndsAt > new Date()) {
      return true;
    }
    // Trial expired
    user.subscriptionStatus = 'past_due';
    await user.save();
  }

  // 3. If we get here, they are not allowed (past_due, cancelled, suspended)
  // We send them a message and return false.
  
  // Don't spam them on every single message? 
  // For now, we return false. The controller handles flow interruption.
  // We can send a reminder message here.

  // Using a generic payment link or instruction
  const payLink = \`https://tallypadi.com/login\`; 

  await queueOutboundMessage(
    user.phoneNumber,
    \`🛑 *Subscription Expired*\n\nYour plan has expired. Please renew to continue using TallyPadi.\n\n👉 Login to renew: \${payLink}\`
  );

  return false;
};
