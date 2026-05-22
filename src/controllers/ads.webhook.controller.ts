import { Request, Response } from 'express';
import { env } from '../config/env';
import { WebhookEvent } from '../models/webhookEvent.model';
import { ProviderCampaign } from '../models/providerCampaign.model';
import { processAutomatedAdRejection } from '../services/Campaign/adCampaign.service';
import { sendAdRejectionAdminNotification } from '../services/email.service';

// 1. Verify Meta Webhook (Challenge)
export const verifyMetaWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.webhookVerifyToken) {
    console.log('✅ Meta Ads Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.error('❌ Failed to verify Meta Ads Webhook', { query: req.query });
  return res.sendStatus(403);
};

// 2. Handle Meta Webhook payload
export const handleMetaWebhook = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    
    if (body.object !== 'page' && body.object !== 'ad_account') {
      return res.status(404).send('Not a supported webhook object');
    }

    // Acknowledge receipt to Meta immediately
    res.status(200).send('EVENT_RECEIVED');

    // Process entries
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        // Meta ad status update check
        if (change.field === 'ad_review' || change.field === 'campaign_status') {
          const value = change.value || {};
          
          const externalAdId = value.ad_id || value.campaign_id;
          const reviewStatus = value.ad_review_status || value.status;
          
          if (!externalAdId) continue;

          // Look up the provider campaign by external ID
          const providerCampaign = await ProviderCampaign.findOne({
            provider: 'META_ADS',
            $or: [
              { externalAdId: String(externalAdId) },
              { externalCampaignId: String(externalAdId) }
            ]
          }).populate('campaign');

          if (!providerCampaign) {
            console.log(`Webhook ignored: No provider campaign found for Meta external ID ${externalAdId}`);
            continue;
          }

          // If rejected by Meta
          if (reviewStatus === 'REJECTED' || reviewStatus === 'DISAPPROVED' || reviewStatus === 'WITHHELD') {
             const reason = value.rejection_reason || value.reason || 'Rejected by Meta Ad Review Policies';
             
             // Save Webhook Event Log for idempotency and debugging
             const idempotencyKey = `meta_ads_rejection_${externalAdId}_${entry.time || Date.now()}`;
             try {
                await WebhookEvent.create({
                  provider: 'META_ADS',
                  eventType: change.field,
                  providerObjectId: String(externalAdId),
                  campaign: providerCampaign.campaign,
                  providerCampaign: providerCampaign._id,
                  payload: change,
                  idempotencyKey,
                  signatureVerified: req.signatureValid || false,
                  processingStatus: 'PROCESSED',
                  processedAt: new Date()
                });
             } catch (e: any) {
                // If duplicate idempotency key, it means we already processed this
                if (e.code === 11000) continue;
                throw e;
             }

             // Trigger automated rejection process (Refund, Activity log, aggregate status update)
             await processAutomatedAdRejection(String(providerCampaign._id), reason);

             // Trigger admin email notification
             const campaignInfo = providerCampaign.campaign as any;
             await sendAdRejectionAdminNotification({
                campaignId: String(campaignInfo._id),
                campaignName: campaignInfo.name || 'Meta Ad Campaign',
                provider: 'META_ADS',
                reason,
             });
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error handling Meta Ads Webhook:', error);
  }
};
