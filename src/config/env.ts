import dotenv from 'dotenv';
import path from 'path';

// ✅ Ensure .env is loaded even when running from dist/
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoUri =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  'mongodb://127.0.0.1:27017/inventorybot';

if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
  console.error('❌ Invalid Mongo URI. Set MONGODB_URI or MONGO_URI in .env');
}

export const env = {
  port: process.env.PORT || '3000',
  mongoUri,
  whatsappToken: process.env.WHATSAPP_TOKEN as string,
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID as string,
  geminiApiKey: process.env.GEMINI_API_KEY as string,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN as string,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY as string,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
};
