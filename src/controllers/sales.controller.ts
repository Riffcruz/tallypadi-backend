import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// --- Helpers ---
const getCurrentDateString = () => new Date().toISOString().split('T')[0];

const toNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ✅ EXPANDED Currency Mapping
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

// ✅ Theme Configuration
const THEME = {
  primary: '#0F766E',
  accent: '#14B8A6',
  dark: '#1E293B',
  text: '#334155',
  muted: '#64748B',
  border: '#E2E8F0',
  bgLight: '#F8FAFC',
  bgHeader: '#F1F5F9',
  white: '#FFFFFF'
};

/**
 * ✅ RECORD SALE
 * Supports BOTH payloads:
 * 1) Single item:
 *    { itemId, quantity, price }
 *
 * 2) Cart/batch:
 *    { items: [{ itemId, quantity, price }, ...] }
 */
export const recordSale = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne(); // TODO: replace with real auth
    if (!user) return res.status(404).json({ error: "User not found" });

    const rawItems = Array.isArray(req.body?.items)
      ? req.body.items
      : [{ itemId: req.body?.itemId, quantity: req.body?.quantity, price: req.body?.price }];

    if (!rawItems.length) {
      return res.status(400).json({ error: "Invalid sale data", message: "No sale items provided." });
    }

    // Validate input first
    const items = rawItems.map((it: any, idx: number) => {
      const itemId = String(it?.itemId || '').trim();
      const quantity = toNumber(it?.quantity);
      const price = toNumber(it?.price);

      if (!itemId) {
        throw new Error(`Item #${idx + 1}: missing itemId`);
      }
      if (quantity === null || quantity <= 0) {
        throw new Error(`Item #${idx + 1}: invalid quantity`);
      }
      if (price === null || price <= 0) {
        throw new Error(`Item #${idx + 1}: invalid price (must be > 0)`);
      }

      return { itemId, quantity, price };
    });

    // ✅ Stock-safe update (prevents negative stock)
    const txItems: any[] = [];
    let totalMoney = 0;

    for (const it of items) {
      // Atomically reduce stock only if enough stock exists
      const updated = await Inventory.findOneAndUpdate(
        { _id: it.itemId, user: user._id, quantity: { $gte: it.quantity } },
        { $inc: { quantity: -it.quantity } },
        { new: true }
      );

      if (!updated) {
        // determine if item exists at all
        const exists = await Inventory.findOne({ _id: it.itemId, user: user._id });
        if (!exists) {
          return res.status(404).json({ error: "Item not found", itemId: it.itemId });
        }
        return res.status(409).json({
          error: "Insufficient stock",
          itemId: it.itemId,
          message: "Not enough stock to complete this sale."
        });
      }

      const lineTotal = it.quantity * it.price;
      totalMoney += lineTotal;

      txItems.push({
        name: updated.name,
        qty: it.quantity,
        unit: 'pc',
        unitPrice: it.price,
        total: lineTotal,
      });
    }

    const transaction = await Transaction.create({
      user: user._id,
      type: 'SALE',
      paymentStatus: 'PAID',
      items: txItems,
      totalMoney,
      date: getCurrentDateString(),
      timestamp: new Date(),
    });

    return res.json({
      success: true,
      transaction,
      remaining: txItems.map((x) => x.name),
    });
  } catch (error: any) {
    console.error("Record Sale Error:", error);

    // If we threw a validation error string above:
    if (typeof error?.message === 'string' && error.message.includes('Item #')) {
      return res.status(400).json({ error: "Invalid sale data", message: error.message });
    }

    return res.status(500).json({ error: "Server Error" });
  }
};

// ✅ SALES HISTORY
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

    const formattedSales = sales.map((t: any) => ({
      id: t._id,
      date: t.timestamp || new Date(),
      totalAmount: t.totalMoney || 0,
      items: (t.items || []).map((i: any) => ({
        name: i.name,
        quantity: i.qty,
        price: i.unitPrice
      }))
    }));

    return res.json(formattedSales);
  } catch (error) {
    console.error("Fetch History Error:", error);
    return res.status(500).json({ error: "Server Error" });
  }
};

// ✅ PDF REPORT (FIXED: doc.page is only available AFTER addPage)
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

    const transactions: any[] = await Transaction.find(query).sort({ timestamp: 1 });

    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalMoney || 0), 0);
    const totalTx = transactions.length;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
      autoFirstPage: false
    });

    const safeStart = startDate || 'all';
    const safeEnd = endDate || 'all';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${safeStart}_${safeEnd}.pdf`);
    doc.pipe(res);

    // --- Fonts ---
    const fontPaths = [
      path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    ];
    let fontToUse = 'Helvetica';
    for (const p of fontPaths) {
      if (fs.existsSync(p)) {
        doc.registerFont('Noto', p);
        fontToUse = 'Noto';
        break;
      }
    }
    const boldFont = fontToUse === 'Noto' ? 'Noto' : 'Helvetica-Bold';
    const regFont = fontToUse === 'Noto' ? 'Noto' : 'Helvetica';

    // ✅ Add first page BEFORE reading doc.page.*
    doc.addPage();

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const contentW = pageW - margin * 2;
    const bottomLimit = pageH - 50;

    const formatMoney = (n: number) =>
      `${currencyCode} ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const drawWatermark = () => {
      const text = `TallyPadi • ${businessName}`;
      doc.save();
      doc.translate(pageW / 2, pageH / 2);
      doc.rotate(-45);
      doc.fillColor(THEME.dark).opacity(0.04);
      doc.fontSize(50);
      doc.text(text, -pageW / 2, 0, {
        align: 'center',
        width: pageW,
        lineBreak: false
      });
      doc.restore();
      doc.opacity(1);
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

    // --- Build PDF ---
    drawWatermark();
    drawHeader();
    drawSummaryCards();

    doc.fillColor(THEME.dark).fontSize(12).font(boldFont).text('Transaction History', margin, doc.y);
    doc.y += 10;

    drawTableHeaders(doc.y);
    doc.y += 30;

    doc.font(regFont);

    const colDate = 80;
    const colAmount = 90;
    const colItems = contentW - colDate - colAmount;

    for (let idx = 0; idx < transactions.length; idx++) {
      const t: any = transactions[idx];
      const dateStr = t.date || new Date().toISOString().split('T')[0];
      const itemText = (t.items || []).map((i: any) => `${i.qty} x ${i.name}`).join(', ');
      const amtStr = formatMoney(t.totalMoney || 0);

      const textHeight = doc.heightOfString(itemText, { width: colItems - 10 });
      const rowHeight = Math.max(25, textHeight + 15);

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

      if (idx % 2 !== 0) doc.rect(margin, currentY, contentW, rowHeight).fill(THEME.bgLight);

      doc.fillColor(THEME.text);

      const centerY = currentY + (rowHeight - 10) / 2;
      doc.text(dateStr, margin + 10, centerY, { width: colDate });
      doc.text(itemText, margin + 10 + colDate, currentY + 8, { width: colItems - 10 });

      doc.font(boldFont);
      doc.text(amtStr, margin, centerY, { width: contentW - 10, align: 'right' });
      doc.font(regFont);

      doc.moveTo(margin, currentY + rowHeight).lineTo(pageW - margin, currentY + rowHeight)
        .strokeColor(THEME.border).lineWidth(0.5).stroke();

      doc.y = currentY + rowHeight;
    }

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
