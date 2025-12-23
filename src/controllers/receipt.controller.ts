// src/controllers/receipt.controller.ts
import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { PassThrough } from 'stream';

import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model';

// ✅ Currency Mapping
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

// ✅ Modern Theme (Slate & Emerald)
const THEME = {
  primary: '#10B981',    // Emerald 500
  primaryDark: '#047857', // Emerald 700
  bgCanvas: '#F1F5F9',   // Slate 100
  bgCard: '#FFFFFF',
  textMain: '#1E293B',   // Slate 800
  textMuted: '#64748B',  // Slate 500
  border: '#E2E8F0',     // Slate 200
  headerBg: '#F8FAFC',   // Slate 50
};

type PdfDoc = InstanceType<typeof PDFDocument>;

// ------------------------------------------------------------------
// 🛠 HELPER FUNCTIONS
// ------------------------------------------------------------------

function toUserLocalDate(d: any, offsetMinutes: number) {
  return new Date(new Date(d).getTime() + offsetMinutes * 60_000);
}

function fmtDDMMYYYY_HHMM(d: Date, offsetMinutes: number) {
  const local = toUserLocalDate(d, offsetMinutes);
  const dd = String(local.getDate()).padStart(2, '0');
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const yyyy = String(local.getFullYear());
  const hh = String(local.getHours()).padStart(2, '0');
  const min = String(local.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function makeReceiptNo(saleId: string, when: Date, offsetMinutes: number) {
  const local = toUserLocalDate(when, offsetMinutes);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  const tail = String(saleId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase().padStart(6, '0');
  return `TP-${y}${m}${d}-${tail}`;
}

/**
 * Calculates the necessary height for a row based on text wrapping
 */
function getRowHeight(doc: PdfDoc, text: string, width: number, fontSize: number, padding: number) {
  doc.fontSize(fontSize);
  const h = doc.heightOfString(text, { width });
  return h + padding;
}

function registerFonts(doc: PdfDoc) {
  // Define font paths (adjust based on your project structure)
  const fontPaths = [
    path.join(process.cwd(), 'assets', 'fonts'),
    path.join(__dirname, '..', 'assets', 'fonts'),
    '/usr/share/fonts/truetype/noto',
  ];

  const findFont = (name: string) => {
    for (const p of fontPaths) {
      const fullPath = path.join(p, name);
      if (fs.existsSync(fullPath)) return fullPath;
    }
    return null;
  };

  const regularPath = findFont('NotoSans-Regular.ttf');
  const boldPath = findFont('NotoSans-Bold.ttf');

  if (regularPath) doc.registerFont('Noto', regularPath);
  if (boldPath) doc.registerFont('NotoBold', boldPath);

  return {
    regFont: regularPath ? 'Noto' : 'Helvetica',
    boldFont: boldPath ? 'NotoBold' : regularPath ? 'Noto' : 'Helvetica-Bold',
    hasNoto: !!regularPath
  };
}

// ------------------------------------------------------------------
// 🎨 MAIN RENDERER
// ------------------------------------------------------------------

function renderReceiptPdf(doc: PdfDoc, payload: {
  saleId: string; receiptNo: string; businessName: string;
  receiptDate: string; currencyCode: string; locale: string;
  hasSymbolFont: boolean; regFont: string; boldFont: string; tx: any;
}) {
  const {
    saleId, receiptNo, businessName, receiptDate,
    currencyCode, locale, hasSymbolFont, regFont, boldFont, tx
  } = payload;

  const currencyDisplay = hasSymbolFont ? 'symbol' : 'code';
  const formatMoney = (n: any) => new Intl.NumberFormat(locale, {
    style: 'currency', currency: currencyCode, currencyDisplay,
    maximumFractionDigits: 0,
  }).format(Number(n || 0));

  // -- Layout Constants --
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 40;
  
  // Card dimensions (Centered on A4)
  const cardWidth = 480; 
  const cardX = (pageWidth - cardWidth) / 2;
  const contentWidth = cardWidth - 40; // 20px padding left/right
  const contentX = cardX + 20;

  let y = margin + 20;

  // -- Background Canvas --
  doc.rect(0, 0, pageWidth, pageHeight).fill(THEME.bgCanvas);

  // -- Draw Card Background (Initially) --
  // We draw a long white rectangle. We will close it at the end or on page break.
  const drawCardBackground = () => {
    doc.save();
    // Shadow simulation
    doc.roundedRect(cardX + 2, margin + 22, cardWidth, pageHeight - margin * 2, 4).fill('#CBD5E1');
    // Main Card
    doc.roundedRect(cardX, margin + 20, cardWidth, pageHeight - margin * 2, 4).fill(THEME.bgCard);
    doc.restore();
  };
  
  drawCardBackground();

  // ----------------------------------
  // 1. HEADER
  // ----------------------------------
  // Business Name
  doc.font(boldFont).fontSize(16).fillColor(THEME.textMain)
     .text(businessName, contentX, y, { width: contentWidth, align: 'center' });
  y += 24;

  // Subtitle
  doc.font(regFont).fontSize(9).fillColor(THEME.textMuted)
     .text('SALES RECEIPT', contentX, y, { width: contentWidth, align: 'center' });
  y += 20;

  // Divider
  doc.strokeColor(THEME.border).lineWidth(1)
     .moveTo(contentX, y).lineTo(contentX + contentWidth, y).stroke();
  y += 15;

  // ----------------------------------
  // 2. META DATA GRID
  // ----------------------------------
  const col1X = contentX;
  const col2X = contentX + (contentWidth / 2);
  
  doc.fontSize(8).fillColor(THEME.textMuted).text('RECEIPT NO', col1X, y);
  doc.fontSize(8).fillColor(THEME.textMuted).text('DATE', col2X, y);
  y += 12;

  doc.font(boldFont).fontSize(10).fillColor(THEME.textMain).text(receiptNo, col1X, y);
  doc.font(regFont).fontSize(10).fillColor(THEME.textMain).text(receiptDate, col2X, y);
  y += 20;

  // Payment Status Badge
  const status = String(tx.paymentStatus || 'PAID').toUpperCase();
  const badgeColor = status === 'PAID' ? THEME.primary : '#EF4444'; // Green or Red
  
  doc.save();
  doc.roundedRect(col1X, y, 60, 18, 9).fill(badgeColor);
  doc.fillColor('#FFFFFF').fontSize(8).font(boldFont)
     .text(status, col1X, y + 5, { width: 60, align: 'center' });
  doc.restore();
  
  y += 30;

  // ----------------------------------
  // 3. ITEMS TABLE (The Robust Part)
  // ----------------------------------
  
  // Table Configuration
  const colQtyW = 40;
  const colTotalW = 80;
  const colNameW = contentWidth - colQtyW - colTotalW; // Remaining space
  
  const xQty = contentX;
  const xName = contentX + colQtyW;
  const xTotal = contentX + colQtyW + colNameW;

  // Table Header
  doc.save();
  doc.rect(contentX, y, contentWidth, 24).fill(THEME.headerBg);
  doc.fillColor(THEME.textMain).font(boldFont).fontSize(9);
  doc.text('QTY', xQty + 5, y + 7, { width: colQtyW });
  doc.text('ITEM', xName + 5, y + 7, { width: colNameW });
  doc.text('TOTAL', xTotal - 5, y + 7, { width: colTotalW, align: 'right' });
  doc.restore();
  y += 24;

  const items = Array.isArray(tx.items) ? tx.items : [];
  let computedTotal = 0;

  doc.font(regFont).fontSize(9).fillColor(THEME.textMain);

  for (const it of items) {
    const qty = Number(it.qty ?? it.quantity ?? 0);
    const name = String(it.name || 'Item');
    const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
    const lineTotal = Number(it.total ?? qty * unitPrice);
    computedTotal += lineTotal;

    // ✅ DYNAMIC HEIGHT CALCULATION
    // Calculate how tall the name text is given the column width
    const nameHeight = doc.heightOfString(name, { width: colNameW - 10 }); 
    const rowHeight = Math.max(nameHeight, 20) + 14; // Add padding

    // Check for page break
    if (y + rowHeight > pageHeight - margin - 40) {
      doc.addPage();
      doc.rect(0, 0, pageWidth, pageHeight).fill(THEME.bgCanvas);
      drawCardBackground();
      y = margin + 40;
    }

    // Draw Qty
    doc.text(String(qty), xQty + 5, y + 7, { width: colQtyW, align: 'left' });

    // Draw Name (allow wrapping)
    doc.text(name, xName + 5, y + 7, { width: colNameW - 10, align: 'left' });

    // Draw Price (Top aligned)
    doc.text(formatMoney(lineTotal), xTotal - 5, y + 7, { width: colTotalW, align: 'right' });

    // Subtitle for Unit Price (Optional, below name)
    if (qty > 1) {
        doc.fontSize(7).fillColor(THEME.textMuted)
           .text(`@ ${formatMoney(unitPrice)}`, xName + 5, y + 7 + nameHeight + 2);
        doc.fontSize(9).fillColor(THEME.textMain); // Reset
    }

    // Border Bottom
    doc.save();
    doc.strokeColor(THEME.border).lineWidth(0.5)
       .moveTo(contentX, y + rowHeight)
       .lineTo(contentX + contentWidth, y + rowHeight).stroke();
    doc.restore();

    y += rowHeight;
  }

  y += 10;

  // ----------------------------------
  // 4. TOTALS
  // ----------------------------------
  const totalMoney = Number(tx.totalMoney ?? computedTotal ?? 0);
  const totalBoxX = contentX + (contentWidth / 2); // Start at middle
  const totalBoxW = contentWidth / 2;

  // Total Label
  doc.font(boldFont).fontSize(10).text('TOTAL AMOUNT', totalBoxX, y, { width: totalBoxW, align: 'left' });
  
  // Total Value
  doc.fontSize(14).fillColor(THEME.primaryDark)
     .text(formatMoney(totalMoney), totalBoxX, y - 2, { width: totalBoxW, align: 'right' });

  y += 30;

  // ----------------------------------
  // 5. FOOTER
  // ----------------------------------
  // Transaction ID Box
  doc.save();
  doc.roundedRect(contentX, y, contentWidth, 30, 4).fill(THEME.headerBg);
  doc.restore();

  const fullId = String(saleId || tx?._id || '');
  doc.font('Courier').fontSize(8).fillColor(THEME.textMuted)
     .text(`TX: ${fullId}`, contentX + 10, y + 10, { width: contentWidth - 20, align: 'center', lineBreak: false });

  y += 40;

  doc.font(regFont).fontSize(8).fillColor(THEME.textMuted)
     .text('Thank you for your patronage.', contentX, y, { width: contentWidth, align: 'center' });
}


// ------------------------------------------------------------------
// 🚀 CONTROLLERS
// ------------------------------------------------------------------

export const generateSaleReceiptPdfBuffer = async (userId: string, saleId: string) => {
  const user: any = await User.findById(userId).lean();
  if (!user) throw new Error('User not found');

  const tx: any = await Transaction.findOne({
    _id: saleId, user: userId, type: 'SALE', isUndone: { $ne: true },
  }).lean();
  if (!tx) throw new Error('Sale not found');

  // Config
  const offsetMinutes = user?.settings?.utcOffsetMinutes ?? 60;
  const businessName = String(user?.businessName || user?.shopName || 'My Shop');
  const userCountry = String(user?.countryCode || 'NG').toUpperCase();
  const currencyCode = String(user?.currencyCode || COUNTRY_CURRENCY_CODE[userCountry] || 'NGN').toUpperCase();
  const locale = String(user?.locale || 'en-NG');

  const when = new Date(tx.timestamp || tx.createdAt || Date.now());
  const receiptDate = fmtDDMMYYYY_HHMM(when, offsetMinutes);
  const receiptNo = makeReceiptNo(saleId, when, offsetMinutes);

  // Doc setup
  const doc = new PDFDocument({
    size: 'A4', margin: 0, // Manual margins for full canvas control
    autoFirstPage: true, bufferPages: true,
  }) as unknown as PdfDoc;

  const { regFont, boldFont, hasNoto } = registerFonts(doc);
  doc.font(regFont);

  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  doc.pipe(stream);

  const done = new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

  renderReceiptPdf(doc, {
    saleId, receiptNo, businessName, receiptDate,
    currencyCode, locale, hasSymbolFont: hasNoto,
    regFont, boldFont, tx,
  });

  doc.end();
  const buffer = await done;
  return { buffer, filename: `Receipt_${String(saleId).slice(-6)}.pdf`, mimeType: 'application/pdf' };
};

export const generateSaleReceiptPdf = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const saleId = String(req.params.saleId || '').trim();
    if (!saleId) return res.status(400).json({ error: 'Missing saleId' });

    const user: any = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tx: any = await Transaction.findOne({
      _id: saleId, user: userId, type: 'SALE', isUndone: { $ne: true },
    }).lean();

    if (!tx) return res.status(404).json({ error: 'Sale not found' });

    const offsetMinutes = user?.settings?.utcOffsetMinutes ?? 60;
    const businessName = String(user?.businessName || user?.shopName || 'My Shop');
    const userCountry = String(user?.countryCode || 'NG').toUpperCase();
    const currencyCode = String(user?.currencyCode || COUNTRY_CURRENCY_CODE[userCountry] || 'NGN').toUpperCase();
    const locale = String(user?.locale || 'en-NG');
    const when = new Date(tx.timestamp || tx.createdAt || Date.now());
    const receiptDate = fmtDDMMYYYY_HHMM(when, offsetMinutes);
    const receiptNo = makeReceiptNo(saleId, when, offsetMinutes);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${saleId}.pdf`);

    const doc = new PDFDocument({
      size: 'A4', margin: 0, 
      autoFirstPage: true, bufferPages: true,
    }) as unknown as PdfDoc;

    const { regFont, boldFont, hasNoto } = registerFonts(doc);
    doc.font(regFont);

    doc.pipe(res);

    renderReceiptPdf(doc, {
      saleId, receiptNo, businessName, receiptDate,
      currencyCode, locale, hasSymbolFont: hasNoto,
      regFont, boldFont, tx,
    });

    doc.end();
  } catch (e: any) {
    console.error('Receipt PDF Error:', e?.stack || e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate receipt' });
  }
};