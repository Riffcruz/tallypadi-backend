import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// --- Helpers ---
const getCurrentDateString = () => new Date().toISOString().split('T')[0];

/**
 * Accepts numbers OR numeric strings (e.g "2", "6000")
 */
const toNumber = (input: unknown): number | undefined => {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim() !== '') {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const toPositiveInt = (input: unknown): number | undefined => {
  const n = toNumber(input);
  if (n === undefined) return undefined;
  const i = Math.floor(n);
  if (!Number.isFinite(i) || i <= 0) return undefined;
  return i;
};

const toPositiveMoney = (input: unknown): number | undefined => {
  const n = toNumber(input);
  if (n === undefined) return undefined;
  if (n <= 0) return undefined;
  return n;
};

const sanitizeString = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  return s ? s : null;
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
  white: '#FFFFFF',
};

type SaleItemInput = {
  itemId: string;
  quantity: number;
  price: number;
};

const normalizeSalePayload = (body: any): SaleItemInput[] => {
  // Supports:
  // 1) { itemId, quantity, price }
  // 2) { items: [{ itemId, quantity, price }, ...] }
  if (Array.isArray(body?.items)) {
    return body.items
      .map((x: any) => ({
        itemId: sanitizeString(x?.itemId) || '',
        quantity: toPositiveInt(x?.quantity) || 0,
        price: toPositiveMoney(x?.price) || 0,
      }))
      .filter((x: SaleItemInput) => x.itemId && x.quantity > 0 && x.price > 0);
  }

  const itemId = sanitizeString(body?.itemId) || '';
  const quantity = toPositiveInt(body?.quantity) || 0;
  const price = toPositiveMoney(body?.price) || 0;

  if (!itemId || quantity <= 0 || price <= 0) return [];
  return [{ itemId, quantity, price }];
};

// =====================================================
// 1) RECORD A SALE (UPDATED: supports cart items[])
// =====================================================
export const recordSale = async (req: Request, res: Response) => {
  let session: mongoose.ClientSession | null = null;

  try {
    const user = await User.findOne(); // TODO: replace with real auth
    if (!user) return res.status(404).json({ error: "User not found" });

    const items = normalizeSalePayload(req.body);

    if (!items.length) {
      return res.status(400).json({
        error: "Invalid sale data",
        message: "Send { itemId, quantity, price } OR { items: [{ itemId, quantity, price }] } with quantity>0 and price>0",
      });
    }

    // merge duplicates
    const merged = new Map<string, { itemId: string; quantity: number; price: number }>();
    for (const it of items) {
      const key = it.itemId;
      const existing = merged.get(key);
      if (!existing) merged.set(key, { ...it });
      else {
        existing.quantity += it.quantity;
        existing.price = it.price;
      }
    }
    const finalItems = Array.from(merged.values());

    // start transaction if possible
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      session = null;
    }

    // ✅ .session(session) expects ClientSession | null (NOT undefined)
    const invDocs = await Inventory.find({
      _id: { $in: finalItems.map(i => i.itemId) },
      user: user._id,
    }).session(session);

    const invMap = new Map<string, any>();
    invDocs.forEach((d) => invMap.set(String(d._id), d));

    const txItems: any[] = [];
    let totalMoney = 0;

    for (const it of finalItems) {
      const inv = invMap.get(String(it.itemId));
      if (!inv) {
        if (session) await session.abortTransaction();
        return res.status(404).json({ error: "Item not found in inventory", itemId: it.itemId });
      }

      if (inv.quantity < it.quantity) {
        if (session) await session.abortTransaction();
        return res.status(409).json({
          error: "Insufficient stock",
          itemId: it.itemId,
          available: inv.quantity,
          requested: it.quantity,
        });
      }

      const lineTotal = it.quantity * it.price;
      totalMoney += lineTotal;

      txItems.push({
        name: inv.name,
        qty: it.quantity,
        unit: 'pc',
        unitPrice: it.price,
        total: lineTotal,
      });
    }

    // Apply stock decrement
    for (const it of finalItems) {
      if (session) {
        const inv = invMap.get(String(it.itemId));
        inv.quantity -= it.quantity;
        await inv.save({ session }); // ✅ session is ClientSession (not null here)
      } else {
        const r = await Inventory.updateOne(
          { _id: it.itemId, user: user._id, quantity: { $gte: it.quantity } },
          { $inc: { quantity: -it.quantity } }
        );

        if (r.matchedCount === 0) {
          return res.status(409).json({
            error: "Insufficient stock (race condition)",
            itemId: it.itemId,
          });
        }
      }
    }

    // Create transaction (avoid passing undefined/null session)
    let createdTx: any;
    if (session) {
      const docs = await Transaction.create([{
        user: user._id,
        type: 'SALE',
        paymentStatus: 'PAID',
        items: txItems,
        totalMoney,
        date: getCurrentDateString(),
        timestamp: new Date(),
      }], { session });

      createdTx = docs[0];
      await session.commitTransaction();
    } else {
      createdTx = await Transaction.create({
        user: user._id,
        type: 'SALE',
        paymentStatus: 'PAID',
        items: txItems,
        totalMoney,
        date: getCurrentDateString(),
        timestamp: new Date(),
      });
    }

    return res.json({
      success: true,
      transaction: createdTx,
      totalMoney,
      itemsCount: txItems.length,
    });

  } catch (error) {
    console.error("Record Sale Error:", error);
    try {
      if (session) await session.abortTransaction();
    } catch {}
    return res.status(500).json({ error: "Server Error" });
  } finally {
    try {
      if (session) session.endSession();
    } catch {}
  }
};


// =====================================================
// 2) GET SALES HISTORY (same)
// =====================================================
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
        price: i.unitPrice,
      })),
    }));

    res.json(formattedSales);

  } catch (error) {
    console.error("Fetch History Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// =====================================================
// 3) GENERATE PDF REPORT (FIXED doc.page usage)
// =====================================================
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

    const totalRevenue = transactions.reduce((sum: number, t: any) => sum + (t.totalMoney || 0), 0);
    const totalTx = transactions.length;

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

    const formatMoney = (n: number) =>
      `${currencyCode} ${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    // ✅ IMPORTANT FIX: add a page BEFORE reading doc.page.*
    doc.addPage();

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const contentW = pageW - margin * 2;
    const bottomLimit = pageH - 50;

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

    // --- Render ---
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
