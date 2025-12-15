import { Router } from 'express';
import { handlePaystackWebhook } from '../controllers/webhook.controller';

const router = Router();

// Endpoint: POST /api/webhook/paystack
router.post('/paystack', handlePaystackWebhook);

export default router;