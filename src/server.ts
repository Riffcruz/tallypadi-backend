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

import whatsappRouter from './routes/whatsapp.routes';
import paymentRouter from './routes/payment.routes';
import adminRouter from './routes/admin.routes';
import webhookRoutes from './routes/webhook.routes';
import healthRouter from './routes/health.routes';

import { loginUser } from './controllers/auth.controller';
import { startScheduler } from './services/scheduler';
import { env } from './config/env';
import { getDashboardData } from './controllers/dashboard.controller';
import { getInventory, addInventoryItem, updateInventoryItem } from './controllers/inventory.controller';
import { updateSettings } from './controllers/settings.controller';
import { getGlobalSettings } from './controllers/admin.controller';
import { recordSale, getSalesHistory, generateSalesReport } from './controllers/sales.controller';
import { getStaff, addStaff, removeStaff } from './controllers/staff.controller';

dotenv.config();

const app = express();

// ✅ Trust Nginx Proxy
app.set('trust proxy', 1);

// ==========================================
// 🛡️ BASIC SECURITY
// ==========================================
app.use(helmet());

// ✅ CORS
const corsOptions: cors.CorsOptions = {
  origin: process.env.NODE_ENV === 'production' ? 'https://tallypadi.com' : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// ✅ Debug logger
app.use((req, _res, next) => {
  console.log(`📨 ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
});

// ==========================================
// 🔐 WEBHOOK SIGNATURE (DO NOT THROW HERE)
// ==========================================
const verifySignature = (req: any, _res: any, buf: Buffer) => {
  // Only check signature for WhatsApp webhook POST
  if (!req.originalUrl.startsWith('/api/whatsapp') || req.method !== 'POST') return;

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  // In production, enforce signature
  if (process.env.NODE_ENV === 'production') {
    if (!signature || !appSecret) {
      req.signatureValid = false;
      return;
    }

    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(buf).digest('hex');

    try {
      // timing-safe compare
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);

      req.signatureValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      req.signatureValid = false;
    }
  } else {
    // In dev, allow
    req.signatureValid = true;
  }
};

// ✅ Parse JSON — use bigger limit for webhooks
app.use(express.json({ limit: '1mb', verify: verifySignature }));

// ==========================================
// 🚦 RATE LIMIT (DO NOT RATE LIMIT WEBHOOKS)
// ==========================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

// Apply limiter to normal API, not webhooks
app.use('/api', (req, res, next) => {
  if (req.originalUrl.startsWith('/api/whatsapp') || req.originalUrl.startsWith('/api/webhook')) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// ==========================================
// ✅ WEBHOOK ROUTES FIRST (NO XSS/SANITIZE)
// ==========================================
app.use('/api/whatsapp', (req: any, res, next) => {
  // Enforce signature only in production
  if (process.env.NODE_ENV === 'production' && req.method === 'POST' && req.signatureValid === false) {
    console.error('❌ WhatsApp webhook rejected: invalid/missing signature');
    return res.sendStatus(401);
  }
  next();
}, whatsappRouter);

app.use('/api/webhook', webhookRoutes);

// ==========================================
// 🧼 SANITIZE ONLY AFTER WEBHOOKS
// ==========================================
app.use(xss());

app.use((req, _res, next) => {
  // sanitize normal api input (not needed for raw webhooks)
  if (req.body) req.body = sanitize(req.body);
  if (req.params) req.params = sanitize(req.params);
  next();
});

// ==========================================
// 🚀 NORMAL API ROUTES
// ==========================================

// Auth
app.post('/api/login', loginUser);

// Dashboard
app.get('/api/dashboard', getDashboardData);

// Inventory
app.get('/api/inventory', getInventory);
app.post('/api/inventory', addInventoryItem);
app.put('/api/inventory/:id', updateInventoryItem);

// Sales
app.post('/api/sales', recordSale);
app.get('/api/sales', getSalesHistory);
app.get('/api/sales/report', generateSalesReport);

// Settings
app.put('/api/settings', updateSettings);

// Public Global Settings
app.get('/api/admin/settings', getGlobalSettings);

// Staff
app.get('/api/staff', getStaff);
app.post('/api/staff', addStaff);
app.delete('/api/staff/:id', removeStaff);

// Payment
app.use('/api/payment', paymentRouter);

// Health
app.use('/api/health', healthRouter);

// Admin Panel Routes
app.use('/api/admin', (req, _res, next) => {
  console.log(`🛡️ Admin API Hit: ${req.method} ${req.originalUrl}`);
  next();
}, adminRouter);

// ==========================================
// 📁 STATIC FILES
// ==========================================
app.use('/reports', express.static(path.join(__dirname, '..', 'public', 'reports')));

// Root health
app.get('/', (_req, res) => {
  res.send('🛡️ Tallypadi Server is Secured & Running');
});

// ==========================================
// 🔌 START SERVER
// ==========================================
mongoose.connect(env.mongoUri)
  .then(() => {
    console.log('✅ MongoDB Connected (Secured)');
    startScheduler();

    app.listen(env.port, () => console.log(`🚀 Server running on port ${env.port}`));
  })
  .catch((err) => console.error('❌ DB Connection Error:', err));
