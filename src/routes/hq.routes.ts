import { Router } from 'express';
import { getBranches, getHqDashboard as getHqDashboardData, transferStock, promoteToHqManager, createBranch } from '../controllers/hq.controller';
import { createTransferRequest, getStockHub, listTransfers, receiveSupplierStock, updateTransferStatus } from '../controllers/stockHub.controller';
import { archiveSupplier, createPurchaseOrder, createSupplier, getPurchasingWorkspace, receivePurchaseOrder, updatePurchaseOrder, updateSupplier } from '../controllers/purchasing.controller';
import { authRequired } from '../middleware/authRequired';

const router = Router();

router.use(authRequired);

router.get('/branches', getBranches);
router.get('/dashboard', getHqDashboardData);
router.get('/stock', getStockHub);
router.get('/transfers', listTransfers);
router.get('/purchasing', getPurchasingWorkspace);

router.post('/transfer', transferStock);
router.post('/transfers', createTransferRequest);
router.patch('/transfers/:id', updateTransferStatus);
router.post('/stock/receive', receiveSupplierStock);
router.post('/suppliers', createSupplier);
router.put('/suppliers/:id', updateSupplier);
router.delete('/suppliers/:id', archiveSupplier);
router.post('/purchase-orders', createPurchaseOrder);
router.patch('/purchase-orders/:id', updatePurchaseOrder);
router.post('/purchase-orders/:id/receive', receivePurchaseOrder);
router.post('/staff/promote', promoteToHqManager);
router.post('/branch', createBranch);

export default router;
