import { User, IUser } from '../models/user.model';
import axios from 'axios';
import { env } from '../config/env';
import { queueOutboundMessage } from './queue.service'; // ✅ QUEUED SENDER

// 🟢 CONFIGURATION: Plan Details
// Replace 'PLN_...' with your actual plan codes from Paystack Dashboard
const PLAN_CONFIG = {
  OGA_BOSS: {
    amount: 2500 * 100, // ₦2,500 in kobo
    planCode: process.env.PAYSTACK_PLAN_OGA || 'PLN_znp64o8rjnn13g6',
    name: 'Oga Boss Plan',
  },
  TYCOON: {
    amount: 3500 * 100, // ₦5,000 in kobo
    planCode: process.env.PAYSTACK_PLAN_TYCOON || 'PLN_bw4lqou4plnf07e',
    name: 'Tycoon Plan',
  },
};

// ✅ helper: queue message (fast + non-blocking delivery)
async function sendWhatsAppQueued(user: IUser, text: string, tag: string) {
  // optional stable-ish job id to reduce duplicates
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const jobId = `${tag}_${String(user._id)}_${day}`;
  await queueOutboundMessage(user.phoneNumber, text, jobId);
}

export const checkSubscriptionStatus = async (user: IUser): Promise<boolean> => {
  const now = new Date();

  // 1. 🔴 Check Suspended Status (Highest Priority)
  if (user.subscriptionStatus === 'suspended') {
    await sendWhatsAppQueued(
      user,
      `🚫 *Account Suspended*\n\nYour account has been suspended due to policy violations or an administrative action.\n\nPlease contact support to resolve this issue.`,
      'sub_suspended'
    );
    return false; // BLOCKED
  }

  // 2. Check Trial
  if (user.subscriptionStatus === 'trial') {
    if (now < user.trialEndsAt) {
      return true; // Trial still valid
    } else {
      // Trial Expired -> Move to Past Due
      user.subscriptionStatus = 'past_due';
      await user.save();

      await sendBillingReminder(user);
      return false; // BLOCKED
    }
  }

  // 3. Check Active Subscription
  if (user.subscriptionStatus === 'active') {
    return true;
  }

  // 4. Blocked States (Past Due / Cancelled)
  if (user.subscriptionStatus === 'past_due' || user.subscriptionStatus === 'cancelled') {
    await sendBillingReminder(user);
    return false; // BLOCKED
  }

  return false;
};

const sendBillingReminder = async (user: IUser) => {
  // We can point them to a generic pay link or generate one dynamically here
  // For now, let's assume a generic dashboard link
  const payLink = 'https://tallypadi.com/payment';

  await sendWhatsAppQueued(
    user,
    `🛑 *Access Paused*\n\nOga, your Tallypadi subscription don expire.\n\nTo continue using the bot, please renew here:\n👉 ${payLink}`,
    'sub_billing'
  );
};

// 🟢 UPDATED: Dynamic Plan Selection
export const initializePayment = async (user: IUser, email: string, targetPlan?: 'OGA_BOSS' | 'TYCOON') => {
  try {
    // 1. Determine which plan to charge for
    // If targetPlan is passed (e.g. upgrading), use that. Otherwise use current user plan.
    const selectedPlanType = targetPlan || user.planType || 'OGA_BOSS';
    const planDetails = (PLAN_CONFIG as any)[selectedPlanType];

    if (!planDetails) {
      throw new Error(`Invalid plan type: ${selectedPlanType}`);
    }

    console.log(
      `💳 Initializing Paystack for ${user.phoneNumber} - Plan: ${planDetails.name} (${planDetails.amount})`
    );

    // 2. Call Paystack API
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: email,
        amount: planDetails.amount,
        plan: planDetails.planCode, // recurring billing if set on Paystack
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer', 'eft'],
        metadata: {
          userId: user._id.toString(),
          phoneNumber: user.phoneNumber,
          planType: selectedPlanType,
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
          ],
        },
        // callback_url: "https://tallypadi.com/payment/callback"
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
