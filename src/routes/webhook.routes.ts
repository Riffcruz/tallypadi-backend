import { Router } from 'express';
// Import the handler from the payment controller where we centralized the logic
import { handlePaystackWebhook } from '../controllers/payment.controller';

const router = Router();

// Route: POST /api/webhook/paystack
// This matches the "Live Webhook URL" you set in Paystack
router.post('/paystack', handlePaystackWebhook);

export default router;