import { Request, Response } from 'express';
import { Types } from 'mongoose';

import { User } from '../models/user.model';
import { parseMessageWithGemini } from '../services/gemini.service';
import { processTransaction } from '../services/transaction.service';
import { sendWhatsAppText } from '../services/whatsapp.service';

function safeString(x: any) {
  return String(x ?? '').trim();
}

// Assumes your auth middleware sets req.user.id (common pattern).
// If your project uses a different field, adjust this ONE line.
const getAuthUserId = (req: any): string | null => {
  return req?.user?.id || req?.user?._id || null;
};

export const sendChatMessage = async (req: any, res: Response) => {
  try {
    const uid = getAuthUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const userId = new Types.ObjectId(uid);
    const message = safeString(req.body?.message);
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // use last messages as history
    const history = (user.messageHistory || []).slice(-5);

    const parsed = await parseMessageWithGemini(
      message,
      user?.settings?.language || 'English',
      history
    );

    // Use a unique messageId so ProcessedMessage lock works
    const messageId = `dashboard_${userId.toString()}_${Date.now()}`;

    // Run your normal business logic
    await processTransaction(userId, parsed as any, messageId);

    // OPTIONAL: send reply to WhatsApp too (nice UX)
    // If you only want web reply, you can remove this block.
    if (user.phoneNumber && parsed.reply_text) {
      try {
        await sendWhatsAppText(user.phoneNumber, parsed.reply_text);
      } catch (e) {
        console.log('WhatsApp reply failed (dashboard chat still ok).');
      }
    }

    return res.json({
      success: true,
      reply: parsed.reply_text || 'Noted.',
      parsed,
    });
  } catch (e: any) {
    console.error('Chat send error:', e);
    return res.status(500).json({ error: 'Failed to process chat message' });
  }
};
