import { Router } from 'express';
import { getBranches, getHqDashboardData, transferStock } from '../controllers/hq.controller';
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

export default router;
