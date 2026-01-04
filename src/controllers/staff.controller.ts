import { Request, Response } from 'express';
import { User } from '../models/user.model';
import { sendWhatsAppText } from '../services/whatsapp.service';
import { env } from '../config/env';

// --- Helpers ---
const sanitizeString = (input: unknown) => typeof input === 'string' ? input.trim() : null;

// GET /api/staff
export const getStaff = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const staffMembers = await User.find({ ownerId: userId });

        res.json(staffMembers.map(s => ({
            id: s._id,
            phoneNumber: s.phoneNumber,
            name: s.name,
            dateAdded: s.createdAt
        })));

    } catch (error) {
        console.error("Get Staff Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// POST /api/staff
export const addStaff = async (req: Request, res: Response) => {
    try {
        const { phoneNumber } = req.body;
        const safePhone = sanitizeString(phoneNumber);
        const userId = (req as any).user?.id;

        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        if (!safePhone) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        // 1. Identify Owner
        const owner = await User.findById(userId);
        if (!owner) return res.status(404).json({ error: "Owner account not found" });

        // 2. CHECK PLAN: Tycoon Only
        if (owner.planType !== 'TYCOON') {
            return res.status(403).json({ error: "Staff accounts are for Tycoon Plan users only." });
        }

        // 3. Check Staff Limit (Max 5)
        const staffCount = await User.countDocuments({ ownerId: owner._id });
        if (staffCount >= 5) {
            return res.status(403).json({ error: "Maximum staff limit (5) reached." });
        }

        // 4. Check if user already exists
        const existingStaff = await User.findOne({ phoneNumber: safePhone });
        if (existingStaff) {
            return res.status(400).json({ error: "This user is already registered on Tallypadi." });
        }

        // 5. Create Staff (Mirroring WhatsApp Logic + Inheriting Settings)
        const newStaff = await User.create({
            phoneNumber: safePhone,
            role: 'STAFF',
            ownerId: owner._id, // Link to Owner
            planType: 'TYCOON', // Inherit Plan features
            registrationStage: 'COMPLETED', // Skip setup steps
            businessName: owner.businessName, // Inherit Shop Name
            settings: owner.settings // Inherit Closing Time/Language/PDF preferences
        });

        // 6. Notify Staff via WhatsApp with Bot Link
        try {
            const ownerName = owner.businessName || owner.phoneNumber;
            const botNumber = env.whatsappPhoneNumberId; // Ensure this is set in .env
            // Construct a wa.me link that pre-fills a message
            const botLink = `https://wa.me/${botNumber}?text=Hi`; 
            
            const inviteMsg = `🔔 *Invitation to Join Tallypadi*\n\nYou have been added as a staff member by *${ownerName}*.\n\nClick here to start recording sales:\n👉 ${botLink}\n\nType "Help" to get started.`;
            
            await sendWhatsAppText(newStaff.phoneNumber, inviteMsg);
            console.log(`✅ Staff invite sent to ${newStaff.phoneNumber}`);
        } catch (e) {
            console.warn("Failed to send WhatsApp invite to staff:", e);
            // We don't fail the request if message fails, just log it
        }

        // 7. Response
        res.json({
            success: true,
            message: "Staff added successfully",
            staff: {
                id: newStaff._id,
                phoneNumber: newStaff.phoneNumber,
                name: newStaff.name,
                dateAdded: newStaff.createdAt
            }
        });

    } catch (error) {
        console.error("Add Staff Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// DELETE /api/staff/:id
export const removeStaff = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user?.id;
        
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const owner = await User.findById(userId);
        if (!owner) return res.status(401).json({ error: "Unauthorized" });

        const staff = await User.findOne({ _id: id, ownerId: owner._id });

        if (!staff) {
            return res.status(404).json({ error: "Staff member not found or does not belong to you." });
        }

        await User.deleteOne({ _id: id });

        // Optional: Notify staff they've been removed
        try {
             await sendWhatsAppText(staff.phoneNumber, `⚠️ You have been removed as a staff member from ${owner.businessName}.`);
        } catch (e) {}

        res.json({ success: true, message: "Staff removed successfully" });

    } catch (error) {
        console.error("Remove Staff Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};