import { NextFunction, Request, Response } from 'express';
import { User } from '../models/user.model';

export type StaffPermission =
  | 'canViewDashboard'
  | 'canManageInventory'
  | 'canViewSalesHistory'
  | 'canViewReports'
  | 'canManageCustomers'
  | 'canViewSettings';

export const STAFF_PERMISSION_DEFAULTS: Record<StaffPermission, boolean> = {
  canViewDashboard: false,
  canManageInventory: true,
  canViewSalesHistory: false,
  canViewReports: false,
  canManageCustomers: true,
  canViewSettings: false,
};

export const getStaffPermission = async (req: Request, permission: StaffPermission) => {
  const userId = req.user?.id;
  if (!userId) return { authenticated: false, allowed: false, isStaff: false };

  const user = await User.findById(userId).select('role ownerId').lean();
  if (!user) return { authenticated: false, allowed: false, isStaff: false };
  if (String(user.role).toUpperCase() !== 'STAFF') return { authenticated: true, allowed: true, isStaff: false };
  if (!user.ownerId) return { authenticated: true, allowed: false, isStaff: true };

  const owner = await User.findById(user.ownerId).select('settings.staffPermissions').lean();
  const configured = owner?.settings?.staffPermissions?.[permission];
  return {
    authenticated: true,
    allowed: typeof configured === 'boolean' ? configured : STAFF_PERMISSION_DEFAULTS[permission],
    isStaff: true,
    ownerId: String(user.ownerId),
  };
};

export const requireStaffPermission = (permission: StaffPermission) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const access = await getStaffPermission(req, permission);
    if (!access.authenticated) return res.status(401).json({ error: 'Unauthorized' });
    if (!access.allowed) return res.status(403).json({ error: 'Staff permission required', permission });
    return next();
  } catch (error) {
    console.error('Staff permission check failed:', error);
    return res.status(500).json({ error: 'Could not verify staff permission' });
  }
};

export const requireOwnerAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user?.id).select('role').lean();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (String(user.role).toUpperCase() === 'STAFF') return res.status(403).json({ error: 'Only the shop owner can perform this action' });
    return next();
  } catch (error) {
    console.error('Owner access check failed:', error);
    return res.status(500).json({ error: 'Could not verify account access' });
  }
};
