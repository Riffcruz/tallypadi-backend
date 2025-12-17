import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// --- Helpers ---
const validateNumber = (input: unknown) => (typeof input === 'number' && !isNaN(input)) ? input : undefined;
const getCurrentDateString = () => new Date().toISOString().split('T')[0];

// ✅ EXPANDED Currency Mapping
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

// ✅ Theme Configuration
const THEME = {
  primary: '#0F766E',      // Teal 700
  accent: '#14B8A6',       // Teal 500
  dark: '#1E293B',         // Slate 800
  text: '#334155',         // Slate 700
  muted: '#64748B',        // Slate 500
  border: '#E2E8F0',       // Slate 200
  bgLight: '#F8FAFC',      // Slate 50
  bgHeader: '#F1F5F9',     // Slate 100
  white: '#FFFFFF'
};

// 1. RECORD A SALE
import { Lock } from '../models/lock.model';

// 1. RECORD A SALE
export const recordSale = async (req: Request, res: Response) => {
    const locks: ILock[] = [];
    try {
        const { items } = req.body; // Expect an array of items

        const user = await User.findOne(); // Mock Auth
        if (!user) return res.status(404).json({ error: "User not found" });

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "Invalid sale data: items array is required." });
        }

        // Acquire locks
        for (const cartItem of items) {
            const { itemId } = cartItem;
            try {
                const lock = await Lock.create({ itemId });
                locks.push(lock);
            } catch (error) {
                return res.status(409).json({ error: 'Item is currently being processed by another transaction. Please try again.' });
            }
        }

        let totalAmount = 0;
        const transactionItems = [];

        for (const cartItem of items) {
            const { itemId, quantity, price } = cartItem;

            const safeQty = validateNumber(quantity);
            const safePrice = validateNumber(price);

            if (!itemId || !safeQty || !safePrice) {
                return res.status(400).json({ error: `Invalid data for one of the items.` });
            }

            const inventoryItem = await Inventory.findOne({ _id: itemId, user: user._id });
            if (!inventoryItem) {
                return res.status(404).json({ error: `Item with ID ${itemId} not found.` });
            }

            if (inventoryItem.quantity < safeQty) {
                return res.status(400).json({ error: `Insufficient stock for ${inventoryItem.name}.` });
            }

            inventoryItem.quantity -= safeQty;
            await inventoryItem.save();

            const itemTotal = safeQty * safePrice;
            totalAmount += itemTotal;

            transactionItems.push({
                name: inventoryItem.name,
                qty: safeQty,
                unit: 'pc',
                unitPrice: safePrice,
                total: itemTotal
            });
        }

        if (transactionItems.length === 0) {
            return res.status(400).json({ error: "No valid items to process." });
        }

        const transaction = await Transaction.create({
            user: user._id,
            type: 'SALE',
            paymentStatus: 'PAID',
            items: transactionItems,
            totalMoney: totalAmount,
            date: getCurrentDateString(),
            timestamp: new Date()
        });

        res.json({ success: true, transaction });

    } catch (error) {
        console.error("Record Sale Error:", error);
        res.status(500).json({ error: "Server Error" });
    } finally {
        // Release locks
        await Lock.deleteMany({ _id: { $in: locks.map(lock => lock._id) } });
    }
};

// 2. GET SALES HISTORY
export const getSalesHistory = async (req: Request, res: Response) => {
    try {
        const user = await User.findOne();
        if (!user) return res.status(404).json({ error: "User not found" });

        const { startDate, endDate } = req.query;
        let query: any = { user: user._id, type: 'SALE' };

        if (startDate && endDate) {
            query.date = { $gte: startDate, $lte: endDate };
        }

        const sales = await Transaction.find(query).sort({ timestamp: -1 });

        const formattedSales = sales.map(t => ({
            id: t._id,
            date: t.timestamp || new Date(),
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

// 3. GENERATE PDF REPORT (FIXED)
export const generateSalesReport = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne(); // In real app, use req.user
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.planType !== 'TYCOON') {
      return res.status(403).json({ error: 'Upgrade to Tycoon plan to download reports' });
    }

    const businessName = user.businessName || 'My Shop';
    const countryCode = (user as any).countryCode || 'NG';
    const currencyCode = COUNTRY_CURRENCY_CODE[String(countryCode).toUpperCase()] || 'NGN';

    const startDate = (req.query.startDate as string) || '';
    const endDate = (req.query.endDate as string) || '';

    let query: any = { user: user._id, type: 'SALE' };
    if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };

    const stats = await Transaction.aggregate([
        { $match: query },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$totalMoney' },
                totalTx: { $sum: 1 },
            },
        },
    ]);

    const { totalRevenue, totalTx } =
        stats.length > 0 ? stats[0] : { totalRevenue: 0, totalTx: 0 };

    const transactions = await Transaction.find(query).sort({ timestamp: 1 });

    // ---------- PDF SETUP ----------
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
      autoFirstPage: false 
    });

    doc.addPage();

    const safeStart = startDate || 'all';
    const safeEnd = endDate || 'all';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${safeStart}_${safeEnd}.pdf`);
    doc.pipe(res);

    const boldFont = 'Helvetica-Bold';
    const regFont = 'Helvetica';

    // --- DIMENSIONS ---
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const contentW = pageW - margin * 2;
    const bottomLimit = pageH - 50; 

    // --- HELPERS ---
    const formatMoney = (n: number) => `${currencyCode} ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const drawWatermark = () => {
        const text = `TallyPadi • ${businessName}`;
        doc.save();
        // Move origin to center
        doc.translate(pageW / 2, pageH / 2);
        doc.rotate(-45);
        doc.fillColor(THEME.dark).opacity(0.04);
        doc.fontSize(50);
        
        // FIX: Removed transformOrigin. 
        // We draw at negative half-width to center the text block over the (0,0) origin.
        doc.text(text, -pageW / 2, 0, { 
            align: 'center', 
            width: pageW,
            lineBreak: false 
        }); 
        doc.restore();
    };

    const drawHeader = () => {
      doc.rect(0, 0, pageW, 70).fill(THEME.dark);
      doc.circle(margin + 15, 35, 14).fill(THEME.primary);
      doc.fillColor(THEME.white).font(boldFont).fontSize(10).text('TP', margin + 7, 31);

      doc.fillColor(THEME.white).fontSize(16).text('TallyPadi', margin + 40, 24);
      doc.fillColor(THEME.muted).fontSize(10).text('Sales Report', margin + 40, 46);

      doc.fillColor(THEME.white).fontSize(12).text(businessName, margin, 24, { width: contentW, align: 'right' });
      doc.fillColor('#94a3b8').fontSize(9).text(`Period: ${startDate || 'Start'} to ${endDate || 'Now'}`, margin, 44, { width: contentW, align: 'right' });
      doc.y = 90;
    };

    const drawSummaryCards = () => {
        const cardW = (contentW / 2) - 10;
        const startY = doc.y;
        
        doc.roundedRect(margin, startY, cardW, 60, 6).fill(THEME.bgLight);
        doc.rect(margin, startY, 5, 60).fill(THEME.primary);
        doc.fillColor(THEME.muted).fontSize(9).text('TOTAL REVENUE', margin + 15, startY + 12);
        doc.fillColor(THEME.dark).fontSize(18).text(formatMoney(totalRevenue), margin + 15, startY + 30);

        const x2 = margin + cardW + 20;
        doc.roundedRect(x2, startY, cardW, 60, 6).fill(THEME.bgLight);
        doc.rect(x2, startY, 5, 60).fill(THEME.accent);
        doc.fillColor(THEME.muted).fontSize(9).text('TOTAL TRANSACTIONS', x2 + 15, startY + 12);
        doc.fillColor(THEME.dark).fontSize(18).text(String(totalTx), x2 + 15, startY + 30);

        doc.y = startY + 80;
    };

    const drawTableHeaders = (y: number) => {
        doc.rect(margin, y, contentW, 25).fill(THEME.bgHeader);
        doc.fillColor(THEME.text).fontSize(9).font(boldFont);
        doc.text('DATE', margin + 10, y + 8, { width: 80 });
        doc.text('ITEM DETAILS', margin + 90, y + 8, { width: contentW - 180 });
        doc.text(`AMOUNT (${currencyCode})`, margin, y + 8, { width: contentW - 10, align: 'right' });
    };

    const drawFooter = (page: number, total: number) => {
        const y = pageH - 40;
        doc.moveTo(margin, y - 10).lineTo(pageW - margin, y - 10).strokeColor(THEME.border).lineWidth(1).stroke();
        doc.fillColor(THEME.muted).fontSize(8).font(regFont);
        doc.text('Generated by TallyPadi Business Intelligence', margin, y);
        doc.text(`Page ${page} of ${total}`, margin, y, { width: contentW, align: 'right' });
    };

    // --- START DOCUMENT ---
    
    // 1. Manually add First Page
    doc.addPage();
    drawWatermark();
    drawHeader();
    drawSummaryCards();

    // 2. Setup Table
    doc.fillColor(THEME.dark).fontSize(12).font(boldFont).text('Transaction History', margin, doc.y);
    doc.y += 10;
    
    drawTableHeaders(doc.y);
    doc.y += 30;

    // 3. Loop Rows
    doc.font(regFont);
    const colDate = 80;
    const colAmount = 90;
    const colItems = contentW - colDate - colAmount;

    for (let idx = 0; idx < transactions.length; idx++) {
        const t = transactions[idx];
        const dateStr = t.date || new Date().toISOString().split('T')[0];
        const itemText = (t.items || []).map((i: any) => `${i.qty} x ${i.name}`).join(', ');
        const amtStr = formatMoney(t.totalMoney || 0);

        // Calculate dynamic height
        const textHeight = doc.heightOfString(itemText, { width: colItems - 10 });
        const rowHeight = Math.max(25, textHeight + 15);

        // CHECK: Will this row fit?
        if (doc.y + rowHeight > bottomLimit) {
            doc.addPage(); 
            drawWatermark();
            drawHeader(); 
            doc.y = 90;
            
            drawTableHeaders(doc.y);
            doc.y += 30;
            doc.font(regFont);
        }

        const currentY = doc.y;

        // Zebra Stripe
        if (idx % 2 !== 0) doc.rect(margin, currentY, contentW, rowHeight).fill(THEME.bgLight);

        doc.fillColor(THEME.text);
        
        // Vertically center Date & Amount
        const centerY = currentY + (rowHeight - 10) / 2;
        
        doc.text(dateStr, margin + 10, centerY, { width: colDate });
        doc.text(itemText, margin + 10 + colDate, currentY + 8, { width: colItems - 10 });
        
        doc.font(boldFont);
        doc.text(amtStr, margin, centerY, { width: contentW - 10, align: 'right' });
        doc.font(regFont);

        // Row Border
        doc.moveTo(margin, currentY + rowHeight).lineTo(pageW - margin, currentY + rowHeight)
           .strokeColor(THEME.border).lineWidth(0.5).stroke();

        doc.y = currentY + rowHeight;
    }

    // 4. Apply Footers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawFooter(i - range.start + 1, range.count);
    }

    doc.end();

  } catch (error) {
    console.error('PDF Gen Error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate report' });
  }
};