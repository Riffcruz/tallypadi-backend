import { Router } from 'express';
import { getBranches, getHqDashboard as getHqDashboardData, transferStock, promoteToHqManager, createBranch } from '../controllers/hq.controller';
import { createTransferRequest, getStockHub, listTransfers, receiveSupplierStock, updateTransferStatus } from '../controllers/stockHub.controller';
import { authRequired } from '../middleware/authRequired';

const router = Router();

router.use(authRequired);

router.get('/branches', getBranches);
router.get('/dashboard', getHqDashboardData);
router.get('/stock', getStockHub);
router.get('/transfers', listTransfers);

router.post('/transfer', transferStock);
router.post('/transfers', createTransferRequest);
router.patch('/transfers/:id', updateTransferStatus);
router.post('/stock/receive', receiveSupplierStock);
router.post('/staff/promote', promoteToHqManager);
router.post('/branch', createBranch);

export default router;
