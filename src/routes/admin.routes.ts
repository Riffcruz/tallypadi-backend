import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyAdmin } from '../middleware/admin.middleware';
import fxRoutes from './fx.routes';
import chatRoutes from './chat.routes';

import {
  getSystemAnalytics,
  getAllUsers,
  manageUser,
  getUserDeepDive,
  composePersonalUserMessage,
  sendPersonalUserMessage,
  broadcastMessage,
  getBroadcastQueueStatus,
  pauseBroadcastQueue,
  resumeBroadcastQueue,
  clearBroadcastQueue,
  getGlobalSettings,
  updateGlobalSettings,
  testHostingerReach,
  getHostingerReachUnsubscribedContacts,
  adminTopUpUserAdsWallet,
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
  getAdminAdProviderReadiness,
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
  requestSellerReverificationForAdmin,
} from '../controllers/sellerVerification.controller';
import { getAdminReferralTransactions } from '../controllers/referral.controller';
import {
  createAdminBlogPost,
  deleteAdminBlogPost,
  generateAdminBlogDraft,
  listAdminBlogPosts,
  publishAdminBlogPost,
  unpublishAdminBlogPost,
  updateAdminBlogPost,
} from '../controllers/blog.controller';
import {
  getAdminContactTicket,
  listAdminContactTickets,
  updateAdminContactTicket,
} from '../controllers/contactTicket.controller';
import {
  createAdminPromoCode,
  listAdminPromoCodes,
  updateAdminPromoCode,
} from '../controllers/promoCode.controller';

const router = Router();
const blogAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `admin:${req.user?.id || 'authenticated'}`,
  message: { error: 'Too many AI article requests. Please wait before generating another draft.' },
});
const personalMessageAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `admin-message:${req.user?.id || 'authenticated'}`,
  message: { error: 'Too many AI message requests. Please wait before generating another draft.' },
});

router.use(verifyAdmin);

// Contact form tickets
router.get('/contact-tickets', listAdminContactTickets);
router.get('/contact-tickets/:id', getAdminContactTicket);
router.patch('/contact-tickets/:id', updateAdminContactTicket);

// Dashboard
router.get('/analytics', getSystemAnalytics);

// Promotional subscription codes
router.get('/promo-codes', listAdminPromoCodes);
router.post('/promo-codes', createAdminPromoCode);
router.patch('/promo-codes/:id', updateAdminPromoCode);

// Ads Review
router.get('/ads', getAdminAdCampaigns);
router.get('/ads/campaigns', getAdminAdCampaigns);
router.get('/ads/provider-readiness', getAdminAdProviderReadiness);
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
router.post('/marketplace-verifications/:id/request-reverification', requestSellerReverificationForAdmin);
router.delete('/marketplace-verifications/:id', deleteSellerVerificationForAdmin);

// Blog CMS
router.get('/blog', listAdminBlogPosts);
router.post('/blog/generate', blogAiLimiter, generateAdminBlogDraft);
router.post('/blog', createAdminBlogPost);
router.put('/blog/:id', updateAdminBlogPost);
router.post('/blog/:id/publish', publishAdminBlogPost);
router.post('/blog/:id/unpublish', unpublishAdminBlogPost);
router.delete('/blog/:id', deleteAdminBlogPost);

// Global Settings
router.get('/settings', getGlobalSettings);
router.put('/settings', updateGlobalSettings);
router.post('/settings/hostinger-reach/test', testHostingerReach);
router.get('/settings/hostinger-reach/unsubscribed', getHostingerReachUnsubscribedContacts);

// User Management
router.get('/users', getAllUsers);
router.get('/referrals', getAdminReferralTransactions);
router.get('/users/:id/details', getUserDeepDive);
router.post('/users/:id/messages/compose', personalMessageAiLimiter, composePersonalUserMessage);
router.post('/users/:id/messages/send', sendPersonalUserMessage);
router.post('/users/:id/ads-wallet/top-up', adminTopUpUserAdsWallet);

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
router.get('/broadcast/queue', getBroadcastQueueStatus);
router.post('/broadcast/queue/pause', pauseBroadcastQueue);
router.post('/broadcast/queue/resume', resumeBroadcastQueue);
router.post('/broadcast/queue/clear', clearBroadcastQueue);
router.get('/email-templates', getEmailTemplates);
router.post('/email-templates', createEmailTemplate);
router.delete('/email-templates/:id', deleteEmailTemplate);

export default router;
