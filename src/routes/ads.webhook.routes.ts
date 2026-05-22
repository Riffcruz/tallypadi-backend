import { Router } from 'express';
import { verifyMetaWebhook, handleMetaWebhook } from '../controllers/ads.webhook.controller';

export const adsWebhookRoutes = Router();

// Meta Ads Webhooks
adsWebhookRoutes.get('/meta', verifyMetaWebhook);
adsWebhookRoutes.post('/meta', handleMetaWebhook);
