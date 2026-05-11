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
import {
  approveAdminAdCampaign,
  completeAdminAdCampaign,
  getAdminAdCampaigns,
  getAdminAdCampaignById,
  pauseAdminAdCampaign,
  reallocateAdminProviderCampaign,
  refundAdminProviderCampaign,
  rejectAdminAdCampaign,
  resubmitAdminProviderCampaign,
  resumeAdminAdCampaign,
  updateAdminProviderCampaignMetrics,
  updateAdminProviderCampaignStatus,
} from '../controllers/admin.ads.controller';
import {
  approveSellerVerificationForAdmin,
  deleteSellerVerificationForAdmin,
  getSellerVerificationForAdmin,
  listSellerVerificationsForAdmin,
  rejectSellerVerificationForAdmin,
} from '../controllers/sellerVerification.controller';

const router = Router();

router.use(verifyAdmin);

// Dashboard
router.get('/analytics', getSystemAnalytics);

// Ads Review
router.get('/ads', getAdminAdCampaigns);
router.get('/ads/campaigns', getAdminAdCampaigns);
router.get('/ads/campaigns/:id', getAdminAdCampaignById);
router.patch('/ads/:id/approve', approveAdminAdCampaign);
router.patch('/ads/:id/reject', rejectAdminAdCampaign);
router.patch('/ads/:id/complete', completeAdminAdCampaign);
router.post('/ads/campaigns/:id/approve', approveAdminAdCampaign);
router.post('/ads/campaigns/:id/reject', rejectAdminAdCampaign);
router.post('/ads/campaigns/:id/pause', pauseAdminAdCampaign);
router.post('/ads/campaigns/:id/resume', resumeAdminAdCampaign);
router.post('/ads/campaigns/:id/complete', completeAdminAdCampaign);
router.post('/ads/provider-campaigns/:id/status', updateAdminProviderCampaignStatus);
router.post('/ads/provider-campaigns/:id/metrics', updateAdminProviderCampaignMetrics);
router.post('/ads/provider-campaigns/:id/refund', refundAdminProviderCampaign);
router.post('/ads/provider-campaigns/:id/reallocate', reallocateAdminProviderCampaign);
router.post('/ads/provider-campaigns/:id/resubmit', resubmitAdminProviderCampaign);

// Marketplace Seller Verification
router.get('/marketplace-verifications', listSellerVerificationsForAdmin);
router.get('/marketplace-verifications/:id', getSellerVerificationForAdmin);
router.post('/marketplace-verifications/:id/approve', approveSellerVerificationForAdmin);
router.post('/marketplace-verifications/:id/reject', rejectSellerVerificationForAdmin);
router.delete('/marketplace-verifications/:id', deleteSellerVerificationForAdmin);

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
