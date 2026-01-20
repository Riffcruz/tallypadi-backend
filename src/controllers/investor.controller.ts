import { Request, Response } from 'express';
import { User } from '../models/user.model';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [totalRegistered, activeTycoon, activeOgaBoss, onTrial] = await Promise.all([
      // Registered users (Owners)
      User.countDocuments({ role: 'OWNER' }),
      
      // Active Tycoon users
      User.countDocuments({ role: 'OWNER', planType: 'TYCOON', subscriptionStatus: 'active' }),
      
      // Active Oga Boss users (Fixed: planType was missing in my thought process, corrected here)
      User.countDocuments({ role: 'OWNER', planType: 'OGA_BOSS', subscriptionStatus: 'active' }),
      
      // People on trial
      User.countDocuments({ role: 'OWNER', subscriptionStatus: 'trial' }),
    ]);

    res.json({
      success: true,
      stats: {
        registeredUsers: totalRegistered,
        activeTycoon,
        activeOgaBoss,
        onTrial
      }
    });
  } catch (error) {
    console.error('Investor Dashboard Error:', error);
    res.status(500).json({ error: 'Server Error' });
  }
};
