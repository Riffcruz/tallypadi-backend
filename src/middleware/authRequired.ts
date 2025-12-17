import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authRequired = (req: any, res: Response, next: NextFunction) => {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7);
  const secret = process.env.JWT_SECRET;

  try {
    const decoded: any = jwt.verify(token, secret as string); // ✅ respects exp automatically
    const userId = decoded?.id; // ✅ YOUR TOKEN USES id

    if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

    req.user = { id: userId };
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
