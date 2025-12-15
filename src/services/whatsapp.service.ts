import axios from 'axios';
import { env } from '../config/env';

const BASE_URL = 'https://graph.facebook.com/v21.0'; 

// 1. TEXT MESSAGE (For users active within 24h)
export const sendWhatsAppText = async (to: string, body: string) => {
  if (!body || body.trim() === "") {
    console.warn("⚠️ Attempted to send empty message. Skipping.");
    return;
  }

  const url = `${BASE_URL}/${env.whatsappPhoneNumberId}/messages`;

  try {
    console.log(`📤 Sending WhatsApp reply to ${to}...`); 
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsappToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
  }
};

// 2. TEMPLATE MESSAGE (REQUIRED for broadcasting to inactive users)
export const sendWhatsAppTemplate = async (to: string, templateName: string, components: any[] = [], languageCode = 'en_US') => {
  const url = `${BASE_URL}/${env.whatsappPhoneNumberId}/messages`;

  try {
    console.log(`📨 Sending Template '${templateName}' to ${to}...`);
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            components: components
        }
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsappToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    console.error('❌ Error sending WhatsApp Template:', error.response?.data || error.message);
  }
};