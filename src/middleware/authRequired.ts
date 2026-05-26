import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';

type JwtPayload = {
  id?: string;
  _id?: string;
  userId?: string;
  ownerId?: string;
  role?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
};

export const authRequired = async (req: Request, res: Response, next: NextFunction) => {
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
    const decoded = jwt.verify(token, secret) as JwtPayload;
    const userId = decoded.id || decoded._id || decoded.userId || '';

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.user = {
      id: userId,
      role: decoded.role || 'OWNER',
      ownerId: decoded.ownerId ? String(decoded.ownerId) : undefined,
    };

    if (req.user.role === 'STAFF' && !req.user.ownerId) {
      const staff = await User.findById(userId).select('role ownerId').lean<{ role?: string; ownerId?: unknown } | null>();
      if (!staff) {
        return res.status(401).json({ error: 'User not found' });
      }

      req.user.role = staff.role || req.user.role;
      if (staff.ownerId) req.user.ownerId = String(staff.ownerId);
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
