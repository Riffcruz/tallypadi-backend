import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { AdminSettings } from '../models/adminSettings.model';

// --- Security Helpers ---

/**
 * Validates that the input is a valid string and not an object.
 * Returns the trimmed string or null if invalid.
 */
const sanitizeString = (input: unknown): string | null => {
    if (typeof input !== 'string') return null;
    return input.trim();
};

const validateBoolean = (input: unknown): boolean | undefined => {
    if (typeof input === 'boolean') return input;
    return undefined;
};

const validateNumber = (input: unknown): number | undefined => {
    if (typeof input === 'number' && !isNaN(input)) return input;
    return undefined;
};

// --- Controller ---

export const updateSettings = async (req: Request, res: Response) => {
    try {
        const body = req.body || {};
        const responseData: any = {};

        // ---------------------------------------------------------
        // 1. Handle User-Specific Settings
        // ---------------------------------------------------------
        if (body.businessName !== undefined || body.settings !== undefined) {
            const user = await User.findOne();
            if (user) {
                if (body.businessName !== undefined) {
                    const safeName = sanitizeString(body.businessName);
                    if (safeName !== null && safeName.length <= 100) {
                         user.businessName = safeName;
                    }
                }

                if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) {
                    const userSettings = user.settings as any;
                    const inputSettings = body.settings;

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
        // 2. Handle Global Admin Settings
        // ---------------------------------------------------------
        if (
            body.whatsappUrl !== undefined || 
            body.autoSuspendOnJailbreak !== undefined || 
            body.maxMessageHistory !== undefined || 
            body.maxStaffAccounts !== undefined
        ) {
            // 🟢 DEBUG LOG: View schema paths in terminal
            console.log('DEBUG: Registered AdminSettings Schema Paths:', Object.keys(AdminSettings.schema.paths));

            let adminSettings = await AdminSettings.findOne();
            if (!adminSettings) {
                adminSettings = new AdminSettings({
                    security: { autoSuspendOnJailbreak: true, maxLoginAttempts: 5 },
                    limits: { maxMessageHistory: 5, maxStaffAccounts: 5 },
                    system: { maintenanceMode: false, allowNewRegistrations: true }
                });
            }

            // 🟢 Update WhatsApp URL (Relaxed Validation)
            if (body.whatsappUrl !== undefined) {
                const safeUrl = sanitizeString(body.whatsappUrl);
                if (safeUrl !== null) {
                    adminSettings.whatsappUrl = safeUrl;
                }
            }

            // Update Security
            if (body.autoSuspendOnJailbreak !== undefined) {
                const autoSuspend = validateBoolean(body.autoSuspendOnJailbreak);
                if (autoSuspend !== undefined) {
                    adminSettings.security.autoSuspendOnJailbreak = autoSuspend;
                }
            }

            // Update Limits
            if (body.maxMessageHistory !== undefined) {
                const hist = validateNumber(body.maxMessageHistory);
                if (hist !== undefined) {
                    adminSettings.limits.maxMessageHistory = hist;
                }
            }

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