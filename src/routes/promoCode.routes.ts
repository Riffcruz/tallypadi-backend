import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { redeemPromoCode } from '../controllers/promoCode.controller';
import { requireOwnerAccount } from '../middleware/staffPermission';

const router = Router();
const redeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `promo:${req.user?.id || req.ip || 'unknown'}`,
  message: { error: 'Too many promotional code attempts. Please wait and try again.' },
});

router.post('/redeem', requireOwnerAccount, redeemLimiter, redeemPromoCode);

export default router;
