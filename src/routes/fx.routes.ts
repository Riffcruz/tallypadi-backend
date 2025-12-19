import { Router } from 'express';
import { getFxRates } from '../controllers/fx.controller';
import { verifyAdmin } from '../middleware/admin.middleware';

const router = Router();

router.get('/', verifyAdmin, getFxRates);

export default router;
