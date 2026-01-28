import { Router } from 'express';
import { supportController } from '../controllers/support.controller';
import { supportAgentAuth, adminAuth } from '../middleware/support.middleware';

const router = Router();

// Admin
router.post('/admin/agents', adminAuth, supportController.createAgent);
router.get('/admin/agents', adminAuth, supportController.listAgents);
router.put('/admin/agents/:id', adminAuth, supportController.updateAgent);
router.delete('/admin/agents/:id', adminAuth, supportController.deleteAgent);

router.get('/admin/tickets', adminAuth, supportController.adminListTickets);
router.get('/admin/tickets/:ticketId/messages', adminAuth, supportController.adminGetTicketMessages);
router.delete('/admin/tickets/:ticketId', adminAuth, supportController.adminDeleteTicket);
router.post('/admin/tickets/:ticketId/assign', adminAuth, supportController.adminAssignTicket);

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
router.delete('/tickets/:ticketId', supportAgentAuth, supportController.agentDeleteTicket);
router.post('/tickets/:ticketId/pickup', supportAgentAuth, supportController.agentPickupTicket);
router.post('/tickets/:ticketId/escalate', supportAgentAuth, supportController.escalateTicket);

export default router;
