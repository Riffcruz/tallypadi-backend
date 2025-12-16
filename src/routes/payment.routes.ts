import { Router } from 'express';
import { startPayment, verifyPayment } from '../controllers/payment.controller';

const router = Router();

// POST /api/payment/initialize - Start transaction
router.post('/initialize', startPayment);

// GET /api/payment/verify/:reference - Verify transaction (Callback)
router.get('/verify/:reference', verifyPayment);

export default router;