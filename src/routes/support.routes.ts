import { Router } from 'express';
import { supportController } from '../controllers/support.controller';
import { supportAgentAuth, adminAuth } from '../middleware/support.middleware';

const router = Router();

// Admin
router.post('/admin/agents', adminAuth, supportController.createAgent);
router.get('/admin/agents', adminAuth, supportController.listAgents);

// Agent Auth
router.post('/auth/login', supportController.login);

// Agent Protected
router.get('/me', supportAgentAuth, supportController.getMe);
router.post('/status', supportAgentAuth, supportController.setStatus);
router.post('/push/subscribe', supportAgentAuth, supportController.subscribePush);

// Tickets
router.get('/tickets', supportAgentAuth, supportController.getTickets);
router.get('/tickets/:ticketId/messages', supportAgentAuth, supportController.getMessages);
router.post('/tickets/:ticketId/send', supportAgentAuth, supportController.sendMessage);
router.post('/tickets/:ticketId/close', supportAgentAuth, supportController.closeTicket);
router.post('/tickets/:ticketId/escalate', supportAgentAuth, supportController.escalateTicket);

export default router;
