import { Request, Response } from 'express';
import { supportService } from '../services/support.service';
import { env } from '../config/env';

// 1. Verify Webhook
export const verifySupportWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Use same verify token or specific one
  const VERIFY_TOKEN = process.env.SUPPORT_WEBHOOK_VERIFY_TOKEN || env.webhookVerifyToken;

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Support Webhook verified');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

// 2. Handle Inbound
export const handleSupportWebhook = async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Basic structure check
    if (!body.object || !body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      return res.sendStatus(200);
    }

    const change = body.entry[0].changes[0];
    const value = change.value;
    
    // Check metadata to confirm it matches SUPPORT_PHONE_NUMBER_ID
    // This prevents main bot traffic from being processed here if they share webhook URL (though we set up separate route)
    // If separate route, this check is just extra safety.
    const metadataPhoneId = value.metadata?.phone_number_id;
    if (process.env.SUPPORT_PHONE_NUMBER_ID && metadataPhoneId !== process.env.SUPPORT_PHONE_NUMBER_ID) {
      // Not for us?
      // console.log('Ignored webhook for non-support number:', metadataPhoneId);
      return res.sendStatus(200);
    }

    const msg = value.messages[0];
    const from = msg.from; // User phone
    const messageId = msg.id;
    const profileName = value.contacts?.[0]?.profile?.name;

    let text = '';
    
    if (msg.type === 'text') {
      text = msg.text.body;
    } else if (msg.type === 'interactive') {
      const interactive = msg.interactive;
      if (interactive.type === 'button_reply') {
        const btnId = interactive.button_reply.id;
        const btnTitle = interactive.button_reply.title;
        
        if (btnId === 'END_CHAT') {
            await supportService.endTicketByUser(from);
            return res.sendStatus(200);
        }
        
        text = btnTitle; // Treat button click as text message for chat history
      } else {
         text = '[Interactive Message]';
      }
    } else {
      // Handle other types as text fallback
      text = `[${msg.type.toUpperCase()}]`; 
      if (msg.caption) text += ` ${msg.caption}`;
    }

    // Process
    await supportService.handleInboundMessage(from, text, messageId, profileName);

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error in support webhook:', err);
    res.sendStatus(200); // Always 200 to Meta
  }
};
