import express from 'express';
import cors from 'cors';
import { json } from 'express';
import whatsappRouter from './routes/whatsapp.routes';
import { loginUser, registerUser } from './controllers/auth.controller';

const app = express();

app.use(cors());
app.use(json());

app.get('/', (_req, res) => {
  res.send('InventoryBot API is running');
});

app.post('/api/login', loginUser);
app.post('/api/register', registerUser);
app.use('/webhook', whatsappRouter);

export default app;
