import { Router } from 'express';
import { getMyReferralSummary } from '../controllers/referral.controller';

const router = Router();

router.get('/me', getMyReferralSummary);

export default router;
