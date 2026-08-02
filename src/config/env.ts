import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: process.env.PORT || '3000',
  mongoUri: process.env.MONGODB_URI as string,
  whatsappToken: process.env.WHATSAPP_TOKEN as string,
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID as string,
  geminiApiKey: process.env.GEMINI_API_KEY as string,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash-001',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
  webhookVerifyToken: process.env.WEBHOOK_VERIFY_TOKEN as string,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY as string,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',

  // Cloudflare R2
  cfAccountId: process.env.CF_ACCOUNT_ID as string,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID as string,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
  r2Bucket: process.env.R2_BUCKET as string,
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL as string,
  whatsappRegistrationFlowId: process.env.WHATSAPP_REGISTRATION_FLOW_ID as string,
  whatsappAddStaffFlowId: process.env.WHATSAPP_ADD_STAFF_FLOW_ID as string,
  ads: {
    publicBaseUrl: process.env.ADS_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://tallypadi.com',
    autoSubmissionEnabled: process.env.ADS_AUTO_SUBMISSION_ENABLED === 'true',
    providerInitialStatus: String(process.env.ADS_PROVIDER_INITIAL_STATUS || 'PAUSED').toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'PAUSED',
    requestTimeoutMs: Math.max(5000, Number(process.env.ADS_PROVIDER_REQUEST_TIMEOUT_MS || 30000)),
    meta: {
      apiVersion: process.env.META_MARKETING_API_VERSION || 'v22.0',
      appSecret: process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || '',
      accessToken: process.env.META_ACCESS_TOKEN || '',
      adAccountId: process.env.META_AD_ACCOUNT_ID || '',
      pageId: process.env.META_PAGE_ID || '',
      instagramActorId: process.env.META_INSTAGRAM_ACTOR_ID || '',
      pixelId: process.env.META_PIXEL_ID || '',
    },
    google: {
      apiVersion: process.env.GOOGLE_ADS_API_VERSION || 'v22',
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
      clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
      refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
      loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '',
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID || '',
    },
    tiktok: {
      apiBaseUrl: process.env.TIKTOK_BUSINESS_API_BASE_URL || 'https://business-api.tiktok.com',
      apiVersion: process.env.TIKTOK_BUSINESS_API_VERSION || 'v1.3',
      accessToken: process.env.TIKTOK_BUSINESS_ACCESS_TOKEN || '',
      advertiserId: process.env.TIKTOK_ADVERTISER_ID || '',
      appId: process.env.TIKTOK_APP_ID || '',
      appSecret: process.env.TIKTOK_APP_SECRET || '',
      pixelId: process.env.TIKTOK_PIXEL_ID || '',
      identityId: process.env.TIKTOK_IDENTITY_ID || '',
      identityType: process.env.TIKTOK_IDENTITY_TYPE || '',
      defaultLocationIds: (process.env.TIKTOK_DEFAULT_LOCATION_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    },
  },
};
