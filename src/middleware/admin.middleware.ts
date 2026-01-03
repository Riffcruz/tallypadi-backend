import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/user.model';

type AnyReq = Request & {
  user?: { id?: string };
  admin?: any;
};

const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

const isAdminRole = (role: any) => {
  const r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
};

export const verifyAdmin = async (req: AnyReq, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.user?.id || '');
    if (!userId || !isValidObjectId(userId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const me = await User.findById(userId).lean();
    if (!me) return res.status(401).json({ error: 'Unauthorized' });

    if (!isAdminRole((me as any).role)) {
      return res.status(403).json({ error: 'Access Denied: Admin Only' });
    }

    req.admin = me;
    return next();
  } catch (e) {
    console.error('verifyAdmin error:', e);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
