import mongoose from 'mongoose';
import { Request, Response } from 'express';
import axios from 'axios';
import { User, IUser } from '../models/user.model';
import { Invoice } from '../models/invoice.model';
import { Transaction } from '../models/transaction.model';
import { DailyStats } from '../models/dailyStats.model';
import { deductStockForItems } from '../services/transaction.service';
import { generateInvoicePdf } from '../services/invoice.pdf.service';
import { toUserLocalDate } from '../utils/dates';
import { isSubActive, isTycoon } from '../utils/permissions';
import { undoSaleById } from '../services/undo.service';

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
        const validItems = items.map((i: { qty?: string | number; unitPrice?: string | number; name?: string; unit?: string }) => {
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

        // Generate PDF URL (Dynamic)
        const pdfUrl = `/api/invoices/${inv._id}/pdf`; 

        res.status(201).json({ success: true, invoice: inv, pdfUrl });

    } catch (error: unknown) {
        console.error("Create Invoice Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
};

// Helper to determine Shop ID (Owner's ID)
const getShopId = (user: { _id?: unknown, role?: string, ownerId?: unknown } | null): string => {
    if (!user) return '';
    if (user.role === 'STAFF' && user.ownerId) return String(user.ownerId);
    return String(user._id);
};

export const getInvoicePdf = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const inv = await Invoice.findById(id).populate('user');
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });

        const viewer = await User.findById(userId);
        if (!viewer) return res.status(401).json({ error: 'User not found' });

        // Security Check
        const creator = inv.user as any;
        const creatorShopId = getShopId(creator);
        const viewerShopId = getShopId(viewer as unknown as { _id?: unknown, role?: string, ownerId?: unknown });

        if (creatorShopId !== viewerShopId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Resolve Owner/Business Name
        let businessName = 'My Shop';
        let countryCode = 'NG';

        if (creator) {
             if (creator.role === 'STAFF' && creator.ownerId) {
                  const owner = await User.findById(creator.ownerId);
                  businessName = owner?.businessName || 'My Shop';
                  countryCode = owner?.countryCode || 'NG';
             } else {
                  businessName = creator.businessName || 'My Shop';
                  countryCode = creator.countryCode || 'NG';
             }
        }

        const { format } = req.query;

        let logoBuffer: Buffer | undefined;
        let logoUrl = creator?.settings?.logoUrl;
        let logoWidth = creator?.settings?.logoWidth || 250;
        let logoHeight = creator?.settings?.logoHeight || 60;
        
        if (creator && creator.role === 'STAFF' && creator.ownerId) {
             const owner = await User.findById(creator.ownerId).lean();
             logoUrl = (owner as any)?.settings?.logoUrl;
             logoWidth = (owner as any)?.settings?.logoWidth || 250;
             logoHeight = (owner as any)?.settings?.logoHeight || 60;
        }

        if (logoUrl) {
             try {
                  const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
                  logoBuffer = Buffer.from(response.data);
             } catch (err) {
                  console.warn('[Invoice PDF] Failed to fetch brand logo:', err);
             }
        }

        const pdfBuffer = await generateInvoicePdf(
            inv as Parameters<typeof generateInvoicePdf>[0],
            businessName,
            countryCode,
            logoBuffer,
            format as 'A4' | 'thermal',
            creator?.name || 'Staff',
            logoWidth,
            logoHeight
        );

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="invoice-${inv.invoiceNumber}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);

    } catch (error: any) {
        console.error("Get Invoice PDF Error:", error);
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

        const query: Record<string, unknown> = { user: { $in: shopUserIds } };
        
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

    } catch (error: unknown) {
        console.error("Get Invoices Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const getInvoice = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const inv = await Invoice.findById(id).populate('user');
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });

        const viewer = await User.findById(userId);
        if (!viewer) return res.status(401).json({ error: 'User not found' });

        // Security Check
        const creatorShopId = getShopId(inv.user as { _id?: unknown, role?: string, ownerId?: unknown });
        const viewerShopId = getShopId(viewer as unknown as { _id?: unknown, role?: string, ownerId?: unknown });

        if (creatorShopId !== viewerShopId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ success: true, invoice: inv });

    } catch (error: unknown) {
        res.status(500).json({ error: 'Server Error' });
    }
}

export const updateInvoiceStatus = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        const { status } = req.body; // PAID or CANCELLED

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        
        const inv = await Invoice.findById(id).populate('user');
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Security Check
        const creatorShopId = getShopId(inv.user as { _id?: unknown, role?: string, ownerId?: unknown });
        const viewerShopId = getShopId(user as unknown as { _id?: unknown, role?: string, ownerId?: unknown });

        if (creatorShopId !== viewerShopId) {
             return res.status(403).json({ error: 'Access denied' });
        }

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

             // Deduct stock
             const shopId = (user?.role === 'STAFF' && user.ownerId) ? user.ownerId : userId;
             const shopIdStr = String(shopId) as unknown as mongoose.Types.ObjectId;
             await deductStockForItems(shopIdStr, inv.items.map(i => ({ name: i.name, qty: i.qty })));

             return res.json({ success: true, invoice: inv });
        }

        return res.status(400).json({ error: 'Invalid status' });

    } catch (error: unknown) {
        console.error("Update Invoice Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const deleteInvoice = async (req: AuthReq, res: Response) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        
        const inv = await Invoice.findById(id).populate('user');
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });

        // Security Check
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const creatorShopId = getShopId(inv.user as { _id?: unknown, role?: string, ownerId?: unknown });
        const viewerShopId = getShopId(user as unknown as { _id?: unknown, role?: string, ownerId?: unknown });

        if (creatorShopId !== viewerShopId) {
             return res.status(403).json({ error: 'Access denied' });
        }

        // Handle PAID invoice deletion (Undo Sale)
        if (inv.status === 'PAID') {
            const tx = await Transaction.findOne({
                user: userId,
                messageId: `web_inv_${inv._id}_paid`
            });

            if (tx) {
                // Undo the sale (restores stock, reverses stats)
                await undoSaleById(String(user._id) as unknown as mongoose.Types.ObjectId, String(tx._id), 'web_invoice_deletion');
            }
        }

        await Invoice.deleteOne({ _id: id });
        res.json({ success: true, message: 'Invoice deleted' });

    } catch (error: unknown) {
         console.error("Delete Invoice Error:", error);
         res.status(500).json({ error: 'Server Error' });
    }
};
