import { Router } from 'express';
import { getBranches, getHqDashboard as getHqDashboardData, transferStock, promoteToHqManager } from '../controllers/hq.controller';
import { authRequired } from '../middleware/authRequired';

const router = Router();

router.use(authRequired);

router.get('/branches', getBranches);
router.get('/dashboard', getHqDashboardData);

router.post('/transfer', transferStock);
router.post('/staff/promote', promoteToHqManager);

export default router;
