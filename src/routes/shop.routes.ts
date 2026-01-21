import { Router } from 'express';
import { getShopBySlug, updateShopSettings } from '../controllers/shop.controller';

// Middleware to ensure user is logged in
// We need to import the middleware. Since it's defined in server.ts as a const, 
// we should probably extract it or reuse the one in src/middleware/authRequired.ts if it exists.
// Checking file list... src/middleware/authRequired.ts exists.
import { authRequired } from '../middleware/authRequired';

const router = Router();

// Public Route
router.get('/:slug', getShopBySlug);

// Protected Route (Tycoon Owner)
router.put('/settings', authRequired, updateShopSettings);

export default router;
