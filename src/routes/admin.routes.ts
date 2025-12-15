import { Router } from 'express';
import { verifyAdmin } from '../middleware/admin.middleware';
import { 
    getSystemAnalytics, 
    getAllUsers, 
    manageUser, 
    getUserDeepDive,
    broadcastMessage,
    getGlobalSettings,
    updateGlobalSettings,
    adminAddStaff 
} from '../controllers/admin.controller';

const router = Router();

router.use(verifyAdmin);

// Dashboard
router.get('/analytics', getSystemAnalytics);

// Global Settings (Jailbreak, etc.)
router.get('/settings', getGlobalSettings);
router.put('/settings', updateGlobalSettings);

// User Management
router.get('/users', getAllUsers);
router.get('/users/:id/details', getUserDeepDive); // 🟢 NEW
router.put('/users/:id', manageUser); // 🟢 Handles suspend/unsuspend/plan/expiry
router.post('/users/:ownerId/staff', adminAddStaff);

// Tools
router.post('/broadcast', broadcastMessage);

export default router;