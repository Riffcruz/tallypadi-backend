import { Request, Response } from 'express';
import { User, IUser } from '../models/user.model';
import { Invoice } from '../models/invoice.model';
import { Transaction } from '../models/transaction.model';
import { DailyStats } from '../models/dailyStats.model';
import { generateInvoicePdf } from '../services/invoice.pdf.service';
import { toUserLocalDate } from '../utils/dates';
import { isSubActive, isTycoon } from '../utils/permissions';

type AuthReq = Request & { user?: { id?: string } };

// Helper to check permissions
const checkTycoonAndRole = async (userId: string): Promise<{ allowed: boolean; error?: string; owner?: IUser; actor?: IUser }> => {
    const user = await User.findById(userId);
    if (!user) return { allowed: false, error: 'User not found' };

    let owner = user;
    if (user.role === 'STAFF') {
        if (!user.ownerId) return { allowed: false, error: 'Staff not linked to owner' };
        owner = (await User.findById(user.ownerId)) || user;
    }

    if (!isSubActive(owner)) {
        return { allowed: false, error: 'Subscription expired. Cannot generate invoices.' };
    }

    if (!isTycoon(owner)) return { allowed: false, error: 'Invoices are available on Tycoon plan only' };

    return { allowed: true, owner, actor: user };
};

export const createInvoice = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const perm = await checkTycoonAndRole(userId);
        if (!perm.allowed || !perm.owner || !perm.actor) {
            return res.status(403).json({ error: perm.error || 'Access denied' });
        }
        const { owner, actor } = perm;

        const { customerName, items, description, bankDetailsOverride } = req.body;
        if (!customerName || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Missing customer name or items' });
        }

        // Validate items
        let totalAmount = 0;
        const validItems = items.map((i: any) => {
            const qty = Number(i.qty || 0);
            const price = Number(i.unitPrice || 0);
            const total = qty * price;
            totalAmount += total;
            return {
                name: String(i.name),
                qty,
                unitPrice: price,
                total,
                unit: i.unit
            };
        });

        const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
        
        // Use provided bank details or owner's saved ones
        const bankDetailsSnapshot = bankDetailsOverride || owner.bankDetails;
        
        if (!bankDetailsSnapshot?.accountNumber) {
             return res.status(400).json({ error: 'No bank details found. Please update settings or provide them.' });
        }

        const inv = await Invoice.create({
            user: actor._id, // Created by
            customerName,
            items: validItems,
            totalAmount,
            invoiceNumber,
            status: 'GENERATED',
            bankDetailsSnapshot,
            description: description || 'Goods/Services'
        });

        // Generate PDF
        const pdfFile = await generateInvoicePdf(inv, owner.businessName || 'My Shop', owner.countryCode);
        const pdfUrl = `/reports/${pdfFile}`; // Relative path for frontend

        res.status(201).json({ success: true, invoice: inv, pdfUrl });

    } catch (error: any) {
        console.error("Create Invoice Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const getInvoices = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Strategy: Find all users in this shop (Owner + Staff)
        let ownerId = user._id;
        if (user.role === 'STAFF' && user.ownerId) {
             ownerId = user.ownerId;
        }

        // Find all users belonging to this owner
        const shopUserIds = await User.find({ $or: [{ _id: ownerId }, { ownerId: ownerId }] }).distinct('_id');

        const { page = 1, limit = 20, search } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query: any = { user: { $in: shopUserIds } };
        
        if (search) {
            query.$or = [
                { customerName: { $regex: search, $options: 'i' } },
                { invoiceNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const invoices = await Invoice.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();

        const total = await Invoice.countDocuments(query);

        res.json({ success: true, data: invoices, total, page: Number(page) });

    } catch (error: any) {
        console.error("Get Invoices Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const getInvoice = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const inv = await Invoice.findById(id).lean();
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });

        res.json({ success: true, invoice: inv });

    } catch (error: any) {
        res.status(500).json({ error: 'Server Error' });
    }
}

export const updateInvoiceStatus = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const { status } = req.body; // PAID or CANCELLED

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        
        const inv = await Invoice.findById(id);
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });

        const user = await User.findById(userId);

        if (status === 'CANCELLED') {
             inv.status = 'CANCELLED';
             await inv.save();
             return res.json({ success: true, invoice: inv });
        }

        if (status === 'PAID') {
             if (inv.status === 'PAID') return res.json({ success: true, invoice: inv }); // already paid

             inv.status = 'PAID';
             await inv.save();

             // Record Sale
             const offset = user?.settings?.utcOffsetMinutes ?? 60;
             const localDate = toUserLocalDate(new Date(), offset);
             const todayString = localDate.toISOString().split('T')[0];

             await Transaction.create({
                 user: userId, // Actor records the sale
                 type: 'SALE',
                 paymentStatus: 'PAID',
                 items: inv.items.map(i => ({
                     name: i.name,
                     qty: i.qty,
                     unit: i.unit || 'pcs',
                     unitPrice: i.unitPrice,
                     total: i.total
                 })),
                 totalMoney: inv.totalAmount,
                 amountPaid: inv.totalAmount,
                 balance: 0,
                 customerName: inv.customerName,
                 date: todayString,
                 timestamp: new Date(),
                 messageId: `web_inv_${inv._id}_paid`, 
             });

             await DailyStats.findOneAndUpdate(
                 { user: userId, date: todayString },
                 { $inc: { totalRevenue: inv.totalAmount, totalTransactions: 1 } },
                 { upsert: true }
             );

             return res.json({ success: true, invoice: inv });
        }

        return res.status(400).json({ error: 'Invalid status' });

    } catch (error: any) {
        console.error("Update Invoice Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const deleteInvoice = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        
        const inv = await Invoice.findById(id);
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });

        if (inv.status === 'PAID') {
            return res.status(400).json({ error: 'Cannot delete a paid invoice. Undo the sale first (if needed).' });
        }

        await Invoice.deleteOne({ _id: id });
        res.json({ success: true, message: 'Invoice deleted' });

    } catch (error: any) {
         console.error("Delete Invoice Error:", error);
         res.status(500).json({ error: 'Server Error' });
    }
};
