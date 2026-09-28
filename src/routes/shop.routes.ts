import { Router } from 'express';
import { 
  getShopBySlug, 
  getShopProducts, 
  getShopMe, 
  updateShopSettings,
  getShopProductById,
  recordShopVisit,
  createStorefrontOrder,
} from '../controllers/shop.controller';
import { authRequired } from '../middleware/authRequired';
import { requireOwnerAccount } from '../middleware/staffPermission';
import { subscribeUserPush } from '../controllers/auth.controller';
import {
  getMySellerVerification,
  getSellerVerificationUploadUrl,
  submitSellerVerification,
} from '../controllers/sellerVerification.controller';

const router = Router();

// ✅ Owner Routes (Auth Required)
router.post('/push/subscribe', authRequired, subscribeUserPush);
router.get('/me', authRequired, getShopMe);
router.put('/me', authRequired, requireOwnerAccount, updateShopSettings);
router.get('/verification', authRequired, getMySellerVerification);
router.post('/verification/upload-url', authRequired, getSellerVerificationUploadUrl);
router.post('/verification', authRequired, submitSellerVerification);

// 🌍 Public Routes
router.post('/:slug/visit', recordShopVisit);
router.post('/:slug/orders', createStorefrontOrder);
router.get('/:slug', getShopBySlug);
router.get('/:slug/products', getShopProducts);
router.get('/:slug/products/:productId', getShopProductById);

export default router;
