import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import mongoose from 'mongoose';

type AnyReq = Request & {
  user?: { id?: string };
};

const isValidObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

export const verifyInvestor = async (req: AnyReq, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.user?.id || '');
    if (!userId || !isValidObjectId(userId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(userId).lean();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if ((user as any).role !== 'INVESTOR') {
      return res.status(403).json({ error: 'Access Denied: Investor Only' });
    }

    return next();
  } catch (e) {
    console.error('verifyInvestor error:', e);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
