import { Router } from 'express';
import { getMarketplaceListings } from '../controllers/marketplace.controller';

const router = Router();

router.get('/', getMarketplaceListings);

export default router;
