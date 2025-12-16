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
// 3. GENERATE PDF REPORT (Tycoon Only)
export const generateSalesReport = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne();
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.planType !== 'TYCOON') {
      return res.status(403).json({ error: "Upgrade to Tycoon plan to download reports" });
    }

    const businessName = user.businessName || 'My Shop';
    const startDate = (req.query.startDate as string) || '';
    const endDate = (req.query.endDate as string) || '';

    let query: any = { user: user._id, type: 'SALE' };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const transactions = await Transaction.find(query).sort({ timestamp: 1 });

    // ---------- PDF SETUP ----------
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 56, left: 48, right: 48 },
      bufferPages: true, // allow us to add page numbers after
    });

    const safeStart = startDate || 'all';
    const safeEnd = endDate || 'all';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Sales_Report_${safeStart}_${safeEnd}.pdf`
    );

    doc.pipe(res);

    // ---------- BRAND THEME ----------
    const BRAND = {
      primary: '#16a34a', // emerald-600
      dark: '#0b1220',
      text: '#0f172a',
      muted: '#64748b',
      line: '#e2e8f0',
      soft: '#f1f5f9',
      white: '#ffffff',
    };

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const m = doc.page.margins;
    const contentW = pageW - m.left - m.right;

    // ---------- HELPERS ----------
    const formatMoney = (n: number) => `₦${Math.round(n).toLocaleString()}`;

    const formatPeriod = () => {
      if (startDate && endDate) return `${startDate} → ${endDate}`;
      if (startDate && !endDate) return `From ${startDate}`;
      if (!startDate && endDate) return `Up to ${endDate}`;
      return `All time`;
    };

    const drawWatermark = () => {
      const text = `TallyPadi • ${businessName}`;
      doc.save();
      doc.rotate(-32, { origin: [pageW / 2, pageH / 2] });
      doc.fillColor(BRAND.dark).opacity(0.06);
      doc.font('Helvetica-Bold').fontSize(52);
      doc.text(text, -100, pageH / 2 - 40, { width: pageW + 200, align: 'center' });
      doc.opacity(1).restore();
    };

    const drawHeader = () => {
      // top bar
      doc.save();
      doc.rect(0, 0, pageW, 72).fill(BRAND.dark);

      // "logo" circle
      doc.fillColor(BRAND.primary);
      doc.circle(m.left + 14, 36, 14).fill();
      doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(10);
      doc.text('TP', m.left + 6, 31, { width: 16, align: 'center' });

      // brand + report title
      doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(16);
      doc.text('TallyPadi', m.left + 40, 22);

      doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10);
      doc.text('Sales Report', m.left + 40, 42);

      // right side: business name + period
      doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(12);
      doc.text(businessName, m.left, 22, { width: contentW, align: 'right' });

      doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9);
      doc.text(`Period: ${formatPeriod()}`, m.left, 40, { width: contentW, align: 'right' });

      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8);
      doc.text(`Generated: ${new Date().toLocaleString()}`, m.left, 54, {
        width: contentW,
        align: 'right',
      });

      doc.restore();

      // divider under header
      doc.moveTo(m.left, 84).lineTo(pageW - m.right, 84).strokeColor(BRAND.line).lineWidth(1).stroke();
    };

    const drawFooter = (pageNumber: number, totalPages: number) => {
      const y = pageH - m.bottom + 18;

      doc.save();
      doc.strokeColor(BRAND.line).lineWidth(1);
      doc.moveTo(m.left, pageH - m.bottom + 6).lineTo(pageW - m.right, pageH - m.bottom + 6).stroke();

      doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8);
      doc.text('tallypadi.com', m.left, y, { align: 'left' });
      doc.text(`Page ${pageNumber} of ${totalPages}`, m.left, y, { width: contentW, align: 'right' });

      doc.restore();
    };

    const drawTableHeader = (y: number) => {
      const rowH = 22;

      doc.save();
      doc.fillColor(BRAND.soft);
      doc.roundedRect(m.left, y, contentW, rowH, 8).fill();

      doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(9);
      doc.text('DATE', m.left + 10, y + 6, { width: 90 });
      doc.text('ITEMS', m.left + 100, y + 6, { width: contentW - 90 - 120 });
      doc.text('AMOUNT', m.left, y + 6, { width: contentW - 10, align: 'right' });

      doc.restore();
      return y + rowH + 6;
    };

    const drawRow = (y: number, idx: number, t: any) => {
      const dateStr = t.date || '';
      const itemSummary = (t.items || [])
        .map((i: any) => `${i.qty}x ${i.name}`)
        .join(', ')
        .trim();

      const amt = t.totalMoney ?? 0;

      // calculate dynamic row height for wrapped items
      doc.font('Helvetica').fontSize(9);
      const itemsW = contentW - 90 - 120;
      const itemsH = doc.heightOfString(itemSummary || '-', { width: itemsW });
      const rowH = Math.max(22, itemsH + 10);

      // zebra background
      if (idx % 2 === 0) {
        doc.save();
        doc.fillColor('#ffffff').opacity(0.85);
        doc.roundedRect(m.left, y, contentW, rowH, 8).fill();
        doc.opacity(1).restore();
      } else {
        doc.save();
        doc.fillColor('#ffffff').opacity(0.55);
        doc.roundedRect(m.left, y, contentW, rowH, 8).fill();
        doc.opacity(1).restore();
      }

      // text
      doc.fillColor(BRAND.text).font('Helvetica').fontSize(9);
      doc.text(dateStr, m.left + 10, y + 6, { width: 90 });

      doc.fillColor('#334155');
      doc.text(itemSummary || '-', m.left + 100, y + 6, { width: itemsW });

      doc.fillColor(BRAND.primary).font('Helvetica-Bold');
      doc.text(formatMoney(amt), m.left, y + 6, { width: contentW - 10, align: 'right' });

      // subtle line
      doc.save();
      doc.strokeColor(BRAND.line).opacity(0.6);
      doc.roundedRect(m.left, y, contentW, rowH, 8).stroke();
      doc.opacity(1).restore();

      return y + rowH + 8;
    };

    // ---------- COMPUTE SUMMARY ----------
    let totalRevenue = 0;
    let saleCount = 0;

    for (const t of transactions) {
      totalRevenue += (t.totalMoney ?? 0);
      saleCount += 1;
    }

    const avgSale = saleCount > 0 ? totalRevenue / saleCount : 0;

    // ---------- RENDER ----------
    const renderNewPageFrame = () => {
      drawWatermark();
      drawHeader();
    };

    renderNewPageFrame();

    let y = 100;

    // Small summary chips at top (nice look)
    doc.save();
    doc.roundedRect(m.left, y, contentW, 54, 14).fillColor('#ffffff').opacity(0.9).fill();
    doc.opacity(1);
    doc.roundedRect(m.left, y, contentW, 54, 14).strokeColor(BRAND.line).stroke();

    doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL SALES', m.left + 16, y + 12);
    doc.text('TOTAL REVENUE', m.left + 170, y + 12);
    doc.text('AVG SALE', m.left + 360, y + 12);

    doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(16);
    doc.text(String(saleCount), m.left + 16, y + 28);
    doc.text(formatMoney(totalRevenue), m.left + 170, y + 28);
    doc.text(formatMoney(avgSale), m.left + 360, y + 28);

    doc.restore();

    y += 70;

    // Table
    y = drawTableHeader(y);

    for (let i = 0; i < transactions.length; i++) {
      // if near bottom, new page
      if (y > pageH - m.bottom - 120) {
        doc.addPage();
        // recalc page dims after addPage (PDFKit updates doc.page)
        // (safe even if same A4)
        renderNewPageFrame();
        y = 100;
        y = drawTableHeader(y);
      }

      y = drawRow(y, i, transactions[i]);
    }

    // Final total block
    if (y > pageH - m.bottom - 120) {
      doc.addPage();
      renderNewPageFrame();
      y = 110;
    }

    doc.save();
    doc.roundedRect(m.left, y + 10, contentW, 70, 16).fillColor('#ffffff').opacity(0.9).fill();
    doc.opacity(1);
    doc.roundedRect(m.left, y + 10, contentW, 70, 16).strokeColor(BRAND.line).stroke();

    doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(12);
    doc.text('Grand Total', m.left + 16, y + 28);

    doc.fillColor(BRAND.primary).font('Helvetica-Bold').fontSize(18);
    doc.text(formatMoney(totalRevenue), m.left, y + 24, { width: contentW - 16, align: 'right' });

    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(9);
    doc.text(`Report generated by TallyPadi for ${businessName}`, m.left + 16, y + 52);

    doc.restore();

    // ---------- PAGE NUMBERS (must be after all pages are created) ----------
    const range = doc.bufferedPageRange(); // { start, count }
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pageNumber = i - range.start + 1;
      const totalPages = range.count;
      drawFooter(pageNumber, totalPages);
    }

    doc.end();
  } catch (error) {
    console.error("PDF Gen Error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Could not generate report" });
  }
};
