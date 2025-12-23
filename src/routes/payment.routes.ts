import { Router } from 'express';
import {
  startPayment,
  verifyPayment,
  handlePaystackWebhook,
} from '../controllers/payment.controller';

const router = Router();

// POST /api/payment/initialize
router.post('/initialize', startPayment);

// GET /api/payment/verify/:reference
router.get('/verify/:reference', verifyPayment);

export default router;
