import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwt';

export const supportAgentAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7);

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { agentId: string; username: string; role: string };
    if (!decoded.agentId) return res.status(401).json({ error: 'Invalid token payload' });

    (req as Request & { agent: { id: string; username: string; role: string } }).agent = { 
      id: decoded.agentId, 
      username: decoded.username, 
      role: decoded.role 
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
