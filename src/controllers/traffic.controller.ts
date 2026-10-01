import { Request, Response } from 'express';
import { z } from 'zod';
import { TrafficVisit } from '../models/trafficVisit.model';

const trafficSchema = z.object({
  source: z.enum(['chatgpt']),
  path: z.string().trim().min(1).max(300),
}).strict();

export const recordPublicTraffic = async (req: Request, res: Response) => {
  try {
    const parsed = trafficSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid traffic event' });

    const safePath = parsed.data.path.startsWith('/') ? parsed.data.path.split('?')[0] : '/';
    const date = new Date().toISOString().slice(0, 10);

    await TrafficVisit.updateOne(
      { date, source: parsed.data.source, path: safePath },
      { $inc: { count: 1 }, $set: { lastVisitedAt: new Date() } },
      { upsert: true }
    );

    return res.status(202).json({ accepted: true });
  } catch (error) {
    console.error('Traffic tracking error:', error);
    return res.status(202).json({ accepted: false });
  }
};
