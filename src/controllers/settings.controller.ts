import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { AdminSettings } from '../models/adminSettings.model';
import { queueMarketplaceOwnerRefresh } from '../services/queue.service';

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
    let shouldRefreshMarketplaceOwner = false;

    // ✅ Get the LOGGED-IN user
    const userId = req.user?.id || (req.user as any)?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Load user once (used for plan gating + admin role checks)
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ Helper: entitlement check (Tycoon + active/trial + not expired)
    const isPdfAllowed = (() => {
      const plan = String((user as any)?.planType || '').toUpperCase();
      const status = String((user as any)?.subscriptionStatus || '').toLowerCase();

      const isTycoon = plan === 'TYCOON';
      if (status === 'active') return isTycoon;

      const isActiveLike = status === 'trial';

      const endsAtRaw = (user as any)?.trialEndsAt;
      if (!endsAtRaw) return isTycoon && isActiveLike; // if you allow no-expiry admins etc

      const endsAt = new Date(endsAtRaw);
      const notExpired = Number.isFinite(endsAt.getTime()) && endsAt.getTime() > Date.now();

      return isTycoon && isActiveLike && notExpired;
    })();

    // ✅ HARD ENFORCEMENT: if expired/not allowed, force PDF OFF (even if user enabled it earlier)
    if ((user as any)?.settings?.pdfReportsEnabled === true && !isPdfAllowed) {
      await User.updateOne({ _id: userId }, { $set: { 'settings.pdfReportsEnabled': false } });
      (user as any).settings = (user as any).settings || {};
      (user as any).settings.pdfReportsEnabled = false;
    }

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
          shouldRefreshMarketplaceOwner = true;
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

        // ✅ Plan-gated feature (NOW ALSO EXPIRY-GATED)
        if (inputSettings.pdfReportsEnabled !== undefined) {
          const isEnabled = validateBoolean(inputSettings.pdfReportsEnabled);

          if (isEnabled !== undefined) {
            if (isEnabled === true) {
              // Only allow enabling if entitlement is valid
              if (!isPdfAllowed) {
                return res.status(403).json({
                  error: 'PDF Reports are for active Tycoon Plan only (not expired).',
                });
              }
              $set['settings.pdfReportsEnabled'] = true;
            } else {
              // Allow disabling always
              $set['settings.pdfReportsEnabled'] = false;
            }
          }
        }

        if (inputSettings.staffTransactionReport !== undefined) {
          const isEnabled = validateBoolean(inputSettings.staffTransactionReport);
          if (isEnabled !== undefined) {
            $set['settings.staffTransactionReport'] = isEnabled;
          }
        }

        if (inputSettings.smartMatchingEnabled !== undefined) {
          const isEnabled = validateBoolean(inputSettings.smartMatchingEnabled);
          if (isEnabled !== undefined) {
            $set['settings.smartMatchingEnabled'] = isEnabled;
          }
        }

        // ✅ Location Settings Update
        if (inputSettings.location && typeof inputSettings.location === 'object') {
          const loc = inputSettings.location;
          if (loc.country !== undefined) $set['settings.location.country'] = String(loc.country).slice(0, 100);
          if (loc.state !== undefined) $set['settings.location.state'] = String(loc.state).slice(0, 100);
          if (loc.city !== undefined) $set['settings.location.city'] = String(loc.city).slice(0, 100);
          if (loc.address !== undefined) $set['settings.location.address'] = String(loc.address).slice(0, 300);
          shouldRefreshMarketplaceOwner = true;
        }

        // ✅ Staff Permissions Update
        if (inputSettings.staffPermissions && typeof inputSettings.staffPermissions === 'object') {
           const sp = inputSettings.staffPermissions;
           const allowedKeys = [
             'canViewDashboard',
             'canManageInventory',
             'canViewSalesHistory',
             'canViewReports',
             'canManageCustomers',
             'canViewSettings'
           ];

           for (const key of allowedKeys) {
             if (sp[key] !== undefined) {
               const val = validateBoolean(sp[key]);
               if (val !== undefined) {
                 $set[`settings.staffPermissions.${key}`] = val;
               }
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

        if (inputSettings.currencyCode !== undefined) {
          const safeCurrencyCode = sanitizeString(inputSettings.currencyCode);
          if (safeCurrencyCode) {
            $set['settings.currencyCode'] = safeCurrencyCode.toUpperCase().slice(0, 5);
            shouldRefreshMarketplaceOwner = true;
          }
        }

        // ✅ Royalty Program Update
        if (inputSettings.royalty && typeof inputSettings.royalty === 'object') {
           const ryl = inputSettings.royalty;
           if (ryl.enabled !== undefined) {
             const en = validateBoolean(ryl.enabled);
             if (en !== undefined) $set['settings.royalty.enabled'] = en;
           }
           if (ryl.pointsPerPurchase !== undefined) {
             const pts = validateNumber(ryl.pointsPerPurchase);
             if (pts !== undefined && pts >= 0) $set['settings.royalty.pointsPerPurchase'] = pts;
           }
           if (ryl.currencyValuePerPoint !== undefined) {
             const val = validateNumber(ryl.currencyValuePerPoint);
             if (val !== undefined && val >= 0) $set['settings.royalty.currencyValuePerPoint'] = val;
           }
           if (ryl.redemptionValuePerPoint !== undefined) {
             const redVal = validateNumber(ryl.redemptionValuePerPoint);
             if (redVal !== undefined && redVal >= 0) $set['settings.royalty.redemptionValuePerPoint'] = redVal;
           }
        }
      }

      // ✅ Bank Details Update
      if (body.bankDetails && typeof body.bankDetails === 'object') {
          const bd = body.bankDetails;
          if (bd.bankName !== undefined) $set['bankDetails.bankName'] = sanitizeString(bd.bankName);
          if (bd.accountNumber !== undefined) $set['bankDetails.accountNumber'] = sanitizeString(bd.accountNumber);
          if (bd.accountName !== undefined) $set['bankDetails.accountName'] = sanitizeString(bd.accountName);
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
        if (shouldRefreshMarketplaceOwner) {
          queueMarketplaceOwnerRefresh(userId, 'settings-update').catch(() => undefined);
        }
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

