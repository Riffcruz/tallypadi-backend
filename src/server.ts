import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet'; // Security Headers
import cors from 'cors'; // Cross Origin Policy
import sanitize from 'mongo-sanitize';
import { xss } from 'express-xss-sanitizer'; // Anti-XSS (Modern replacement)
import rateLimit from 'express-rate-limit'; // Anti-Brute Force
import crypto from 'crypto'; // Native Crypto for signature verification
import path from 'path'; // Import path module

// Imports
import whatsappRouter from './routes/whatsapp.routes';
import { loginUser } from './controllers/auth.controller';
import { startScheduler } from './services/scheduler'; // Your Cron Job
import { env } from './config/env';
import { getDashboardData } from './controllers/dashboard.controller';
import { getInventory, addInventoryItem, updateInventoryItem } from './controllers/inventory.controller';
import { updateSettings } from './controllers/settings.controller';
import { recordSale, getSalesHistory, generateSalesReport } from './controllers/sales.controller';
import { getStaff, addStaff, removeStaff } from './controllers/staff.controller';
import adminRouter from './routes/admin.routes'; 
import webhookRoutes from './routes/webhook.routes';

dotenv.config();

const app = express();

// 🟢 NEW: Trust Nginx Proxy (Required for Rate Limiting to work behind Nginx)
// This fixes the ERR_ERL_UNEXPECTED_X_FORWARDED_FOR error
app.set('trust proxy', 1); 

// ==========================================
// 🛡️ SECURITY MIDDLEWARE LAYER
// ==========================================

app.use(helmet());

// Update CORS to allow requests from your domain
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? 'https://tallypadi.com' : true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'] 
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); 

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api', limiter); 

const verifySignature = (req: any, res: any, buf: any) => {
  const signature = req.headers['x-hub-signature-256'];
  
  // 🟢 FIXED: Check for the new path '/api/whatsapp'
  // using req.originalUrl is safer as it captures the full path
  if (req.originalUrl.includes('/api/whatsapp') && req.method === 'POST') {
    if (!signature) throw new Error('No signature found');
    
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
        console.warn("⚠️ WHATSAPP_APP_SECRET not set. Signature verification skipped (NOT SECURE).");
        return;
    }

    const elements = signature.split('=');
    const signatureHash = elements[1];
    const expectedHash = crypto.createHmac('sha256', appSecret).update(buf).digest('hex');

    if (signatureHash !== expectedHash) throw new Error('Invalid signature. Request rejected.');
  }
};

app.use(express.json({ limit: '10kb', verify: verifySignature })); 
app.use(xss());
app.use((req, res, next) => {
  if (req.body) req.body = sanitize(req.body);
  if (req.params) req.params = sanitize(req.params);
  next();
});

// ==========================================
// 🚀 ROUTES
// ==========================================

// Auth Route
app.post('/api/login', loginUser);

// Dashboard Route
app.get('/api/dashboard', getDashboardData);

// Inventory Routes
app.get('/api/inventory', getInventory);
app.post('/api/inventory', addInventoryItem);
app.put('/api/inventory/:id', updateInventoryItem);

// Sales Routes
app.post('/api/sales', recordSale);
app.get('/api/sales', getSalesHistory);
app.get('/api/sales/report', generateSalesReport);

// Settings Route
app.put('/api/settings', updateSettings);

// Staff Management Routes
app.get('/api/staff', getStaff);
app.post('/api/staff', addStaff);
app.delete('/api/staff/:id', removeStaff);

// Admin Panel Routes
app.use('/api/admin', (req, res, next) => {
  console.log(`🛡️ Admin API Hit: ${req.method} ${req.originalUrl}`);
  next();
}, adminRouter);

// 🟢 FIXED: Moved WhatsApp to /api/whatsapp so Nginx routes it correctly
// New Meta Webhook URL: https://tallypadi.com/api/whatsapp
app.use('/api/whatsapp', whatsappRouter);

// Paystack Webhook (Mounted at /api/webhook/paystack)
app.use('/api/webhook', webhookRoutes);

// Static Files
app.use('/reports', express.static(path.join(__dirname, '..', 'public', 'reports')));

// Health Check
app.get('/', (req, res) => {
  res.send('🛡️ Tallypadi Server is Secured & Running');
});

// ==========================================
// 🔌 SERVER START
// ==========================================
mongoose.connect(env.mongoUri)
  .then(() => {
    console.log("✅ MongoDB Connected (Secured)");
    startScheduler(); 
    app.listen(env.port, () => console.log(`🚀 Server running on port ${env.port}`));
  })
  .catch(err => console.error("❌ DB Connection Error:", err));