import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: process.env.PORT || '3000',
  mongoUri: process.env.MONGODB_URI as string,
  whatsappToken: process.env.WHATSAPP_TOKEN as string,
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID as string,
  geminiApiKey: process.env.GEMINI_API_KEY as string,
  geminiModel: 'gemini-flash-latest', 
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN as string,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY as string,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  
  // Cloudflare R2
  cfAccountId: process.env.CF_ACCOUNT_ID as string,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID as string,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
  r2Bucket: process.env.R2_BUCKET as string,
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL as string,
};