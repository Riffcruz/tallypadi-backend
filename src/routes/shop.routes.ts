import { Router } from 'express';
import { 
  getShopBySlug, 
  getShopProducts, 
  getShopMe, 
  updateShopSettings,
  getShopProductById
} from '../controllers/shop.controller';
import { authRequired } from '../middleware/authRequired';

const router = Router();

// ✅ Owner Routes (Auth Required)
router.get('/me', authRequired, getShopMe);
router.put('/me', authRequired, updateShopSettings);

// 🌍 Public Routes
router.get('/:slug', getShopBySlug);
router.get('/:slug/products', getShopProducts);
router.get('/:slug/products/:productId', getShopProductById);

export default router;