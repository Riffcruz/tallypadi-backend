import { Router } from 'express';
import { getDraft, resolveDraft, getDraftInventoryOptions } from '../controllers/draft.controller';

const router = Router();

// All draft routes are public (secured by the hard-to-guess ObjectId)
router.get('/:id', getDraft);
router.get('/:id/inventory', getDraftInventoryOptions);
router.post('/:id/resolve', resolveDraft);

export default router;
