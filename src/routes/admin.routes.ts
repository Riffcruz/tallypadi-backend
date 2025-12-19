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

// ✅ Single endpoint handles ALL admin actions:
// suspend | unsuspend | activate | cancel | change_plan | set_expiry
// send_message | clear_history | delete_user
router.put('/users/:id', manageUser);

// Staff
router.post('/users/:ownerId/staff', adminAddStaff);

router.use('/fx', fxRoutes);       // -> /api/fx
router.use('/chat', chatRoutes);   // -> /api/chat/send

// Tools
router.post('/broadcast', broadcastMessage);

export default router;
