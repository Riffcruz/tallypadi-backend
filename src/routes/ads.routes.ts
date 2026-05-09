import { Router } from 'express';
import { authRequired } from '../middleware/authRequired';
import { fundWallet, verifyWalletFunding, getAdsPlans, updateAdsPlans, boostProduct } from '../controllers/ads.controller';

const router = Router();

// Wallet Funding
router.post('/wallet/fund', authRequired, fundWallet);
router.post('/wallet/verify/:reference', authRequired, verifyWalletFunding);

// Ads Plans
router.get('/plans', authRequired, getAdsPlans);
// TODO: Add admin middleware for updateAdsPlans
router.put('/plans', authRequired, updateAdsPlans);

// Product Boosting
router.post('/boost/:productId', authRequired, boostProduct);

export default router;
