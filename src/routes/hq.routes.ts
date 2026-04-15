import { Router } from 'express';
import { getBranches, getHqDashboard as getHqDashboardData, transferStock, promoteToHqManager, createBranch } from '../controllers/hq.controller';
import { authRequired } from '../middleware/authRequired';

const router = Router();

router.use(authRequired);

router.get('/branches', getBranches);
router.get('/dashboard', getHqDashboardData);

router.post('/transfer', transferStock);
router.post('/staff/promote', promoteToHqManager);
router.post('/branch', createBranch);

export default router;
