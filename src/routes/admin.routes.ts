import { Router } from 'express';
import { verifyAdmin } from '../middleware/admin.middleware';
import fxRoutes from './fx.routes';
import chatRoutes from './chat.routes';

import {
  getSystemAnalytics,
  getAllUsers,
  manageUser,
  getUserDeepDive,
  broadcastMessage,
  getGlobalSettings,
  updateGlobalSettings,
  adminAddStaff,
  deleteStaffMember,
  unlinkStaffMember,
  cleanupStaffHierarchy,
  createInvestor,
  getInvestors,
  deleteInvestor,
  getEmailTemplates,
  createEmailTemplate,
  deleteEmailTemplate,
  deleteUserInventoryItem,
  clearUserInventory
} from '../controllers/admin.controller';

const router = Router();

router.use(verifyAdmin);

// Dashboard
router.get('/analytics', getSystemAnalytics);

// Global Settings
router.get('/settings', getGlobalSettings);
router.put('/settings', updateGlobalSettings);

// User Management
router.get('/users', getAllUsers);
router.get('/users/:id/details', getUserDeepDive);

// Investor Management
router.get('/investors', getInvestors);
router.post('/investors', createInvestor);
router.delete('/investors/:id', deleteInvestor);

// ✅ Single endpoint handles ALL admin actions:
// suspend | unsuspend | activate | cancel | change_plan | set_expiry
// send_message | clear_history | delete_user
router.put('/users/:id', manageUser);
router.delete('/users/:id/inventory/:itemId', deleteUserInventoryItem);
router.delete('/users/:id/inventory', clearUserInventory);

// Staff
router.post('/users/:ownerId/staff', adminAddStaff);
router.post('/staff/cleanup', cleanupStaffHierarchy); // ✅ New cleanup endpoint
router.delete('/staff/:staffId', deleteStaffMember);
router.put('/staff/:staffId/unlink', unlinkStaffMember);

router.use('/fx', fxRoutes);       // -> /api/fx
router.use('/chat', chatRoutes);   // -> /api/chat/send

// Tools
router.post('/broadcast', broadcastMessage);
router.get('/email-templates', getEmailTemplates);
router.post('/email-templates', createEmailTemplate);
router.delete('/email-templates/:id', deleteEmailTemplate);

export default router;
