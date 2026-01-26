import express from 'express';
import cors from 'cors';
import { json } from 'express';
import whatsappRouter from './routes/whatsapp.routes';
import {
  loginUser,
  registerUser,
  requestStaffLoginOTP,
  loginStaffWithOTP
} from './controllers/auth.controller';

const app = express();

app.use(cors());
app.use(json());

app.get('/', (_req, res) => {
  res.send('InventoryBot API is running');
});

// Auth Routes
app.post('/api/login', loginUser);
app.post('/api/register', registerUser);

// Staff OTP Routes
app.post('/api/auth/staff/otp/request', requestStaffLoginOTP);
app.post('/api/auth/staff/otp/verify', loginStaffWithOTP);

app.use('/webhook', whatsappRouter);

export default app;
