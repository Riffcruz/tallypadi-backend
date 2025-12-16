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
  NG: 'NGN', // Nigeria
  GH: 'GHS', // Ghana
  US: 'USD', // USA
  GB: 'GBP', // UK
  EU: 'EUR', // Eurozone
  KE: 'KES', // Kenya
  ZA: 'ZAR', // South Africa
  IN: 'INR', // India
  CN: 'CNY', // China
  CA: 'CAD', // Canada
  AU: 'AUD', // Australia
  JP: 'JPY', // Japan
  AE: 'AED', // UAE (Dubai)
  RW: 'RWF', // Rwanda
  TZ: 'TZS', // Tanzania
  UG: 'UGX', // Uganda
};

// ✅ Theme Configuration (Teal/Slate Professional Look)
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
export const recordSale = async (req: Request, res: Response) => {
    try {
        const { itemId, quantity, price } = req.body;
        
        const user = await User.findOne(); // Mock Auth
        if (!user) return res.status(404).json({ error: "User not found" });

        const safeQty = validateNumber(quantity);
        const safePrice = validateNumber(price);

        if (!itemId || !safeQty || !safePrice) {
            return res.status(400).json({ error: "Invalid sale data" });
        }

        const item = await Inventory.findOne({ _id: itemId, user: user._id });
        if (!item) return res.status(404).json({ error: "Item not found in inventory" });

        if (item.quantity < safeQty) {
            return res.status(400).json({ error: `Insufficient stock. Only ${item.quantity} left.` });
        }

        item.quantity -= safeQty;
        await item.save();

        const totalAmount = safeQty * safePrice;
        
        const transaction = await Transaction.create({
            user: user._id,
            type: 'SALE',
            paymentStatus: 'PAID',
            items: [{
                name: item.name,
                qty: safeQty,
                unit: 'pc',
                unitPrice: safePrice,
                total: totalAmount
            }],
            totalMoney: totalAmount,
            date: getCurrentDateString(),
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

// 3. GENERATE PDF REPORT (Revamped)
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

    const transactions = await Transaction.find(query).sort({ timestamp: 1 });

    // Calculate Totals for Stats Cards
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalMoney || 0), 0);
    const totalTx = transactions.length;

    // ---------- PDF SETUP ----------
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
    });

    const safeStart = startDate || 'all';
    const safeEnd = endDate || 'all';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${safeStart}_${safeEnd}.pdf`);
    doc.pipe(res);

    // --- FONTS ---
    // Attempt to find NotoSans, fallback to Helvetica if missing
    const fontPaths = [
      path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'), // Local
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', // Linux system
    ];
    let fontToUse = 'Helvetica';
    for(const p of fontPaths) {
      if(fs.existsSync(p)) {
        doc.registerFont('Noto', p);
        fontToUse = 'Noto';
        break;
      }
    }

    // --- DIMENSIONS ---
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const contentW = pageW - margin * 2;

    // --- HELPERS ---
    const formatMoney = (n: number) => `${currencyCode} ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const drawWatermark = () => {
        const text = `TallyPadi • ${businessName}`;
        doc.save();
        doc.rotate(-32, { origin: [pageW / 2, pageH / 2] });
        doc.fillColor(THEME.dark).opacity(0.04);
        doc.fontSize(48);
        doc.text(text, -pageW, pageH / 2 - 24, { width: pageW * 3, align: 'center', lineBreak: false });
        doc.restore();
    };

    const drawHeader = () => {
      // Background Bar
      doc.rect(0, 0, pageW, 70).fill(THEME.dark);

      // Logo Circle
      doc.circle(margin + 15, 35, 14).fill(THEME.primary);
      doc.fillColor(THEME.white).font(fontToUse === 'Noto' ? 'Noto' : 'Helvetica-Bold').fontSize(10);
      doc.text('TP', margin + 7, 31);

      // Titles
      doc.fillColor(THEME.white).fontSize(16).text('TallyPadi', margin + 40, 24);
      doc.fillColor(THEME.muted).fontSize(10).text('Sales Report', margin + 40, 46);

      // Right Side Info
      doc.fillColor(THEME.white).fontSize(12).text(businessName, margin, 24, { width: contentW, align: 'right' });
      doc.fillColor('#94a3b8').fontSize(9).text(`Period: ${startDate || 'Start'} to ${endDate || 'Now'}`, margin, 44, { width: contentW, align: 'right' });
    
      doc.y = 90; // Move cursor down
    };

    const drawFooter = (page: number, total: number) => {
        const y = pageH - 40;
        doc.moveTo(margin, y - 10).lineTo(pageW - margin, y - 10).strokeColor(THEME.border).lineWidth(1).stroke();
        doc.fillColor(THEME.muted).fontSize(8);
        doc.text('Generated by TallyPadi Business Intelligence', margin, y);
        doc.text(`Page ${page} of ${total}`, margin, y, { width: contentW, align: 'right' });
    };

    const drawSummaryCards = () => {
        const cardW = (contentW / 2) - 10;
        const startY = doc.y;
        
        // Revenue Card
        doc.roundedRect(margin, startY, cardW, 60, 6).fill(THEME.bgLight);
        doc.rect(margin, startY, 5, 60).fill(THEME.primary); // Green strip
        doc.fillColor(THEME.muted).fontSize(9).text('TOTAL REVENUE', margin + 15, startY + 12);
        doc.fillColor(THEME.dark).fontSize(18).text(formatMoney(totalRevenue), margin + 15, startY + 30);

        // Transaction Count Card
        const x2 = margin + cardW + 20;
        doc.roundedRect(x2, startY, cardW, 60, 6).fill(THEME.bgLight);
        doc.rect(x2, startY, 5, 60).fill(THEME.accent); // Teal strip
        doc.fillColor(THEME.muted).fontSize(9).text('TOTAL TRANSACTIONS', x2 + 15, startY + 12);
        doc.fillColor(THEME.dark).fontSize(18).text(String(totalTx), x2 + 15, startY + 30);

        doc.y = startY + 80; // Add spacing below cards
    };

    // --- RENDER ---
    drawWatermark();
    drawHeader();
    drawSummaryCards();

    // --- TABLE RENDER ---
    doc.fillColor(THEME.dark).fontSize(12).text('Transaction History', margin, doc.y);
    doc.y += 10;

    // Define Columns: Date (80), Items (Flex), Amount (90)
    const colDate = 80;
    const colAmount = 90;
    const colItems = contentW - colDate - colAmount;

    // Table Header
    const headerY = doc.y;
    doc.rect(margin, headerY, contentW, 25).fill(THEME.bgHeader);
    doc.fillColor(THEME.text).fontSize(9).font(fontToUse === 'Noto' ? 'Noto' : 'Helvetica-Bold');
    
    doc.text('DATE', margin + 10, headerY + 8, { width: colDate });
    doc.text('ITEM DETAILS', margin + 10 + colDate, headerY + 8, { width: colItems });
    doc.text(`AMOUNT (${currencyCode})`, margin, headerY + 8, { width: contentW - 10, align: 'right' });
    
    doc.y += 30;

    // Rows
    doc.font(fontToUse === 'Noto' ? 'Noto' : 'Helvetica');
    transactions.forEach((t: any, idx) => {
        const dateStr = t.date || new Date().toISOString().split('T')[0];
        const itemText = (t.items || []).map((i:any) => `${i.qty} x ${i.name}`).join(', ');
        const amtStr = formatMoney(t.totalMoney || 0);

        // Calc height based on item text wrapping
        const textHeight = doc.heightOfString(itemText, { width: colItems - 10 });
        const rowHeight = Math.max(25, textHeight + 15);

        // Check Page Break
        if (doc.y + rowHeight > pageH - 50) {
            doc.addPage();
            drawWatermark();
            drawHeader();
            doc.y = 90;
            // Redraw Header
            const hY = doc.y;
            doc.rect(margin, hY, contentW, 25).fill(THEME.bgHeader);
            doc.fillColor(THEME.text).fontSize(9).font(fontToUse === 'Noto' ? 'Noto' : 'Helvetica-Bold');
            doc.text('DATE', margin + 10, hY + 8, { width: colDate });
            doc.text('ITEM DETAILS', margin + 10 + colDate, hY + 8, { width: colItems });
            doc.text(`AMOUNT (${currencyCode})`, margin, hY + 8, { width: contentW - 10, align: 'right' });
            doc.y += 30;
            doc.font(fontToUse === 'Noto' ? 'Noto' : 'Helvetica');
        }

        const currentY = doc.y;

        // Zebra Stripe
        if (idx % 2 !== 0) {
            doc.rect(margin, currentY, contentW, rowHeight).fill(THEME.bgLight);
        }

        doc.fillColor(THEME.text);
        
        // Vertically center Date and Amount (approximate)
        const centerY = currentY + (rowHeight - 10) / 2;
        
        doc.text(dateStr, margin + 10, centerY, { width: colDate });
        
        // Item text might wrap, so we draw it normally with padding
        doc.text(itemText, margin + 10 + colDate, currentY + 8, { width: colItems - 10 });
        
        doc.font(fontToUse === 'Noto' ? 'Noto' : 'Helvetica-Bold'); // Bold amount
        doc.text(amtStr, margin, centerY, { width: contentW - 10, align: 'right' });
        doc.font(fontToUse === 'Noto' ? 'Noto' : 'Helvetica'); // Reset font

        // Bottom border
        doc.moveTo(margin, currentY + rowHeight).lineTo(pageW - margin, currentY + rowHeight)
           .strokeColor(THEME.border).lineWidth(0.5).stroke();

        doc.y = currentY + rowHeight;
    });

    // --- FINALIZE ---
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