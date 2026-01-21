import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import sanitize from 'mongo-sanitize';
import crypto from 'crypto';
import path from 'path';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { generateSaleReceiptPdf } from './controllers/receipt.controller';




// --- ROUTERS ---
import whatsappRouter from './routes/whatsapp.routes';
import paymentRouter from './routes/payment.routes';
import adminRouter from './routes/admin.routes';
import investorRouter from './routes/investor.routes';
import webhookRoutes from './routes/webhook.routes';
import healthRouter from './routes/health.routes';
import orderRouter from './routes/order.routes';

// --- SERVICES & CONFIG ---
import { loginUser } from './controllers/auth.controller';
import { startScheduler } from './services/scheduler';
import { env } from './config/env';

// --- CONTROLLERS ---
import { getDashboardData } from './controllers/dashboard.controller';
import {
  getInventory,
  getInventoryItem,
  addInventoryItem,
  updateInventoryItem
} from './controllers/inventory.controller';
import { updateSettings } from './controllers/settings.controller';
import { getGlobalSettings } from './controllers/admin.controller';
import { getStaff, addStaff, removeStaff } from './controllers/staff.controller';

import {
  recordSale,
  getSalesHistory,
  generateSalesReport
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
app.use((req, _res, next) => {
  console.log(`📨 ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

// ==========================================
// 🔐 WEBHOOK SIGNATURE VERIFICATION (SAFE HEX COMPARE)
// ==========================================


const verifySignature = (req: any, _res: any, buf: Buffer) => {
  // ✅ Always store raw body for ANY route that needs HMAC verification later (Paystack, etc.)
  req.rawBody = buf;

  // Only verify WhatsApp signature on WhatsApp webhook routes
  if (!req.originalUrl.startsWith('/api/whatsapp') || req.method !== 'POST') return;

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

app.use(express.json({ limit: '1mb', verify: verifySignature }));

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
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts from this IP. Try again in 15 minutes.',
});

const normalizeStr = (v: any) => String(v || '').trim().toLowerCase();
const normalizePhoneDigits = (v: any) => String(v || '').replace(/[^\d]/g, '');

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ✅ Login: identifier limiter (email OR phone)
const loginLimiterIdentity = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts for this account. Try again in 15 minutes.',
  keyGenerator: (req: any) => {
    const identifier = normalizeStr(req.body?.identifier || req.body?.email || req.body?.phoneNumber);

    if (!identifier) return `ip:${ipKeyGenerator(req)}`;

    if (looksLikeEmail(identifier)) return `email:${identifier}`;
    return `phone:${normalizePhoneDigits(identifier)}`;
  },
});


// ✅ Separate EMAIL limiter (extra protection)
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts for this email. Try again in 15 minutes.',
  keyGenerator: (req: any) => {
    const identifier = normalizeStr(req.body?.identifier || req.body?.email);
    if (identifier && looksLikeEmail(identifier)) return `email:${identifier}`;
    return `ip:${ipKeyGenerator(req)}`;
  },
});


// ✅ Separate PHONE limiter (extra protection)
const phoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts for this phone number. Try again in 15 minutes.',
  keyGenerator: (req: any) => {
    const identifier = normalizeStr(req.body?.identifier || req.body?.phoneNumber);
    if (!identifier) return `ip:${ipKeyGenerator(req)}`;
    if (looksLikeEmail(identifier)) return `ip:${ipKeyGenerator(req)}`;
    return `phone:${normalizePhoneDigits(identifier)}`;
  },
});


app.use('/api', (req, res, next) => {
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
  (req: any, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.method === 'POST' && req.signatureValid === false) {
      console.error('❌ WhatsApp webhook rejected: invalid/missing signature');
      return res.sendStatus(401);
    }
    next();
  },
  whatsappRouter
);

app.use('/api/webhook', webhookRoutes);

// ==========================================
// 🧼 SECURITY SANITIZATION
// ==========================================


app.use((req: any, _res, next) => {
  if (req.body) req.body = sanitize(req.body);

  // DO NOT reassign req.query / req.params — mutate in place
  if (req.query && typeof req.query === 'object') {
    for (const k of Object.keys(req.query)) {
      (req.query as any)[k] = sanitize((req.query as any)[k]);
    }
  }

  if (req.params && typeof req.params === 'object') {
    for (const k of Object.keys(req.params)) {
      (req.params as any)[k] = sanitize((req.params as any)[k]);
    }
  }

  next();
});



// ==========================================
// 🛡️ AUTH MIDDLEWARE (NO jwt.decode FALLBACK)
// ==========================================
const authRequired = (req: any, res: any, next: any) => {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7);
  const secret = process.env.JWT_SECRET || (env as any).jwtSecret;

  if (!secret) {
    console.error('❌ JWT_SECRET missing (server misconfigured)');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const decoded: any = jwt.verify(token, secret, { algorithms: ['HS256'] });
    const userId = decoded?.id || decoded?._id || decoded?.userId;
    if (!userId) return res.status(401).json({ error: 'Invalid token' });

    req.user = { id: userId };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ==========================================
// 🚀 API ROUTES
// ==========================================

// --- AUTH & DASHBOARD ---
// ✅ APPLY: IP + identity + email + phone limiters
app.post('/api/login', loginLimiterIp, loginLimiterIdentity, emailLimiter, phoneLimiter, loginUser);

app.get('/api/dashboard', authRequired, getDashboardData);

// --- INVENTORY ---
app.get('/api/inventory', authRequired, getInventory);
app.get('/api/inventory/:id', authRequired, getInventoryItem);
app.post('/api/inventory', authRequired, addInventoryItem);
app.put('/api/inventory/:id', authRequired, updateInventoryItem);

// --- SALES ---
app.post('/api/sales', authRequired, recordSale);
app.get('/api/sales', authRequired, getSalesHistory);
app.get('/api/sales/report', authRequired, generateSalesReport);

// --- DEBTORS ---
app.get('/api/debtors', authRequired, getDebtors);
app.post('/api/debtors', authRequired, createDebtor);
app.put('/api/debtors/:id', authRequired, updateDebtor);
app.delete('/api/debtors/:id', authRequired, deleteDebtor);

// --- DEBTOR PAYMENTS ---
app.post('/api/debtors/payment', authRequired, recordDebtPayment);

app.get('/api/sales/:saleId/receipt', authRequired, generateSaleReceiptPdf);

// --- SETTINGS & STAFF ---
app.put('/api/settings', authRequired, updateSettings);
app.get('/api/admin/settings', getGlobalSettings); // Public config (OK if intentional)
app.get('/api/staff', authRequired, getStaff);
app.post('/api/staff', authRequired, addStaff);
app.delete('/api/staff/:id', authRequired, removeStaff);

// --- BILLING & SYSTEM ---
app.use('/api/payment', paymentRouter);
app.use('/api/health', healthRouter);
app.use('/api/orders', authRequired, orderRouter);

// --- ADMIN (SITE OWNER) ---
const adminLimiterPerUser = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many admin requests, slow down.',
  keyGenerator: (req: any) => (req.user?.id ? `admin:${req.user.id}` : `ip:${ipKeyGenerator(req)}`),
});


app.use('/api/admin', authRequired, adminLimiterPerUser, adminRouter);
app.use('/api/investor', authRequired, investorRouter);




// ==========================================
// 📁 STATIC FILES
// ==========================================
app.use('/reports', express.static(path.join(__dirname, '..', 'public', 'reports')));

app.get('/', (_req, res) => {
  res.send('🛡️ Tallypadi Server is Secured & Running');
});

// ==========================================
// 🔌 START SERVER
// ==========================================
mongoose
  .connect(env.mongoUri)
  .then(() => {
    console.log('✅ MongoDB Connected (Secured)');
    startScheduler();

    const PORT = Number(env.port ?? process.env.PORT ?? 5000);
    if (!Number.isFinite(PORT)) throw new Error(`Invalid PORT: ${env.port}`);

    app.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
    });

    console.log('✅ Scheduler initialized at', new Date().toISOString());
  })
  .catch((err) => console.error('❌ DB Connection Error:', err));

export default app;
