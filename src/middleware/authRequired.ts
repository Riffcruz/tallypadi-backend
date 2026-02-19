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
  let token = '';

  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) {
    token = auth.slice(7).trim();
  } else if (req.query?.token) {
    // allow token in query param for file downloads/images
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const secret = process.env.JWT_SECRET || 'supersecret_fallback_key_123';

  try {
    const decoded = jwt.verify(token, secret) as any;

    if (!decoded?.id && !decoded?._id && !decoded?.userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.user = { id: decoded.id || decoded._id || decoded.userId, role: decoded.role || 'OWNER' };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
