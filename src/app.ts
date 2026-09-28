import express, { Request, Response } from 'express';
import cors from 'cors';
import { json } from 'express';
import whatsappRouter from './routes/whatsapp.routes';
import expenseRouter from './routes/expense.routes';
import marketplaceRouter from './routes/marketplace.routes';
import blogRouter from './routes/blog.routes';
import {
  loginUser,
  registerUser,
  requestStaffLoginOTP,
  loginStaffWithOTP
} from './controllers/auth.controller';
import { User } from './models/user.model';
import { verifyUnsubscribeToken } from './services/emailSecurity.service';

const app = express();

app.use(cors());
app.use(json());

app.get('/', (_req: Request, res: Response) => {
  res.send('InventoryBot API is running');
});

// Public Unsubscribe
const unsubscribeEmail = async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || req.body?.token || '');
    if (!token) return res.status(400).send('Invalid unsubscribe link');
    const email = verifyUnsubscribeToken(token);
    
    await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { emailSubscribed: false }
    );
    
    // Return a clean unbranded success page
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribe</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
          .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; max-width: 400px; }
          h1 { color: #1e293b; margin-top: 0; }
          p { color: #64748b; line-height: 1.5; }
          .icon { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✅</div>
          <h1>Unsubscribed</h1>
          <p>You will no longer receive TallyPadi broadcast emails.</p>
        </div>
      </body>
      </html>
    `;
    
    res.send(html);
  } catch {
    res.status(400).send('This unsubscribe link is invalid or has expired.');
  }
};

app.get('/public/unsubscribe', unsubscribeEmail);
app.post('/public/unsubscribe', unsubscribeEmail);
app.get('/api/public/unsubscribe', unsubscribeEmail);
app.post('/api/public/unsubscribe', unsubscribeEmail);

// Auth Routes
app.post('/api/login', loginUser);
app.post('/api/register', registerUser);

// Staff OTP Routes
app.post('/api/auth/staff/otp/request', requestStaffLoginOTP);
app.post('/api/auth/staff/otp/verify', loginStaffWithOTP);

app.use('/api/expenses', expenseRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/blog', blogRouter);
app.use('/webhook', whatsappRouter);

export default app;
