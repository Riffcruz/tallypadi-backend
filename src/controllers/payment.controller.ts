// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { User } from '../models/user.model';
import { initializePayment } from '../services/billing.service';
import { env } from '../config/env';
import { sendWhatsAppText } from '../services/whatsapp.service';

type PlanType = 'OGA_BOSS' | 'TYCOON';
const ALLOWED_PLANS: PlanType[] = ['OGA_BOSS', 'TYCOON'];
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(raw: string) {
  let p = String(raw || '').trim();
  // keep + and digits only
  p = p.replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  return p;
}

function safePlan(input: any): PlanType | null {
  const p = String(input || '').toUpperCase().trim();
  return ALLOWED_PLANS.includes(p as PlanType) ? (p as PlanType) : null;
}

/**
 * ✅ POST /api/payment/initialize
 * Guest payment init (NOT logged in) but MUST provide phoneNumber + email.
 * This keeps WhatsApp identity consistent.
 */
export const startPayment = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber, targetPlan } = req.body as {
      email?: string;
      phoneNumber?: string;
      targetPlan?: PlanType;
    };

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = normalizePhone(phoneNumber || '');
    const plan = safePlan(targetPlan) || 'OGA_BOSS';

    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    // ✅ Choice A: phone is required for guest checkout
    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({
        message: `Phone number is required. Keys: [${Object.keys(req.body || {}).join(',')}]. Raw: '${phoneNumber}', Norm: '${cleanPhone}'.`,
      });
    }

    // ✅ Find user by WhatsApp identity first
    let user = await User.findOne({ phoneNumber: cleanPhone });

    // fallback: by email
    if (!user) user = await User.findOne({ email: cleanEmail });

    // ✅ If found by email but has a DIFFERENT phone, block
    if (user?.phoneNumber && user.phoneNumber !== cleanPhone) {
      return res.status(400).json({
        message:
          'This email is already linked to a different phone number. Please use the correct phone number.',
      });
    }

    // ✅ Stop if user not found (do not auto-create)
    if (!user) {
      return res.status(404).json({
        message: 'User not found. Please create an account first.',
      });
    }

    // 🛡️ TS Guard: Should not happen, but satisfies compiler
    if (!user) {
        return res.status(500).json({ message: 'User creation failed internally.' });
    }

    // ✅ If user exists, use their current plan as fallback if targetPlan is not provided
    // If user is new (created above), 'plan' variable is already set to targetPlan or OGA_BOSS
    const finalPlan = safePlan(targetPlan) || user.planType || 'OGA_BOSS';

    if (!user.email) {
       user.email = cleanEmail;
       await user.save();
    }
    
    // Only update plan if explicitly requested and different
    if (safePlan(targetPlan) && user.planType !== finalPlan) {
      user.planType = finalPlan;
      await user.save();
    }

    // ✅ Initialize paystack with strong binding metadata (userId + phone)
    const authorizationUrl = await initializePayment(user as any, cleanEmail, finalPlan);

    if (!authorizationUrl) {
      return res.status(400).json({ message: 'Could not initialize payment' });
    }

    return res.status(200).json({ authorization_url: authorizationUrl });
  } catch (error: any) {
    console.error('Payment Init Error:', error?.response?.data || error?.message || error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * ✅ GET /api/payment/verify/:reference
 * Verify using Paystack API. This is useful for redirect/callback flows.
 */
export const verifyPayment = async (req: Request, res: Response) => {
  try {
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
    const userId = metadata.userId ? String(metadata.userId) : null;
    const planType = safePlan(metadata.planType) || null;
    const metaPhone = metadata.phoneNumber ? String(metadata.phoneNumber) : null;

    let user: any = null;

    // ✅ Prefer metadata userId binding
    if (userId) user = await User.findById(userId);

    // fallback to phone binding
    if (!user && metaPhone) user = await User.findOne({ phoneNumber: metaPhone });

    if (!user) return res.status(404).json({ message: 'User not found for this transaction' });

    if (planType) user.planType = planType;

    user.subscriptionStatus = 'active';
    user.paystackCustomerCode = data.customer?.customer_code || user.paystackCustomerCode;
    user.paystackPlanCode = data.plan_object?.plan_code || user.paystackPlanCode;

    // NOTE: better to compute from Paystack subscription if you store it
    user.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await user.save();

    if (user.phoneNumber) {
      const planName = String(user.planType || '').replace(/_/g, ' ');
      await sendWhatsAppText(user.phoneNumber, `✅ Payment confirmed! Your *${planName}* subscription is ACTIVE.`);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Payment verified successfully',
      planType: user.planType,
      subscriptionStatus: user.subscriptionStatus,
    });
  } catch (error: any) {
    console.error('Verification Error:', error?.response?.data || error?.message || error);
    return res.status(500).json({ message: 'Verification failed on server' });
  }
};

/**
 * ✅ POST /api/webhook/paystack
 * Secure webhook activation path (signature verified against RAW body).
 *
 * IMPORTANT:
 * - Your express.json must capture req.rawBody for this route.
 */
export const handlePaystackWebhook = async (req: any, res: Response) => {
  try {
    const signature = String(req.headers['x-paystack-signature'] || '');
    const rawBody: Buffer | undefined = req.rawBody;

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      // raw body capture isn't set up
      return res.sendStatus(400);
    }

    const expected = crypto.createHmac('sha512', env.paystackSecretKey).update(rawBody).digest('hex');
    if (!signature || expected !== signature) return res.sendStatus(400);

    const event = req.body;
    const ev = String(event?.event || '');
    const data = event?.data || {};
    const metadata = data?.metadata || {};
    const userId = metadata?.userId ? String(metadata.userId) : null;
    const planType = safePlan(metadata?.planType) || null;

    if (!userId) return res.sendStatus(200); // ignore unbound events

    const user = await User.findById(userId);
    if (!user) return res.sendStatus(200);

    if (ev === 'charge.success') {
      if (planType) user.planType = planType;

      user.subscriptionStatus = 'active';
      user.paystackCustomerCode = data.customer?.customer_code || user.paystackCustomerCode;
      user.paystackPlanCode = data.plan_object?.plan_code || user.paystackPlanCode;
      user.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await user.save();

      if (user.phoneNumber) {
        const planName = String(user.planType || '').replace(/_/g, ' ');
        // await sendWhatsAppText(user.phoneNumber, `✅ Payment received! Your *${planName}* subscription is ACTIVE.`);
      }
    }

    if (ev === 'invoice.payment_failed') {
      user.subscriptionStatus = 'past_due';
      await user.save();
    }

    if (ev === 'subscription.disable') {
      user.subscriptionStatus = 'cancelled';
      await user.save();
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Webhook Error:', error);
    return res.sendStatus(500);
  }
};
