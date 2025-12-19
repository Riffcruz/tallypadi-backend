import { Router } from 'express';
import { sendChatMessage } from '../controllers/chat.controller';
import { verifyAdmin } from '../middleware/admin.middleware';

const router = Router();

router.post('/send', verifyAdmin, sendChatMessage);

export default router;
