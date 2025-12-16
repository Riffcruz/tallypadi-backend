import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import PDFDocument from 'pdfkit';
import path from 'path';

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


// Currency code mapping (safe across all fonts)
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN',
  US: 'USD',
  GB: 'GBP',
  EU: 'EUR',
  GH: 'GHS',
  KE: 'KES',
  ZA: 'ZAR',
  IN: 'INR',
  CN: 'CNY',
  CA: 'CAD',
};

export const generateSalesReport = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne();
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

    // ---------- PDF SETUP ----------
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 56, left: 48, right: 48 },
      bufferPages: true,
    });

    const safeStart = startDate || 'all';
    const safeEnd = endDate || 'all';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${safeStart}_${safeEnd}.pdf`);
    doc.pipe(res);

    // ---------- THEME ----------
    const BRAND = {
      primary: '#16a34a',
      dark: '#0b1220',
      text: '#0f172a',
      muted: '#64748b',
      line: '#e2e8f0',
      soft: '#f1f5f9',
      white: '#ffffff',
    };

    // Use getters (safe even after addPage)
    const pageW = () => doc.page.width;
    const pageH = () => doc.page.height;
    const m = () => doc.page.margins;
    const contentW = () => pageW() - m().left - m().right;

    // Register Noto Sans font (Unicode support)
    const notoSansPath = path.join('/usr/share/fonts/truetype/noto', 'NotoSans-Regular.ttf');
    doc.registerFont('NotoSans', notoSansPath);

    const formatMoney = (n: number) => `${currencyCode} ${n.toFixed(2)}`;

    const formatPeriod = () => {
      if (startDate && endDate) return `${startDate} to ${endDate}`;
      if (startDate && !endDate) return `From ${startDate}`;
      if (!startDate && endDate) return `Up to ${endDate}`;
      return `All time`;
    };

    // ✅ Watermark that NEVER wraps (prevents “ghost/empty pages”)
    const drawWatermark = () => {
      const text = `TallyPadi • ${businessName}`;
      doc.save();
      doc.rotate(-32, { origin: [pageW() / 2, pageH() / 2] });
      doc.fillColor(BRAND.dark).opacity(0.06);
      doc.font('NotoSans').fontSize(48);

      // Very wide single-line text; lineBreak:false prevents wrapping/pagination
      doc.text(text, -pageW(), pageH() / 2 - 24, {
        width: pageW() * 3,
        align: 'center',
        lineBreak: false,
      });

      doc.opacity(1).restore();
    };

    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, pageW(), 72).fill(BRAND.dark);

      // TP “logo”
      doc.fillColor(BRAND.primary);
      doc.circle(m().left + 14, 36, 14).fill();
      doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(10);
      doc.text('TP', m().left + 6, 31, { width: 16, align: 'center', lineBreak: false });

      doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(16);
      doc.text('TallyPadi', m().left + 40, 22, { lineBreak: false });

      doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10);
      doc.text('Sales Report', m().left + 40, 42, { lineBreak: false });

      // Right info
      doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(12);
      doc.text(businessName, m().left, 22, { width: contentW(), align: 'right', lineBreak: false });

      doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9);
      doc.text(`Period: ${formatPeriod()}`, m().left, 40, { width: contentW(), align: 'right', lineBreak: false });

      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString('en-NG')}`, m().left, 54, {
        width: contentW(),
        align: 'right',
        lineBreak: false,
      });

      doc.restore();
      doc.moveTo(m().left, 84).lineTo(pageW() - m().right, 84).strokeColor(BRAND.line).lineWidth(1).stroke();
    };

    const drawFooter = (pageNumber: number, totalPages: number) => {
      const y = pageH() - m().bottom + 18;
      doc.save();
      doc.strokeColor(BRAND.line).lineWidth(1);
      doc.moveTo(m().left, pageH() - m().bottom + 6).lineTo(pageW() - m().right, pageH() - m().bottom + 6).stroke();

      doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8);
      doc.text('tallypadi.com', m().left, y, { align: 'left', lineBreak: false });
      doc.text(`Page ${pageNumber} of ${totalPages}`, m().left, y, { width: contentW(), align: 'right', lineBreak: false });
      doc.restore();
    };

    // Draw first page frame
    const renderFrame = () => {
      drawWatermark();
      drawHeader();
    };

    // Table Header
    const drawTableHeader = (y: number) => {
      const rowH = 22;
      doc.save();
      doc.fillColor(BRAND.soft);
      doc.roundedRect(m().left, y, contentW(), rowH, 8).fill();
      doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(9);

      doc.text('DATE', m().left + 10, y + 6, { width: 90, lineBreak: false });
      doc.text('ITEMS', m().left + 100, y + 6, { width: contentW() - 90 - 130, lineBreak: false });
      doc.text(`AMOUNT (${currencyCode})`, m().left, y + 6, { width: contentW() - 10, align: 'right', lineBreak: false });

      doc.restore();
      return y + rowH + 6;
    };

    // Row function
    const drawRow = (y: number, idx: number, t: any) => {
      const dateStr = t.date || '';
      const itemSummary = (t.items || []).map((i: any) => `${i.qty}x ${i.name}`).join(', ');
      const amt = t.totalMoney ?? 0;

      const itemsW = contentW() - 90 - 130;
      doc.font('Helvetica').fontSize(9);

      const itemsH = doc.heightOfString(itemSummary || '-', { width: itemsW });
      const rowH = Math.max(22, itemsH + 10);

      // Zebra background
      doc.save();
      doc.fillColor('#ffffff').opacity(idx % 2 === 0 ? 0.85 : 0.6);
      doc.roundedRect(m().left, y, contentW(), rowH, 8).fill();
      doc.opacity(1).restore();

      // text
      doc.fillColor(BRAND.text).font('Helvetica').fontSize(9);
      doc.text(dateStr, m().left + 10, y + 6, { width: 90 });

      doc.fillColor('#334155');
      doc.text(itemSummary || '-', m().left + 100, y + 6, { width: itemsW });

      doc.fillColor(BRAND.primary).font('Helvetica-Bold');
      doc.text(formatMoney(amt), m().left, y + 6, { width: contentW() - 10, align: 'right', lineBreak: false });

      // Line stroke for each row
      doc.save();
      doc.strokeColor(BRAND.line).opacity(0.6);
      doc.roundedRect(m().left, y, contentW(), rowH, 8).stroke();
      doc.opacity(1).restore();

      return y + rowH + 8;
    };

    // --- FINAL FOOTER & PAGE NUMBERS ---
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

