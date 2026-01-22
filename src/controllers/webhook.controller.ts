import { Request, Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/user.model';
import { env } from '../config/env';
import { sendWhatsAppText } from '../services/whatsapp.service';

export const handlePaystackWebhook = async (req: Request, res: Response) => {
    try {
        // 1. Validate Signature (Security)
        const hash = crypto.createHmac('sha512', env.paystackSecretKey)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.sendStatus(400);
        }

        const event = req.body;
        console.log(`🔔 Paystack Webhook: ${event.event}`);

        // 2. Handle Successful Payment
        if (event.event === 'charge.success') {
            const { metadata, customer } = event.data;
            
            // Get userId & Plan from metadata (Injected by billing.service.ts)
            const userId = metadata?.userId;
            const targetPlan = metadata?.planType; // 🟢 Captured Plan Type

            if (userId) {
                const user = await User.findById(userId);
                if (user) {
                    console.log(`💰 Payment success for ${user.phoneNumber}. Updating plan to ${targetPlan || user.planType}`);

                    // A. Activate Subscription
                    user.subscriptionStatus = 'active';
                    user.paystackCustomerCode = customer.customer_code;
                    user.paystackPlanCode = event.data.plan?.plan_code; // Capture Paystack's sub code if present
                    
                    // B. Update Plan (If switching/upgrading)
                    // We only update if the payment metadata specified a valid plan
                    if (targetPlan && ['OGA_BOSS', 'TYCOON'].includes(targetPlan)) {
                        user.planType = targetPlan;
                    }

                    // C. Set Next Billing Date
                    // For charge.success, we safely default to +30 days. 
                    // Note: If using Paystack Subscriptions, Paystack handles the charging schedule, 
                    // but we keep this date to sync with our 'checkSubscriptionStatus' logic.
                    user.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 

                    await user.save();

                    // D. Send Confirmation
                    const planName = (user.planType || '').replace('_', ' '); // "OGA BOSS" or "TYCOON"
                    await sendWhatsAppText(
                        user.phoneNumber, 
                        `✅ Payment Received! Your *${planName}* subscription is now ACTIVE.\n\nThank you for choosing Tallypadi! 🚀`
                    );
                }
            }
        }
        
        // 3. Handle Failed Payment (Recurring)
        // This fires when Paystack tries to charge the card automatically and fails
        if (event.event === 'invoice.payment_failed' || event.event === 'subscription.disable') {
            const { customer } = event.data;
            const email = customer.email;

            // Find user by email (since metadata might not be in invoice failure events)
            const user = await User.findOne({ email: email });
            if (user) {
                console.log(`❌ Payment failed/cancelled for ${user.phoneNumber}. Downgrading status.`);
                
                user.subscriptionStatus = 'past_due';
                await user.save();

                await sendWhatsAppText(
                    user.phoneNumber, 
                    `⚠️ *Payment Failed*\n\nWe couldn't renew your subscription automatically. Your account access has been paused.\n\nPlease update your card or pay manually to resume.`
                );
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook Error:', error);
        res.sendStatus(500);
    }
};