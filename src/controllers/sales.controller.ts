import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// --- Helpers ---
const toNumber = (input: unknown): number | null => {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim() !== '') {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const getCurrentDateString = () => new Date().toISOString().split('T')[0];

// Accepts BOTH:
// 1) { itemId, quantity, price }
// 2) { items: [{ itemId, quantity, price }, ...] }
type SaleItemInput = { itemId: string; quantity: number; price: number };

const normalizeSalePayload = (body: any): SaleItemInput[] => {
  const list = Array.isArray(body?.items) ? body.items : [body];
  const clean: SaleItemInput[] = [];

  for (const x of list) {
    const itemId = String(x?.itemId || '').trim();
    const quantity = toNumber(x?.quantity);
    const price = toNumber(x?.price);

    if (!itemId) continue;
    if (!quantity || quantity <= 0) continue;
    if (!price || price < 0) continue; // Allow 0 price if needed, but usually > 0

    clean.push({ itemId, quantity, price });
  }

  return clean;
};

// ✅ Currency Mapping
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

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

// =====================================================
// 1) RECORD SALE (FIXED: Works on Single Server)
// =====================================================
export const recordSale = async (req: Request, res: Response) => {
  // ⚠️ NOTE: Sessions removed to prevent "Transaction numbers only allowed on replica set" error
  
  try {
    const user = await User.findOne(); // TODO: replace with real auth
    if (!user) return res.status(404).json({ error: "User not found" });

    const items = normalizeSalePayload(req.body);
    if (!items.length) {
      return res.status(400).json({
        error: "Invalid sale data",
        message: "Send { items: [{ itemId, quantity, price }] } with quantity>0"
      });
    }

    // Merge duplicates by itemId
    const merged = new Map<string, SaleItemInput>();
    for (const it of items) {
      const prev = merged.get(it.itemId);
      if (!prev) merged.set(it.itemId, { ...it });
      else {
        prev.quantity += it.quantity;
        prev.price = it.price; // keep latest price
      }
    }
    const finalItems = Array.from(merged.values());

    // 1. Fetch Inventory (Standard Find)
    const invDocs = await Inventory.find({
      _id: { $in: finalItems.map(i => i.itemId) },
      user: user._id
    });

    const invMap = new Map<string, any>();
    invDocs.forEach(d => invMap.set(String(d._id), d));

    let totalMoney = 0;
    const txItems: any[] = [];

    // 2. Validate Stock & Prepare Data
    for (const it of finalItems) {
      const inv = invMap.get(String(it.itemId));
      
      if (!inv) {
        return res.status(404).json({ error: "Item not found in inventory", itemId: it.itemId });
      }

      if (inv.quantity < it.quantity) {
        return res.status(409).json({
          error: "Insufficient stock",
          itemId: it.itemId,
          available: inv.quantity,
          requested: it.quantity
        });
      }

      const lineTotal = it.quantity * it.price;
      totalMoney += lineTotal;

      txItems.push({
        name: inv.name,
        // Save BOTH formats to prevent Schema validation errors
        qty: it.quantity,
        quantity: it.quantity,
        unit: 'pc',
        unitPrice: it.price,
        price: it.price,
        total: lineTotal
      });
    }

    // 3. Apply Stock Changes (Sequential Updates)
    for (const it of finalItems) {
      await Inventory.updateOne(
        { _id: it.itemId, user: user._id },
        { $inc: { quantity: -it.quantity } }
      );
    }

    // 4. Create Transaction Record
    const createdTx = await Transaction.create({
      user: user._id,
      type: 'SALE',
      paymentStatus: 'PAID',
      items: txItems,
      totalMoney,
      date: getCurrentDateString(),
      timestamp: new Date()
    });

    return res.json({ success: true, transaction: createdTx });

  } catch (error: any) {
    console.error("Record Sale Error:", error?.stack || error);
    // Return detailed error to frontend for easier debugging
    return res.status(500).json({ 
      error: "Server Error", 
      details: error.message || "Unknown Error" 
    });
  }
};


// =====================================================
// 2) GET SALES HISTORY
// =====================================================
export const getSalesHistory = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne();
    if (!user) return res.status(404).json({ error: "User not found" });

    const startDate = String(req.query.startDate || '');
    const endDate = String(req.query.endDate || '');

    const query: any = { user: user._id, type: 'SALE' };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const sales = await Transaction.find(query).sort({ timestamp: -1 });

    const formatted = sales.map((t: any) => ({
      id: t._id,
      date: t.timestamp || t.date || new Date(),
      totalAmount: t.totalMoney || 0,
      items: (t.items || []).map((i: any) => ({
        name: i.name,
        // Handle both schema possibilities
        quantity: i.qty ?? i.quantity ?? 0,
        price: i.unitPrice ?? i.price ?? 0
      }))
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error("Fetch History Error:", error?.stack || error);
    res.status(500).json({ error: "Server Error" });
  }
};


// =====================================================
// 3) GENERATE PDF REPORT
// =====================================================
export const generateSalesReport = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne();
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.planType !== 'TYCOON') {
      return res.status(403).json({ error: 'Upgrade to Tycoon plan to download reports' });
    }

    const businessName = user.businessName || 'My Shop';
    const countryCode = String((user as any).countryCode || 'NG').toUpperCase();
    const currencyCode = COUNTRY_CURRENCY_CODE[countryCode] || 'NGN';

    const startDate = String(req.query.startDate || '');
    const endDate = String(req.query.endDate || '');

    const query: any = { user: user._id, type: 'SALE' };
    if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };

    const transactions = await Transaction.find(query).sort({ timestamp: 1 });
    const totalRevenue = transactions.reduce((sum: number, t: any) => sum + (t.totalMoney || 0), 0);
    const totalTx = transactions.length;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
      autoFirstPage: false
    });

    doc.addPage();

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const contentW = pageW - margin * 2;
    const bottomLimit = pageH - 50;

    const safeStart = startDate || 'all';
    const safeEnd = endDate || 'all';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${safeStart}_${safeEnd}.pdf`);
    doc.pipe(res);

    // Fonts
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
    };

    const drawHeader = () => {
      doc.rect(0, 0, pageW, 70).fill(THEME.dark);
      doc.circle(margin + 15, 35, 14).fill(THEME.primary);
      doc.fillColor(THEME.white).font(boldFont).fontSize(10).text('TP', margin + 7, 31);

      doc.fillColor(THEME.white).fontSize(16).text('TallyPadi', margin + 40, 24);
      doc.fillColor(THEME.muted).fontSize(10).text('Sales Report', margin + 40, 46);

      doc.fillColor(THEME.white).fontSize(12).text(businessName, margin, 24, { width: contentW, align: 'right' });
      doc.fillColor('#94a3b8').fontSize(9).text(
        `Period: ${startDate || 'Start'} to ${endDate || 'Now'}`,
        margin,
        44,
        { width: contentW, align: 'right' }
      );

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

    // Build PDF
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
      const dateStr = t.date || getCurrentDateString();
      const itemText = (t.items || []).map((i: any) => `${i.qty ?? i.quantity} x ${i.name}`).join(', ');
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

  } catch (error: any) {
    console.error('PDF Gen Error:', error?.stack || error);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate report' });
  }
};