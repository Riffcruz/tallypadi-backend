import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import sanitize from 'mongo-sanitize';
import { xss } from 'express-xss-sanitizer';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import path from 'path';
import jwt from 'jsonwebtoken';

import whatsappRouter from './routes/whatsapp.routes';
import paymentRouter from './routes/payment.routes';
import adminRouter from './routes/admin.routes';
import webhookRoutes from './routes/webhook.routes';
import healthRouter from './routes/health.routes';

import { loginUser } from './controllers/auth.controller';
import { startScheduler } from './services/scheduler';
import { env } from './config/env';
import { getDashboardData } from './controllers/dashboard.controller';

import {
  getInventory,
  getInventoryItem,
  addInventoryItem,
  updateInventoryItem,
} from './controllers/inventory.controller';

import { updateSettings } from './controllers/settings.controller';
import { getGlobalSettings } from './controllers/admin.controller';
import { recordSale, getSalesHistory, generateSalesReport } from './controllers/sales.controller';
import { getStaff, addStaff, removeStaff } from './controllers/staff.controller';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

app.use(helmet());

const corsOptions: cors.CorsOptions = {
  origin: process.env.NODE_ENV === 'production' ? 'https://tallypadi.com' : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use((req, _res, next) => {
  console.log(`📨 ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

// ==========================================
// 🔐 WEBHOOK SIGNATURE
// ==========================================
const verifySignature = (req: any, _res: any, buf: Buffer) => {
  if (!req.originalUrl.startsWith('/api/whatsapp') || req.method !== 'POST') return;

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!signature || !appSecret) {
      req.signatureValid = false;
      return;
    }

    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(buf).digest('hex');

    try {
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      req.signatureValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      req.signatureValid = false;
    }
  } else {
    req.signatureValid = true;
  }
};

app.use(express.json({ limit: '1mb', verify: verifySignature }));

// ==========================================
// 🚦 RATE LIMIT
// ==========================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

app.use('/api', (req, res, next) => {
  if (req.originalUrl.startsWith('/api/whatsapp') || req.originalUrl.startsWith('/api/webhook')) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// ==========================================
// ✅ WEBHOOK ROUTES FIRST
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
// 🧼 SANITIZE AFTER WEBHOOKS
// ==========================================
app.use(xss());

app.use((req, _res, next) => {
  if (req.body) req.body = sanitize(req.body);
  if (req.params) req.params = sanitize(req.params);
  next();
});

// ==========================================
// ✅ AUTH MIDDLEWARE (JWT)
// ==========================================
const authRequired = (req: any, res: any, next: any) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7);
  const secret = process.env.JWT_SECRET || (env as any).jwtSecret;

  try {
    // If secret exists => verify. Else decode (dev fallback)
    const decoded: any = secret ? jwt.verify(token, secret) : jwt.decode(token);
    const userId = decoded?.id || decoded?._id || decoded?.userId;

    if (!userId) return res.status(401).json({ error: 'Invalid token' });

    req.user = { id: userId };
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ==========================================
// 🚀 NORMAL API ROUTES
// ==========================================

// Auth
app.post('/api/login', loginUser);

// Dashboard (if your dashboard needs auth, add authRequired here too)
app.get('/api/dashboard', authRequired, getDashboardData);

// Inventory ✅ (auth + includes GET /:id)
app.get('/api/inventory', authRequired, getInventory);
app.get('/api/inventory/:id', authRequired, getInventoryItem);
app.post('/api/inventory', authRequired, addInventoryItem);
app.put('/api/inventory/:id', authRequired, updateInventoryItem);

// Sales ✅ (auth)
app.post('/api/sales', authRequired, recordSale);
app.get('/api/sales', authRequired, getSalesHistory);
app.get('/api/sales/report', authRequired, generateSalesReport);

// Settings
app.put('/api/settings', authRequired, updateSettings);

// Public Global Settings
app.get('/api/admin/settings', getGlobalSettings);

// Staff
app.get('/api/staff', authRequired, getStaff);
app.post('/api/staff', authRequired, addStaff);
app.delete('/api/staff/:id', authRequired, removeStaff);

// Payment
app.use('/api/payment', paymentRouter);

// Health
app.use('/api/health', healthRouter);

// Admin
app.use(
  '/api/admin',
  (req, _res, next) => {
    console.log(`🛡️ Admin API Hit: ${req.method} ${req.originalUrl}`);
    next();
  },
  adminRouter
);

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

    app.listen(env.port, () => console.log(`🚀 Server running on port ${env.port}`));
  })
  .catch((err) => console.error('❌ DB Connection Error:', err));
