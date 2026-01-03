import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { AdminSettings } from '../models/adminSettings.model';

// --- Security Helpers ---
const sanitizeString = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  return input.trim();
};

const validateBoolean = (input: unknown): boolean | undefined => {
  return typeof input === 'boolean' ? input : undefined;
};

// ✅ accepts number OR numeric string
const validateNumber = (input: unknown): number | undefined => {
  const n = typeof input === 'string' ? Number(input) : input;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

type AuthReq = Request & { user?: { id?: string; _id?: string } };

const isAdminRole = (role: unknown) => {
  const r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
};

export const updateSettings = async (req: AuthReq, res: Response) => {
  try {
    const body = req.body || {};
    const responseData: any = {};

    // ✅ Get the LOGGED-IN user
    const userId = req.user?.id || (req.user as any)?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Load user once (used for plan gating + admin role checks)
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ---------------------------------------------------------
    // 1) Handle User-Specific Settings (logged-in user)
    // ---------------------------------------------------------
    if (body.businessName !== undefined || body.shopName !== undefined || body.settings !== undefined) {
      const $set: any = {};

      // ✅ accept businessName OR shopName from frontend, and update BOTH
      const incomingName =
        body.businessName !== undefined
          ? body.businessName
          : body.shopName !== undefined
            ? body.shopName
            : undefined;

      if (incomingName !== undefined) {
        const safeName = sanitizeString(incomingName);
        if (safeName !== null && safeName.length <= 100) {
          $set['businessName'] = safeName;
          $set['shopName'] = safeName; // ✅ important (your UI uses shopName)
        } else if (safeName !== null && safeName.length > 100) {
          return res.status(400).json({ error: 'Business name too long (max 100 chars)' });
        }
      }

      if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) {
        const inputSettings = body.settings;

        if (inputSettings.closingTime !== undefined) {
          const safeTime = sanitizeString(inputSettings.closingTime);
          if (safeTime) $set['settings.closingTime'] = safeTime.slice(0, 40);
        }

        if (inputSettings.language !== undefined) {
          const safeLang = sanitizeString(inputSettings.language);
          if (safeLang) {
            $set['settings.language'] = safeLang.slice(0, 40);
            $set['settings.botLanguage'] = safeLang.slice(0, 40); // ✅ compatibility
          }
        }

        // ✅ Plan-gated feature
        if (inputSettings.pdfReportsEnabled !== undefined) {
          const isEnabled = validateBoolean(inputSettings.pdfReportsEnabled);
          if (isEnabled !== undefined) {
            if (String((user as any).planType || '').toUpperCase() === 'TYCOON') {
              $set['settings.pdfReportsEnabled'] = isEnabled;
            } else if (isEnabled === true) {
              return res.status(403).json({ error: 'PDF Reports are for Tycoon Plan only.' });
            } else {
              $set['settings.pdfReportsEnabled'] = false;
            }
          }
        }

        if (inputSettings.utcOffsetMinutes !== undefined) {
          const offset = validateNumber(inputSettings.utcOffsetMinutes);
          if (offset !== undefined) {
            // reasonable bounds: -14h to +14h
            if (offset < -14 * 60 || offset > 14 * 60) {
              return res.status(400).json({ error: 'utcOffsetMinutes out of range' });
            }
            $set['settings.utcOffsetMinutes'] = offset;
          }
        }
      }

      // ✅ Only update if we actually have fields to set
      if (Object.keys($set).length) {
        const updated = await User.findByIdAndUpdate(userId, { $set }, { new: true, runValidators: true }).lean();
        responseData.user = {
          businessName: (updated as any)?.businessName,
          shopName: (updated as any)?.shopName,
          settings: (updated as any)?.settings,
          planType: (updated as any)?.planType,
          subscriptionStatus: (updated as any)?.subscriptionStatus,
          trialEndsAt: (updated as any)?.trialEndsAt,
        };
      } else {
        responseData.user = {
          businessName: (user as any)?.businessName,
          shopName: (user as any)?.shopName,
          settings: (user as any)?.settings,
        };
      }
    }

    // ---------------------------------------------------------
    // 2) Handle Global Admin Settings (ADMIN ONLY - JWT + ROLE)
    // ---------------------------------------------------------
    const adminKeysUsed =
      body.whatsappUrl !== undefined ||
      body.autoSuspendOnJailbreak !== undefined ||
      body.maxMessageHistory !== undefined ||
      body.maxStaffAccounts !== undefined;

    if (adminKeysUsed) {
      // ✅ role check (NO header secret backdoor)
      if (!isAdminRole((user as any).role)) {
        return res.status(403).json({ error: 'Forbidden (admin only)' });
      }

      let adminSettings = await AdminSettings.findOne();
      if (!adminSettings) {
        adminSettings = new AdminSettings({
          security: { autoSuspendOnJailbreak: true, maxLoginAttempts: 5 },
          limits: { maxMessageHistory: 5, maxStaffAccounts: 5 },
          system: { maintenanceMode: false, allowNewRegistrations: true },
        });
      }

      if (body.whatsappUrl !== undefined) {
        const safeUrl = sanitizeString(body.whatsappUrl);
        if (safeUrl !== null) adminSettings.whatsappUrl = safeUrl.slice(0, 300);
      }

      if (body.autoSuspendOnJailbreak !== undefined) {
        const autoSuspend = validateBoolean(body.autoSuspendOnJailbreak);
        if (autoSuspend !== undefined) adminSettings.security.autoSuspendOnJailbreak = autoSuspend;
      }

      if (body.maxMessageHistory !== undefined) {
        const hist = validateNumber(body.maxMessageHistory);
        if (hist !== undefined) {
          if (hist < 0 || hist > 5000) return res.status(400).json({ error: 'maxMessageHistory out of range' });
          adminSettings.limits.maxMessageHistory = hist;
        }
      }

      if (body.maxStaffAccounts !== undefined) {
        const staff = validateNumber(body.maxStaffAccounts);
        if (staff !== undefined) {
          if (staff < 0 || staff > 100) return res.status(400).json({ error: 'maxStaffAccounts out of range' });
          adminSettings.limits.maxStaffAccounts = staff;
        }
      }

      await adminSettings.save();
      responseData.adminSettings = adminSettings;
    }

    return res.json({
      success: true,
      message: 'Settings updated successfully',
      ...responseData,
    });
  } catch (error: any) {
    console.error('Settings Update Error:', error?.stack || error);
    return res.status(500).json({ error: 'Server Error' });
  }
  
};

