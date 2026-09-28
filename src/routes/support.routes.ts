import { Router, RequestHandler } from 'express';
import { supportController } from '../controllers/support.controller';
import { supportAgentAuth } from '../middleware/support.middleware';
import { authRequired } from '../middleware/authRequired';
import { verifyAdmin } from '../middleware/admin.middleware';


const router = Router();

// Admin
router.use('/admin', authRequired, verifyAdmin);
router.post('/admin/agents', supportController.createAgent as unknown as RequestHandler);
router.get('/admin/agents', supportController.listAgents as unknown as RequestHandler);
router.put('/admin/agents/:id', supportController.updateAgent as unknown as RequestHandler);
router.delete('/admin/agents/:id', supportController.deleteAgent as unknown as RequestHandler);

router.get('/admin/tickets', supportController.adminListTickets as unknown as RequestHandler);
router.get('/admin/tickets/:ticketId/messages', supportController.adminGetTicketMessages as unknown as RequestHandler);
router.delete('/admin/tickets/:ticketId', supportController.adminDeleteTicket as unknown as RequestHandler);
router.post('/admin/tickets/:ticketId/assign', supportController.adminAssignTicket as unknown as RequestHandler);
router.post('/admin/tickets/:ticketId/send', supportController.adminSendMessage as unknown as RequestHandler);

// Agent Auth
router.post('/auth/login', supportController.login as unknown as RequestHandler);

// Agent Protected
router.get('/me', supportAgentAuth, supportController.getMe as unknown as RequestHandler);
router.post('/status', supportAgentAuth, supportController.setStatus as unknown as RequestHandler);
router.post('/push/subscribe', supportAgentAuth, supportController.subscribePush as unknown as RequestHandler);

// Users Management (Agent restricted)
router.get('/users', supportAgentAuth, supportController.getUsers as unknown as RequestHandler);
router.get('/users/:userId/details', supportAgentAuth, supportController.getUserDeepDive as unknown as RequestHandler);
router.put('/users/:userId', supportAgentAuth, supportController.manageUser as unknown as RequestHandler);

// Tickets
router.get('/tickets', supportAgentAuth, supportController.getTickets as unknown as RequestHandler);
router.get('/tickets/:ticketId/messages', supportAgentAuth, supportController.getMessages as unknown as RequestHandler);
router.post('/tickets/:ticketId/send', supportAgentAuth, supportController.sendMessage as unknown as RequestHandler);
router.post('/tickets/:ticketId/close', supportAgentAuth, supportController.closeTicket as unknown as RequestHandler);
router.delete('/tickets/:ticketId', supportAgentAuth, supportController.agentDeleteTicket as unknown as RequestHandler);
router.post('/tickets/:ticketId/pickup', supportAgentAuth, supportController.agentPickupTicket as unknown as RequestHandler);
router.post('/tickets/:ticketId/escalate', supportAgentAuth, supportController.escalateTicket as unknown as RequestHandler);

export default router;
