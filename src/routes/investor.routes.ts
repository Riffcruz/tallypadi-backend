import { Router } from 'express';
import { verifyInvestor } from '../middleware/investor.middleware';
import { getDashboardStats } from '../controllers/investor.controller';

const router = Router();

router.use(verifyInvestor);

router.get('/dashboard', getDashboardStats);

export default router;
