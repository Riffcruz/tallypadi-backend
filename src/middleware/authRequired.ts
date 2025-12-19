import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

type JwtPayload = {
  id: string;
  role?: 'OWNER' | 'STAFF';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
};

export const authRequired = (req: any, res: Response, next: NextFunction) => {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7).trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('❌ JWT_SECRET missing (server misconfigured)');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      // If you set these in loginUser, keep them here too:
      issuer: process.env.JWT_ISSUER || 'tallypadi',
      audience: process.env.JWT_AUDIENCE || 'tallypadi-web',
    }) as JwtPayload;

    if (!decoded?.id) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.user = { id: decoded.id, role: decoded.role || 'OWNER' };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
