import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { AdminSettings } from '../models/adminSettings.model';

// --- Security Helpers ---

/**
 * Validates that the input is a valid string and not an object (prevents NoSQL injection payloads).
 * Returns the trimmed string or null if invalid.
 */
const sanitizeString = (input: unknown): string | null => {
    if (typeof input !== 'string') return null;
    return input.trim();
};

/**
 * Strictly checks for boolean type.
 * Prevents "truthy" strings or numbers from bypassing logic.
 */
const validateBoolean = (input: unknown): boolean | undefined => {
    if (typeof input === 'boolean') return input;
    return undefined;
};

/**
 * strictly checks for number type.
 */
const validateNumber = (input: unknown): number | undefined => {
    if (typeof input === 'number' && !isNaN(input)) return input;
    return undefined;
};

// --- Controller ---

export const updateSettings = async (req: Request, res: Response) => {
    try {
        // Use a safe reference to body
        const body = req.body || {};
        const responseData: any = {};

        // ---------------------------------------------------------
        // 1. Handle User-Specific Settings (Business Name, User Prefs)
        // ---------------------------------------------------------
        // Only run this if user-related fields are present to save DB calls
        if (body.businessName !== undefined || body.settings !== undefined) {
            const user = await User.findOne();
            if (user) {
                // Update Business Name
                if (body.businessName !== undefined) {
                    const safeName = sanitizeString(body.businessName);
                    if (safeName !== null) {
                        if (safeName.length <= 100) {
                             user.businessName = safeName;
                        } else {
                            return res.status(400).json({ error: "Business name too long" });
                        }
                    }
                }

                // Update User Settings Object
                if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) {
                    const inputSettings = body.settings;
                    
                    // Helper to safely access user.settings even if it's strict
                    const userSettings = user.settings as any;

                    if (inputSettings.closingTime !== undefined) {
                        const safeTime = sanitizeString(inputSettings.closingTime);
                        if (safeTime) userSettings.closingTime = safeTime;
                    }

                    if (inputSettings.language !== undefined) {
                        const safeLang = sanitizeString(inputSettings.language);
                        if (safeLang) userSettings.language = safeLang;
                    }
                    
                    if (inputSettings.pdfReportsEnabled !== undefined) {
                        const isEnabled = validateBoolean(inputSettings.pdfReportsEnabled);
                        if (isEnabled !== undefined) {
                            if (user.planType === 'TYCOON') {
                                userSettings.pdfReportsEnabled = isEnabled;
                            } else if (isEnabled === true) {
                                return res.status(403).json({ error: "PDF Reports are for Tycoon Plan only." });
                            } else {
                                userSettings.pdfReportsEnabled = false;
                            }
                        }
                    }
                    
                    if (inputSettings.utcOffsetMinutes !== undefined) {
                        const offset = validateNumber(inputSettings.utcOffsetMinutes);
                        if (offset !== undefined) userSettings.utcOffsetMinutes = offset;
                    }
                }
                
                user.markModified('settings');
                await user.save();
                responseData.user = { businessName: user.businessName, settings: user.settings };
            }
        }

        // ---------------------------------------------------------
        // 2. Handle Global Admin Settings (Security, Limits, WhatsApp)
        // ---------------------------------------------------------
        // Check if any admin fields are present
        if (
            body.whatsappUrl !== undefined || 
            body.autoSuspendOnJailbreak !== undefined || 
            body.maxMessageHistory !== undefined || 
            body.maxStaffAccounts !== undefined
        ) {
            // Fetch existing admin settings or create new document
            let adminSettings = await AdminSettings.findOne();
            if (!adminSettings) {
                adminSettings = new AdminSettings({
                    security: { autoSuspendOnJailbreak: true, maxLoginAttempts: 5 },
                    limits: { maxMessageHistory: 5, maxStaffAccounts: 5 },
                    system: { maintenanceMode: false, allowNewRegistrations: true }
                });
            }

            // Update WhatsApp URL
            // Cleaned up: Removed `as any` cast since interface now supports it
            if (body.whatsappUrl !== undefined) {
                const safeUrl = sanitizeString(body.whatsappUrl);
                if (safeUrl !== null) {
                    if (safeUrl.length === 0 || safeUrl.startsWith('http') || safeUrl.startsWith('wa.me')) {
                        adminSettings.whatsappUrl = safeUrl;
                    } else {
                        return res.status(400).json({ error: "Invalid format for WhatsApp URL" });
                    }
                }
            }

            // Update Security: Auto Suspend
            if (body.autoSuspendOnJailbreak !== undefined) {
                const autoSuspend = validateBoolean(body.autoSuspendOnJailbreak);
                if (autoSuspend !== undefined) {
                    adminSettings.security.autoSuspendOnJailbreak = autoSuspend;
                }
            }

            // Update Limits: Max Message History
            if (body.maxMessageHistory !== undefined) {
                const hist = validateNumber(body.maxMessageHistory);
                if (hist !== undefined) {
                    adminSettings.limits.maxMessageHistory = hist;
                }
            }

            // Update Limits: Max Staff Accounts
            if (body.maxStaffAccounts !== undefined) {
                const staff = validateNumber(body.maxStaffAccounts);
                if (staff !== undefined) {
                    adminSettings.limits.maxStaffAccounts = staff;
                }
            }

            await adminSettings.save();
            responseData.adminSettings = adminSettings;
        }

        res.json({
            success: true,
            message: "Settings updated successfully",
            ...responseData
        });

    } catch (error) {
        console.error("Settings Update Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};