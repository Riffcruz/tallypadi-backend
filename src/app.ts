import express from 'express';
import cors from 'cors';
import { json } from 'express';
import whatsappRouter from './routes/whatsapp.routes';
import { loginUser } from './controllers/auth.controller'; // Add this

const app = express();

app.use(cors());
app.use(json());

app.get('/', (_req, res) => {
  res.send('InventoryBot API is running');
});

app.post('/api/login', loginUser);
app.use('/webhook', whatsappRouter);

export default app;
