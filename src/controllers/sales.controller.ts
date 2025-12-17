import { Request, Response } from 'express';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// --- Helpers ---
const validateNumber = (input: unknown) => {
  const n = typeof input === 'string' ? Number(input) : (input as any);
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

const getCurrentDateString = () => new Date().toISOString().split('T')[0];

// ✅ Currency Mapping
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

// ✅ Theme
const THEME = {
  primary: '#0F766E',
  accent: '#14B8A6',
  dark: '#1E293B',
  text: '#334155',
  muted: '#64748B',
  border: '#E2E8F0',
  bgLight: '#F8FAFC',
  bgHeader: '#F1F5F9',
  white: '#FFFFFF',
};

// ✅ Subscription helpers (same logic as your inventory controller)
const hasWriteAccess = (user: any): boolean => {
  if (!user) return false;

  if (user.subscriptionStatus === 'active') return true;

  if (user.subscriptionStatus === 'trial') {
    const ms = new Date(user.trialEndsAt).getTime();
    if (!Number.isFinite(ms)) return false;
    return Date.now() < ms;
  }

  return false;
};

const denySubscription = (res: Response, user: any) => {
  const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt).toISOString() : null;
  return res.status(403).json({
    error: 'Subscription Required',
    message:
      user?.subscriptionStatus === 'trial'
        ? 'Your trial has expired. Please subscribe to continue.'
        : 'You must have an active subscription (or active trial) to use this feature.',
    subscriptionStatus: user?.subscriptionStatus || null,
    trialEndsAt,
  });
};

const getAuthUser = async (req: Request) => {
  const userId = (req as any).user?.id || (req as any).user?.userId || (req as any).userId;
  if (!userId) return null;
  return await User.findById(userId);
};

// 1) RECORD A SALE
export const recordSale = async (req: Request, res: Response) => {
  try {
    const { itemId, quantity, price } = req.body || {};

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // ✅ Enforce Trial/Active access
    if (!hasWriteAccess(user)) {
      return denySubscription(res, user);
    }

    const safeQty = validateNumber(quantity);
    const safePrice = validateNumber(price);

    if (!itemId || !safeQty || safeQty <= 0 || safePrice == null || safePrice < 0) {
      return res.status(400).json({ error: 'Invalid sale data' });
    }

    const item = await Inventory.findOne({ _id: itemId, user: user._id });
    if (!item) return res.status(404).json({ error: 'Item not found in inventory' });

    if (item.quantity < safeQty) {
      // ✅ frontend already handles 409 for insufficient stock
      return res.status(409).json({ error: `Insufficient stock. Only ${item.quantity} left.` });
    }

    // Update inventory
    item.quantity -= safeQty;
    if (safePrice > 0) item.lastUnitPrice = safePrice;
    await item.save();

    const totalAmount = safeQty * safePrice;

    const transaction = await Transaction.create({
      user: user._id,
      type: 'SALE',
      paymentStatus: 'PAID',
      items: [
        {
          name: item.name,
          qty: safeQty,
          unit: 'pc',
          unitPrice: safePrice,
          total: totalAmount,
        },
      ],
      totalMoney: totalAmount,
      date: getCurrentDateString(),
      timestamp: new Date(),
    });

    return res.json({ success: true, transaction, remainingStock: item.quantity });
  } catch (error) {
    console.error('Record Sale Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// 2) GET SALES HISTORY
export const getSalesHistory = async (req: Request, res: Response) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : '';

    const query: any = { user: user._id, type: 'SALE' };

    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const sales = await Transaction.find(query).sort({ timestamp: -1 }).lean();

    const formattedSales = (sales || []).map((t: any) => ({
      id: t._id,
      date: t.timestamp || new Date(),
      totalAmount: t.totalMoney || 0,
      items: (t.items || []).map((i: any) => ({
        name: i.name,
        quantity: i.qty,
        price: i.unitPrice,
      })),
    }));

    return res.json(formattedSales);
  } catch (error) {
    console.error('Fetch History Error:', error);
    return res.status(500).json({ error: 'Server Error' });
  }
};

// 3) GENERATE PDF REPORT ✅ FIXED (no more doc.page before addPage)
export const generateSalesReport = async (req: Request, res: Response) => {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (user.planType !== 'TYCOON') {
      return res.status(403).json({ error: 'Upgrade to Tycoon plan to download reports' });
    }

    const businessName = user.businessName || 'My Shop';
    const countryCode = String((user as any).countryCode || 'NG').toUpperCase();
    const currencyCode = COUNTRY_CURRENCY_CODE[countryCode] || 'NGN';

    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : '';

    const query: any = { user: user._id, type: 'SALE' };
    if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };

    const transactions = await Transaction.find(query).sort({ timestamp: 1 }).lean();

    const totalRevenue = (transactions || []).reduce((sum: number, t: any) => sum + (t.totalMoney || 0), 0);
    const totalTx = (transactions || []).length;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
      autoFirstPage: false,
    });

    const safeStart = startDate || 'all';
    const safeEnd = endDate || 'all';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${safeStart}_${safeEnd}.pdf`);
    doc.pipe(res);

    // ✅ MUST add page before doc.page usage (because autoFirstPage:false)
    doc.addPage();

    // --- FONTS ---
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

    // --- DIMENSIONS (now safe) ---
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const contentW = pageW - margin * 2;
    const bottomLimit = pageH - 50;

    const formatMoney = (n: number) =>
      `${currencyCode} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const drawWatermark = () => {
      const text = `TallyPadi • ${businessName}`;
      doc.save();
      doc.translate(pageW / 2, pageH / 2);
      doc.rotate(-45);
      doc.fillColor(THEME.dark).opacity(0.04);
      doc.fontSize(50);
      doc.text(text, -pageW / 2, 0, { align: 'center', width: pageW, lineBreak: false });
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
      doc
        .fillColor('#94a3b8')
        .fontSize(9)
        .text(`Period: ${startDate || 'Start'} to ${endDate || 'Now'}`, margin, 44, { width: contentW, align: 'right' });

      doc.y = 90;
    };

    const drawSummaryCards = () => {
      const cardW = contentW / 2 - 10;
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

    // --- PAGE 1 ---
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

      doc
        .moveTo(margin, currentY + rowHeight)
        .lineTo(pageW - margin, currentY + rowHeight)
        .strokeColor(THEME.border)
        .lineWidth(0.5)
        .stroke();

      doc.y = currentY + rowHeight;
    }

    // Footers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawFooter(i - range.start + 1, range.count);
    }

    doc.end();
  } catch (error) {
    console.error('PDF Gen Error:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Could not generate report' });
  }
};
