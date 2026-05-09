import { Router } from 'express';
import { getMarketplaceListings, getMarketplaceProductById } from '../controllers/marketplace.controller';

const router = Router();

router.get('/products/:productId', getMarketplaceProductById);
router.get('/', getMarketplaceListings);

export default router;
