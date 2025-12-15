import { Router } from 'express';
import { verifyWebhook, handleWebhook } from '../controllers/whatsapp.controller';

const router = Router();

router.get('/', verifyWebhook);  // For Meta verification
router.post('/', handleWebhook); // For receiving messages

export default router;