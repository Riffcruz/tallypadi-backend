import { Router } from 'express';
import { getMarketplaceDiscovery, getMarketplaceListings, getMarketplaceProductById } from '../controllers/marketplace.controller';

const router = Router();

router.get('/products/:productId', getMarketplaceProductById);
router.get('/discovery', getMarketplaceDiscovery);
router.get('/', getMarketplaceListings);

export default router;
