import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { User } from '../models/user.model';
import { initializePayment } from '../services/billing.service';
import { env } from '../config/env';
import { sendWhatsAppText } from '../services/whatsapp.service';

// 1. Initialize Payment (POST /initialize)
export const startPayment = async (req: Request, res: Response) => {
  try {
    const { email, targetPlan } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const authorizationUrl = await initializePayment(user, email, targetPlan);

    if (authorizationUrl) {
      res.status(200).json({ authorization_url: authorizationUrl });
    } else {
      res.status(400).json({ message: "Could not initialize payment" });
    }
  } catch (error: any) {
    console.error("Payment Init Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 2. Verify Payment (GET /verify/:reference)
export const verifyPayment = async (req: Request, res: Response) => {
    try {
        const { reference } = req.params;

        if (!reference) {
            return res.status(400).json({ message: "No transaction reference provided" });
        }

        // Call Paystack API to verify status
        const paystackRes = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: { Authorization: `Bearer ${env.paystackSecretKey}` }
        });

        const data = paystackRes.data.data;

        if (data.status === 'success') {
            // Retrieve user info from metadata
            const userId = data.metadata?.userId;
            const targetPlan = data.metadata?.planType;

            if (userId) {
                const user = await User.findById(userId);
                 if (user) {
                    // Update User Status
                    user.subscriptionStatus = 'active';
                    user.paystackCustomerCode = data.customer.customer_code;
                    user.paystackPlanCode = data.plan_object?.plan_code || data.metadata?.plan_code; 
                    
                    if (targetPlan && ['OGA_BOSS', 'TYCOON'].includes(targetPlan)) {
                        user.planType = targetPlan;
                    }
                    
                    user.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    
                    await user.save();
                 }
            }

            return res.status(200).json({ status: 'success', message: "Payment verified successfully" });
        } else {
            return res.status(400).json({ status: 'failed', message: "Transaction was not successful" });
        }

    } catch (error: any) {
        console.error("Verification Error:", error.response?.data || error.message);
        res.status(500).json({ message: "Verification failed on server" });
    }
};

// 3. Handle Webhook (POST /webhook/paystack)
export const handlePaystackWebhook = async (req: Request, res: Response) => {
    try {
        const hash = crypto.createHmac('sha512', env.paystackSecretKey)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) return res.sendStatus(400);

        const event = req.body;
        
        if (event.event === 'charge.success') {
            const { metadata, customer } = event.data;
            const userId = metadata?.userId;
            const targetPlan = metadata?.planType;

            if (userId) {
                const user = await User.findById(userId);
                if (user) {
                    user.subscriptionStatus = 'active';
                    user.paystackCustomerCode = customer.customer_code;
                    if (targetPlan && ['OGA_BOSS', 'TYCOON'].includes(targetPlan)) user.planType = targetPlan;
                    user.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 
                    await user.save();
                    
                    const planName = user.planType.replace('_', ' ');
                    await sendWhatsAppText(user.phoneNumber, `✅ Payment Received! Your *${planName}* subscription is ACTIVE.`);
                }
            }
        }
        
        if (event.event === 'invoice.payment_failed' || event.event === 'subscription.disable') {
             // Handle failure...
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook Error:', error);
        res.sendStatus(500);
    }
};