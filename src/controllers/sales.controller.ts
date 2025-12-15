import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import PDFDocument from 'pdfkit';

// --- Helpers ---
const validateNumber = (input: unknown) => (typeof input === 'number' && !isNaN(input)) ? input : undefined;

// Helper to get current date string "YYYY-MM-DD"
const getCurrentDateString = () => new Date().toISOString().split('T')[0];

// 1. RECORD A SALE
export const recordSale = async (req: Request, res: Response) => {
    try {
        // We accept the single-item payload from the frontend and adapt it to the new model
        const { itemId, quantity, price } = req.body;
        
        const user = await User.findOne(); // Mock Auth
        if (!user) return res.status(404).json({ error: "User not found" });

        const safeQty = validateNumber(quantity);
        const safePrice = validateNumber(price);

        if (!itemId || !safeQty || !safePrice) {
            return res.status(400).json({ error: "Invalid sale data" });
        }

        // A. Find Inventory Item
        const item = await Inventory.findOne({ _id: itemId, user: user._id });
        if (!item) return res.status(404).json({ error: "Item not found in inventory" });

        // B. Check Stock
        if (item.quantity < safeQty) {
            return res.status(400).json({ error: `Insufficient stock. Only ${item.quantity} left.` });
        }

        // C. Deduct Stock
        item.quantity -= safeQty;
        await item.save();

        // D. Create Transaction Record (Using your robust schema)
        const totalAmount = safeQty * safePrice;
        
        const transaction = await Transaction.create({
            user: user._id,
            type: 'SALE',
            paymentStatus: 'PAID',
            items: [{
                name: item.name,
                qty: safeQty,
                unit: 'pc', // Default unit
                unitPrice: safePrice,
                total: totalAmount
            }],
            totalMoney: totalAmount,
            date: getCurrentDateString(), // "YYYY-MM-DD"
            timestamp: new Date()
        });

        res.json({ success: true, transaction, remainingStock: item.quantity });

    } catch (error) {
        console.error("Record Sale Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// 2. GET SALES HISTORY
export const getSalesHistory = async (req: Request, res: Response) => {
    try {
        const user = await User.findOne();
        if (!user) return res.status(404).json({ error: "User not found" });

        const { startDate, endDate } = req.query;

        let query: any = { user: user._id, type: 'SALE' };

        // Date Filtering (Using the string 'date' field YYYY-MM-DD)
        if (startDate && endDate) {
            query.date = { $gte: startDate, $lte: endDate };
        }

        // Fetch and sort by newest timestamp
        const sales = await Transaction.find(query).sort({ timestamp: -1 });

        // Map to frontend expectation
        const formattedSales = sales.map(t => ({
            id: t._id,
            date: t.timestamp || new Date(), // Use timestamp for display time
            totalAmount: t.totalMoney || 0,
            items: t.items.map(i => ({
                name: i.name,
                quantity: i.qty,
                price: i.unitPrice
            }))
        }));

        res.json(formattedSales);

    } catch (error) {
        console.error("Fetch History Error:", error);
        res.status(500).json({ error: "Server Error" });
    }
};

// 3. GENERATE PDF REPORT (Tycoon Only)
export const generateSalesReport = async (req: Request, res: Response) => {
    try {
        const user = await User.findOne();
        if (!user) return res.status(404).json({ error: "User not found" });

        if (user.planType !== 'TYCOON') {
            return res.status(403).json({ error: "Upgrade to Tycoon plan to download reports" });
        }

        const { startDate, endDate } = req.query;
        
        let query: any = { user: user._id, type: 'SALE' };
        if (startDate && endDate) {
            query.date = { $gte: startDate, $lte: endDate };
        }
        
        const transactions = await Transaction.find(query).sort({ timestamp: 1 });

        // --- PDF GENERATION ---
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${startDate}_${endDate}.pdf`);

        doc.pipe(res);

        doc.fontSize(20).text(user.businessName || 'My Shop', { align: 'center' });
        doc.fontSize(12).text('Sales Report', { align: 'center' });
        doc.text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
        doc.moveDown();

        doc.fontSize(10).font('Helvetica-Bold');
        const tableTop = 150;
        doc.text('Date', 50, tableTop);
        doc.text('Items', 150, tableTop);
        doc.text('Total', 450, tableTop, { align: 'right' });
        
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        let y = tableTop + 25;
        let totalRevenue = 0;
        doc.font('Helvetica');

        transactions.forEach(t => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            // Date
            doc.text(t.date, 50, y);
            
            // Items (Join names if multiple)
            const itemSummary = t.items.map(i => `${i.qty}x ${i.name}`).join(', ');
            doc.text(itemSummary, 150, y, { width: 280, ellipsis: true });
            
            // Amount
            const amt = t.totalMoney || 0;
            doc.text(`N${amt.toLocaleString()}`, 450, y, { align: 'right' });
            
            totalRevenue += amt;
            y += 20;
        });

        doc.moveDown();
        doc.moveTo(50, y).lineTo(550, y).stroke();
        doc.moveDown();
        
        doc.fontSize(14).font('Helvetica-Bold').text(`Total Revenue: N${totalRevenue.toLocaleString()}`, 50, y + 20, { align: 'right' });

        doc.end();

    } catch (error) {
        console.error("PDF Gen Error:", error);
        if (!res.headersSent) res.status(500).json({ error: "Could not generate report" });
    }
};