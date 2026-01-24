import { Router } from 'express';
import { getBranches, getHqDashboardData, transferStock, promoteToHqManager } from '../controllers/hq.controller';
import { authRequired } from '../middleware/authRequired';

const router = Router();

// Apply auth middleware to all HQ routes
router.use(authRequired);

// GET /hq/branches - List all branches
router.get('/branches', getBranches);

// GET /hq/dashboard - Aggregated stats
router.get('/dashboard', getHqDashboardData);

// POST /hq/transfer - Move stock
router.post('/transfer', transferStock);

// POST /hq/staff/promote - Promote staff to HQ Manager
router.post('/staff/promote', promoteToHqManager);

export default router;
