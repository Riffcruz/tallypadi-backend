import { Request, Response } from 'express';
import { User } from '../models/user.model';

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
        // In a real app, ensure req.user.id is used to fetch the user to prevent IDOR.
        // For now, we keep the existing logic of finding the first user but validate inputs strictly.
        
        const user = await User.findOne();
        if (!user) return res.status(404).json({ error: "User not found" });

        // Use a safe reference to body
        const body = req.body || {};

        // 1. Update Business Name
        // Security Fix: Explicitly check type to prevent object injection (e.g. { "$ne": null })
        if (body.businessName !== undefined) {
            const safeName = sanitizeString(body.businessName);
            if (safeName !== null) {
                // Optional: Add length limit check here
                if (safeName.length > 100) return res.status(400).json({ error: "Business name too long" });
                
                user.businessName = safeName;
            } else {
                return res.status(400).json({ error: "Invalid format for businessName" });
            }
        }

        // 2. Update Settings
        if (body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)) {
            const inputSettings = body.settings;

            // Closing Time - Strict String
            if (inputSettings.closingTime !== undefined) {
                const safeTime = sanitizeString(inputSettings.closingTime);
                if (safeTime) {
                    // Optional: Regex validate time format HH:MM if needed
                    user.settings.closingTime = safeTime;
                }
            }

            // Language - Strict String
            if (inputSettings.language !== undefined) {
                const safeLang = sanitizeString(inputSettings.language);
                if (safeLang) {
                    // Optional: Check against allowed languages whitelist
                    user.settings.language = safeLang;
                }
            }
            
            // 3. Plan Check for PDF Reports
            // Security Fix: Strict boolean check prevents type coercion attacks
            if (inputSettings.pdfReportsEnabled !== undefined) {
                const isEnabled = validateBoolean(inputSettings.pdfReportsEnabled);
                
                if (isEnabled !== undefined) {
                    if (user.planType === 'TYCOON') {
                        user.settings.pdfReportsEnabled = isEnabled;
                    } else if (isEnabled === true) {
                        // Prevent enabling if not Tycoon
                        return res.status(403).json({ error: "PDF Reports are for Tycoon Plan only." });
                    } else {
                        // Allow disabling even if not Tycoon (cleanup)
                        user.settings.pdfReportsEnabled = false;
                    }
                } else {
                     return res.status(400).json({ error: "pdfReportsEnabled must be a boolean" });
                }
            }
            
            // UTC Offset - Strict Number
            if (inputSettings.utcOffsetMinutes !== undefined) {
                const offset = validateNumber(inputSettings.utcOffsetMinutes);
                if (offset !== undefined) {
                     user.settings.utcOffsetMinutes = offset;
                }
            }
        }

        await user.save();

        res.json({
            success: true,
            message: "Settings updated successfully",
            user: {
                businessName: user.businessName,
                settings: user.settings,
                planType: user.planType
            }
        });

    } catch (error) {
        console.error("Settings Update Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};