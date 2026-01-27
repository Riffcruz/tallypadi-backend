import { Router } from 'express';
import { verifySupportWebhook, handleSupportWebhook } from '../controllers/support.webhook.controller';

const router = Router();

router.get('/', verifySupportWebhook);
router.post('/', handleSupportWebhook);

export default router;
