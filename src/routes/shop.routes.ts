import { Router } from 'express';
import { 
  getShopBySlug, 
  getShopProducts, 
  getShopMe, 
  updateShopSettings,
  getShopProductById,
  recordShopVisit
} from '../controllers/shop.controller';
import { authRequired } from '../middleware/authRequired';
import { subscribeUserPush } from '../controllers/auth.controller';

const router = Router();

// ✅ Owner Routes (Auth Required)
router.post('/push/subscribe', authRequired, subscribeUserPush);
router.get('/me', authRequired, getShopMe);
router.put('/me', authRequired, updateShopSettings);

// 🌍 Public Routes
router.post('/:slug/visit', recordShopVisit);
router.get('/:slug', getShopBySlug);
router.get('/:slug/products', getShopProducts);
router.get('/:slug/products/:productId', getShopProductById);

export default router;