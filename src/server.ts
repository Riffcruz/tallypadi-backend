import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import sanitize from 'mongo-sanitize';
import crypto from 'crypto';
import path from 'path';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { generateSaleReceiptPdf } from './controllers/receipt.controller';
import { initSocket } from './socket';
import { authRequired } from './middleware/authRequired';

// --- BULL BOARD ADAPTERS ---
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { replyQueue, bulkQueue, messageQueue, notificationQueue } from './services/queue.service';

// --- ROUTERS ---
import whatsappRouter from './routes/whatsapp.routes';
import paymentRouter from './routes/payment.routes';
import adminRouter from './routes/admin.routes';
import investorRouter from './routes/investor.routes';
import webhookRoutes from './routes/webhook.routes';
import healthRouter from './routes/health.routes';
import orderRouter from './routes/order.routes';
import shopRouter from './routes/shop.routes';
import hqRouter from './routes/hq.routes';
import invoiceRouter from './routes/invoice.routes';
import supportRouter from './routes/support.routes';
import supportWebhookRouter from './routes/support.webhook.routes';
import expenseRouter from './routes/expense.routes';
import customerRouter from './routes/customer.routes';

// --- SERVICES & CONFIG ---
import {
  loginUser,
  registerUser,
  verifyRegistrationOTP,
  requestForgotPasswordOTP,
  resetPassword,
  requestChangePhoneOTP,
  verifyChangePhoneOTP,
  requestStaffLoginOTP,
  loginStaffWithOTP,
} from './controllers/auth.controller';
import { startScheduler } from './services/scheduler';
import { env } from './config/env';

// --- CONTROLLERS ---
import { getDashboardData } from './controllers/dashboard.controller';
import {
  getInventory,
  getInventoryItem,
  addInventoryItem,
  updateInventoryItem,
  getCategories,
  deleteInventoryItem
} from './controllers/inventory.controller';
import { updateSettings } from './controllers/settings.controller';
import { getGlobalSettings } from './controllers/admin.controller';
import { getStaff, addStaff, removeStaff, updateStaff } from './controllers/staff.controller';
import { presignUpload } from './controllers/upload.controller';

import {
  recordSale,
  getSalesHistory,
  generateSalesReport,
  closeRegister
} from './controllers/sales.controller';

import {
  getDebtors,
  createDebtor,
  updateDebtor,
  deleteDebtor,
  recordDebtPayment
} from './controllers/debtor.controller';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

app.use(helmet());

const corsOptions: cors.CorsOptions = {
  origin: process.env.NODE_ENV === 'production' ? 'https://tallypadi.com' : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],

};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`📨 ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

// ==========================================
// 🔐 WEBHOOK SIGNATURE VERIFICATION (SAFE HEX COMPARE)
// ==========================================


const verifySignature = (req: Request, _res: Response, buf: Buffer) => {
  // ✅ Always store raw body for ANY route that needs HMAC verification later (Paystack, etc.)
  req.rawBody = buf;

  // Only verify WhatsApp signature on WhatsApp webhook routes
  if ((!req.originalUrl.startsWith('/api/whatsapp') && !req.originalUrl.startsWith('/api/support/webhook')) || req.method !== 'POST') return;

  const header = req.headers['x-hub-signature-256'];
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  req.signatureValid = false;

  // ✅ Optional dev bypass
  if (process.env.NODE_ENV !== 'production') {
    req.signatureValid = true;
    return;
  }

  if (!appSecret || typeof header !== 'string') return;

  const givenHex = header.startsWith('sha256=') ? header.slice(7) : header;
  const expectedHex = crypto.createHmac('sha256', appSecret).update(buf).digest('hex');

  try {
    const a = Buffer.from(givenHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    req.signatureValid = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    req.signatureValid = false;
  }
};

app.use(express.json({ limit: '10mb', verify: verifySignature }));

// ==========================================
// 🚦 RATE LIMITERS
// ==========================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

// ✅ Login: IP limiter
const loginLimiterIp = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts from this IP. Try again in 3 minutes.',
});

const normalizeStr = (v: unknown) => String(v || '').trim().toLowerCase();
const normalizePhoneDigits = (v: unknown) => String(v || '').replace(/[^\d]/g, '');

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ✅ Login: identifier limiter (email OR phone)
const loginLimiterIdentity = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts for this account. Try again in 3 minutes.',
  keyGenerator: (req: Request) => {
    const identifier = normalizeStr(req.body?.identifier || req.body?.email || req.body?.phoneNumber);

    if (!identifier) return `ip:${ipKeyGenerator(req as any)}`;

    if (looksLikeEmail(identifier)) return `email:${identifier}`;
    return `phone:${normalizePhoneDigits(identifier)}`;
  },
});


// ✅ Separate EMAIL limiter (extra protection)
const emailLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts for this email. Try again in 3 minutes.',
  keyGenerator: (req: Request) => {
    const identifier = normalizeStr(req.body?.identifier || req.body?.email);
    if (identifier && looksLikeEmail(identifier)) return `email:${identifier}`;
    return `ip:${ipKeyGenerator(req as any)}`;
  },
});


// ✅ Separate PHONE limiter (extra protection)
const phoneLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts for this phone number. Try again in 3 minutes.',
  keyGenerator: (req: Request) => {
    const identifier = normalizeStr(req.body?.identifier || req.body?.phoneNumber);
    if (!identifier) return `ip:${ipKeyGenerator(req as any)}`;
    if (looksLikeEmail(identifier)) return `ip:${ipKeyGenerator(req as any)}`;
    return `phone:${normalizePhoneDigits(identifier)}`;
  },
});

// ✅ Presign upload limiter
const presignUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many upload presign requests from this IP, please try again after 15 minutes',
  keyGenerator: (req: Request) => (req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req as any)}`),
});

// ✅ Register limiter
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 accounts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many accounts created from this IP, please try again after an hour',
});

// ✅ Forgot Password limiter (stricter)
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 3 attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many password reset requests. Please try again in an hour.',
  keyGenerator: (req: Request) => {
    const identifier = normalizeStr(req.body?.identifier);
    if (!identifier) return `ip:${ipKeyGenerator(req as any)}`;
    return `fp:${normalizePhoneDigits(identifier)}`;
  },
});


app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  // Skip rate limit for webhooks
  if (req.originalUrl.startsWith('/api/whatsapp') || req.originalUrl.startsWith('/api/webhook')) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// ==========================================
// ✅ WEBHOOK ROUTES (No Auth Required)
// ==========================================
app.use(
  '/api/whatsapp',
  (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'production' && req.method === 'POST' && req.signatureValid === false) {
      console.error('❌ WhatsApp webhook rejected: invalid/missing signature');
      return res.sendStatus(401);
    }
    next();
  },
  whatsappRouter
);

app.use('/api/webhook', webhookRoutes);
app.use('/api/support/webhook', supportWebhookRouter); // ✅ New Support Webhook

// ==========================================
// 🧼 SECURITY SANITIZATION
// ==========================================


app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.body) req.body = sanitize(req.body);

  // DO NOT reassign req.query / req.params — mutate in place
  if (req.query && typeof req.query === 'object') {
    for (const k of Object.keys(req.query)) {
      (req.query as Record<string, unknown>)[k] = sanitize((req.query as Record<string, unknown>)[k]);
    }
  }

  if (req.params && typeof req.params === 'object') {
    for (const k of Object.keys(req.params)) {
      (req.params as Record<string, unknown>)[k] = sanitize((req.params as Record<string, unknown>)[k]);
    }
  }

  next();
});





// ==========================================
// 🚀 API ROUTES
// ==========================================

// --- AUTH & DASHBOARD ---
// ✅ APPLY: IP + identity + email + phone limiters
app.post('/api/login', loginLimiterIp, loginLimiterIdentity, emailLimiter, phoneLimiter, loginUser);
app.post('/api/login/staff/request-otp', loginLimiterIp, phoneLimiter, requestStaffLoginOTP);
app.post('/api/login/staff', loginLimiterIp, loginLimiterIdentity, phoneLimiter, loginStaffWithOTP);
app.post('/api/register', registerLimiter, registerUser);
app.post('/api/register/verify', verifyRegistrationOTP); // Does not need rate limiting beyond overall API limiter as it requires OTP check


// ✅ Forgot Password
app.post('/api/auth/forgot-password', forgotPasswordLimiter, requestForgotPasswordOTP);
app.post('/api/auth/reset-password', loginLimiterIp, resetPassword);

// ✅ Change Phone Number
app.post('/api/auth/change-phone', authRequired, requestChangePhoneOTP);
app.post('/api/auth/change-phone/verify', authRequired, verifyChangePhoneOTP);

app.get('/api/dashboard', authRequired, getDashboardData);

// --- INVENTORY ---
app.get('/api/inventory', authRequired, getInventory);
app.get('/api/inventory/categories', authRequired, getCategories);
app.get('/api/inventory/:id', authRequired, getInventoryItem);
app.post('/api/inventory', authRequired, addInventoryItem);
app.put('/api/inventory/:id', authRequired, updateInventoryItem);
app.delete('/api/inventory/:id', authRequired, deleteInventoryItem);

// --- UPLOADS ---
app.post('/api/uploads/presign', authRequired, presignUploadLimiter, presignUpload); // R2 presigned upload endpoint

// --- SALES ---
app.post('/api/sales', authRequired, recordSale);
app.get('/api/sales', authRequired, getSalesHistory);
app.get('/api/sales/report', authRequired, generateSalesReport);
app.post('/api/sales/close-register', authRequired, closeRegister);

// --- DEBTORS ---
app.get('/api/debtors', authRequired, getDebtors);
app.post('/api/debtors', authRequired, createDebtor);
app.put('/api/debtors/:id', authRequired, updateDebtor);
app.delete('/api/debtors/:id', authRequired, deleteDebtor);

// --- CUSTOMERS & CRM ---
app.use('/api/customers', customerRouter);

// --- DEBTOR PAYMENTS ---
app.post('/api/debtors/payment', authRequired, recordDebtPayment);

app.get('/api/sales/:saleId/receipt', authRequired, generateSaleReceiptPdf);

// --- SETTINGS & STAFF ---
app.put('/api/settings', authRequired, updateSettings);
app.get('/api/admin/settings', getGlobalSettings); // Public config (OK if intentional)
app.get('/api/staff', authRequired, getStaff);
app.post('/api/staff', authRequired, addStaff);
app.put('/api/staff/:id', authRequired, updateStaff);
app.delete('/api/staff/:id', authRequired, removeStaff);

// --- BILLING & SYSTEM ---
app.use('/api/payment', paymentRouter);
app.use('/api/health', healthRouter);
app.use('/api/orders', authRequired, orderRouter);
app.use('/api/shop', shopRouter);
app.use('/api/hq', hqRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/expenses', authRequired, expenseRouter);

// --- LIVE SUPPORT ---
app.use('/api/support', supportRouter);

// ==========================================
// 📊 QUEUE MONITORING DASHBOARD (Bull Board)
// ==========================================
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(replyQueue),
    new BullMQAdapter(bulkQueue),
    new BullMQAdapter(messageQueue),
    new BullMQAdapter(notificationQueue)
  ],
  serverAdapter: serverAdapter,
});

// Mounted publicly or add authRequired if preferred, currently open local to server instance testing
app.use('/api/admin/queues', serverAdapter.getRouter());


// --- ADMIN (SITE OWNER) ---
const adminLimiterPerUser = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many admin requests, slow down.',
  keyGenerator: (req: Request) => (req.user?.id ? `admin:${req.user.id}` : `ip:${ipKeyGenerator(req as any)}`),
});


app.use('/api/admin', authRequired, adminLimiterPerUser, adminRouter);
app.use('/api/investor', authRequired, investorRouter);


// ==========================================
// 📁 STATIC FILES
// ==========================================
app.use('/reports', express.static(path.join(__dirname, '..', 'public', 'reports')));
app.use('/api/reports', express.static(path.join(__dirname, '..', 'public', 'reports'))); // ✅ Support API-prefixed access
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

app.get('/', (_req: Request, res: Response) => {
  res.send('🛡️ Tallypadi Server is Secured & Running');
});

// ==========================================
// 🔌 START SERVER
// ==========================================
if (require.main === module) {
  const server = createServer(app);
  initSocket(server);

  mongoose
    .connect(env.mongoUri)
    .then(() => {
      console.log('✅ MongoDB Connected (Secured)');
      startScheduler();

      const PORT = Number(env.port ?? process.env.PORT ?? 5000);
      if (!Number.isFinite(PORT)) throw new Error(`Invalid PORT: ${env.port}`);

      server.listen(PORT, '127.0.0.1', () => {
        console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
      });

      console.log('✅ Scheduler initialized at', new Date().toISOString());
    })
    .catch((err) => console.error('❌ DB Connection Error:', err));
}

export default app;
