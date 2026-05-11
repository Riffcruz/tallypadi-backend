import { Router } from 'express';
import { authRequired } from '../middleware/authRequired';
import {
  createAdCampaignChangeRequest,
  createCampaign,
  fundWallet,
  getAdAssetUploadUrl,
  getAdCampaignMetrics,
  getAdsPlans,
  getCampaignById,
  getMyAdCampaigns,
  pauseMyAdCampaign,
  resumeAdCampaignRun,
  stopMyAdCampaign,
  syncAdCampaignMetrics,
  topUpAdCampaign,
  updateAdsPlans,
  verifyWalletFunding,
  boostProduct,
} from '../controllers/ads.controller';

const router = Router();

// Wallet Funding
router.post('/wallet/fund', authRequired, fundWallet);
router.post('/wallet/verify/:reference', authRequired, verifyWalletFunding);

// Ads Plans
router.get('/plans', authRequired, getAdsPlans);
// TODO: Add admin middleware for updateAdsPlans
router.put('/plans', authRequired, updateAdsPlans);

// Product Boosting
router.post('/assets/upload-url', authRequired, getAdAssetUploadUrl);
router.post('/campaigns', authRequired, createCampaign);
router.get('/campaigns', authRequired, getMyAdCampaigns);
router.get('/campaigns/:id', authRequired, getCampaignById);
router.post('/campaigns/:id/top-up', authRequired, topUpAdCampaign);
router.post('/campaigns/:id/pause', authRequired, pauseMyAdCampaign);
router.post('/campaigns/:id/stop', authRequired, stopMyAdCampaign);
router.post('/campaigns/:id/resume', authRequired, resumeAdCampaignRun);
router.post('/campaigns/:id/change-requests', authRequired, createAdCampaignChangeRequest);
router.get('/campaigns/:id/metrics', authRequired, getAdCampaignMetrics);
router.post('/campaigns/:id/metrics/sync', authRequired, syncAdCampaignMetrics);
router.post('/boost/:productId', authRequired, boostProduct);

export default router;
