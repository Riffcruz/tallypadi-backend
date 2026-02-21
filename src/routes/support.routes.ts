import { Router, RequestHandler } from 'express';
import { supportController } from '../controllers/support.controller';
import { supportAgentAuth, adminAuth } from '../middleware/support.middleware';


const router = Router();

// Admin
router.post('/admin/agents', adminAuth, supportController.createAgent as unknown as RequestHandler);
router.get('/admin/agents', adminAuth, supportController.listAgents as unknown as RequestHandler);
router.put('/admin/agents/:id', adminAuth, supportController.updateAgent as unknown as RequestHandler);
router.delete('/admin/agents/:id', adminAuth, supportController.deleteAgent as unknown as RequestHandler);

router.get('/admin/tickets', adminAuth, supportController.adminListTickets as unknown as RequestHandler);
router.get('/admin/tickets/:ticketId/messages', adminAuth, supportController.adminGetTicketMessages as unknown as RequestHandler);
router.delete('/admin/tickets/:ticketId', adminAuth, supportController.adminDeleteTicket as unknown as RequestHandler);
router.post('/admin/tickets/:ticketId/assign', adminAuth, supportController.adminAssignTicket as unknown as RequestHandler);
router.post('/admin/tickets/:ticketId/send', adminAuth, supportController.adminSendMessage as unknown as RequestHandler);

// Agent Auth
router.post('/auth/login', supportController.login as unknown as RequestHandler);

// Agent Protected
router.get('/me', supportAgentAuth, supportController.getMe as unknown as RequestHandler);
router.post('/status', supportAgentAuth, supportController.setStatus as unknown as RequestHandler);
router.post('/push/subscribe', supportAgentAuth, supportController.subscribePush as unknown as RequestHandler);

// Tickets
router.get('/tickets', supportAgentAuth, supportController.getTickets as unknown as RequestHandler);
router.get('/tickets/:ticketId/messages', supportAgentAuth, supportController.getMessages as unknown as RequestHandler);
router.post('/tickets/:ticketId/send', supportAgentAuth, supportController.sendMessage as unknown as RequestHandler);
router.post('/tickets/:ticketId/close', supportAgentAuth, supportController.closeTicket as unknown as RequestHandler);
router.delete('/tickets/:ticketId', supportAgentAuth, supportController.agentDeleteTicket as unknown as RequestHandler);
router.post('/tickets/:ticketId/pickup', supportAgentAuth, supportController.agentPickupTicket as unknown as RequestHandler);
router.post('/tickets/:ticketId/escalate', supportAgentAuth, supportController.escalateTicket as unknown as RequestHandler);

export default router;
