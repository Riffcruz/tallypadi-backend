// src/controllers/receipt.controller.ts

import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { PassThrough } from 'stream';

import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model';
import { toUserLocalDate } from '../utils/dates';

// ✅ Currency Mapping
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

// WhatsApp-inspired color palette
const THEME = {
  primary: '#25D366',      // WhatsApp green
  primaryLight: '#DCF8C6', // WhatsApp light green (message bubble)
  primaryDark: '#128C7E',  // Dark WhatsApp green
  secondary: '#34B7F1',    // WhatsApp blue (calls/status)
  accent: '#075E54',       // Dark teal
  dark: '#0C151C',         // Very dark blue/black
  text: '#111B21',         // WhatsApp dark text
  textLight: '#667781',    // WhatsApp gray text
  muted: '#8696A0',        // Medium gray
  border: '#E6E6E6',       // Light border
  bg: '#FFFFFF',           // White background
  bgSoft: '#F0F2F5',       // WhatsApp chat background
  bgHeader: '#F0F2F5',     // Light gray header
  success: '#25D366',      // Green for success
  warning: '#FFC107',      // Amber
  error: '#FF3B30',        // Red
  info: '#34B7F1',         // Blue
};

type PdfDoc = InstanceType<typeof PDFDocument>;

// ✅ REQUIRED FORMAT: 22/12/2025 14:05
function fmtDDMMYYYY_HHMM(d: Date, offsetMinutes: number) {
  const local = toUserLocalDate(d, offsetMinutes);
  const dd = String(local.getDate()).padStart(2, '0');
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const yyyy = String(local.getFullYear());
  const hh = String(local.getHours()).padStart(2, '0');
  const min = String(local.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

// ✅ Receipt number (short & readable)
function makeReceiptNo(saleId: string, when: Date, offsetMinutes: number) {
  const local = toUserLocalDate(when, offsetMinutes);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  const tail = String(saleId || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6)
    .toUpperCase()
    .padStart(6, '0');
  return `TP-${y}${m}${d}-${tail}`;
}

// ✅ Wrap long IDs into multiple lines
function wrapIdLines(id: string, lineLen = 30) {
  const clean = String(id || '').trim();
  if (!clean) return '';
  const parts = clean.match(new RegExp(`.{1,${lineLen}}`, 'g'));
  return parts ? parts.join('\n') : clean;
}

// ✅ Fit text inside width by reducing font size
function fitTextWidth(doc: PdfDoc, text: string, maxWidth: number, maxSize: number = 12, minSize: number = 8) {
  let size = maxSize;
  doc.fontSize(size);
  while (size > minSize && doc.widthOfString(text) > maxWidth) {
    size -= 1;
    doc.fontSize(size);
  }
  return size;
}

// ✅ Register fonts
function registerFonts(doc: PdfDoc) {
  const candidates = [
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
    path.join(process.cwd(), 'src', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
    path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf',
  ];

  const candidatesBold = [
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Bold.ttf'),
    path.join(process.cwd(), 'src', 'assets', 'fonts', 'NotoSans-Bold.ttf'),
    path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Bold.ttf'),
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/opentype/noto/NotoSans-Bold.ttf',
  ];

  let hasNoto = false;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      doc.registerFont('Noto', p);
      hasNoto = true;
      break;
    }
  }

  let hasNotoBold = false;
  for (const p of candidatesBold) {
    if (fs.existsSync(p)) {
      doc.registerFont('NotoBold', p);
      hasNotoBold = true;
      break;
    }
  }

  const regFont = hasNoto ? 'Noto' : 'Helvetica';
  const boldFont = hasNotoBold ? 'NotoBold' : hasNoto ? 'Noto' : 'Helvetica-Bold';

  return { regFont, boldFont, hasNoto };
}

// ✅ Calculate optimal column widths for items table
function calculateColumnWidths(availableWidth: number) {
  return {
    qty: 50,          // Fixed width for quantity
    price: 85,        // Fixed width for price
    total: 95,        // Fixed width for total
    item: availableWidth - 50 - 85 - 95 - 15, // Remaining width for item name
  };
}

// ✅ Draw modern table header
function drawTableHeader(doc: PdfDoc, x: number, y: number, colWidths: any, regFont: string) {
  doc.save();
  
  // Header background - WhatsApp light gray
  doc.rect(x, y, colWidths.qty + colWidths.item + colWidths.price + colWidths.total, 28)
    .fill(THEME.bgHeader);
  
  // Header text
  doc.font(regFont).fontSize(9).fillColor(THEME.textLight);
  
  // QTY
  doc.text('QTY', x + 10, y + 9, { width: colWidths.qty - 20, align: 'left' });
  
  // ITEM
  doc.text('ITEM', x + colWidths.qty + 10, y + 9, { width: colWidths.item - 20, align: 'left' });
  
  // PRICE
  doc.text('PRICE', x + colWidths.qty + colWidths.item + 10, y + 9, { 
    width: colWidths.price - 20, 
    align: 'right' 
  });
  
  // TOTAL
  doc.text('TOTAL', x + colWidths.qty + colWidths.item + colWidths.price + 10, y + 9, { 
    width: colWidths.total - 20, 
    align: 'right' 
  });
  
  // Bottom border
  doc.strokeColor(THEME.border).lineWidth(1);
  doc.moveTo(x, y + 28).lineTo(x + colWidths.qty + colWidths.item + colWidths.price + colWidths.total, y + 28).stroke();
  
  doc.restore();
  return y + 28;
}

// ✅ Draw table row
function drawTableRow(
  doc: PdfDoc, 
  x: number, 
  y: number, 
  colWidths: any, 
  item: any, 
  formatMoney: (n: any) => string,
  regFont: string,
  boldFont: string
): number {
  const qty = Number(item.qty ?? item.quantity ?? 0);
  const name = String(item.name || 'Item');
  const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
  const lineTotal = Number(item.total ?? qty * unitPrice);
  
  // Calculate row height based on item name wrapping
  doc.font(regFont).fontSize(10);
  const nameHeight = doc.heightOfString(name, {
    width: colWidths.item - 20,
    ellipsis: true
  });
  const rowHeight = Math.max(24, nameHeight + 8);
  
  // Draw row background
  doc.save();
  doc.fillColor('#FFFFFF');
  doc.rect(x, y, colWidths.qty + colWidths.item + colWidths.price + colWidths.total, rowHeight).fill();
  doc.restore();
  
  // Draw item name with wrapping
  doc.font(regFont).fontSize(10).fillColor(THEME.text);
  doc.text(name, x + colWidths.qty + 10, y + 6, {
    width: colWidths.item - 20,
    ellipsis: true,
    lineGap: 2
  });
  
  // Draw quantity
  doc.text(qty.toString(), x + 10, y + 6, {
    width: colWidths.qty - 20,
    align: 'left'
  });
  
  // Draw price
  doc.fontSize(9).fillColor(THEME.textLight);
  doc.text(formatMoney(unitPrice), x + colWidths.qty + colWidths.item + 10, y + 6, {
    width: colWidths.price - 20,
    align: 'right'
  });
  
  // Draw total
  doc.fontSize(10).fillColor(THEME.text);
  doc.text(formatMoney(lineTotal), x + colWidths.qty + colWidths.item + colWidths.price + 10, y + 6, {
    width: colWidths.total - 20,
    align: 'right'
  });
  
  // Bottom border
  doc.save();
  doc.strokeColor(THEME.border).lineWidth(0.5);
  doc.moveTo(x, y + rowHeight).lineTo(x + colWidths.qty + colWidths.item + colWidths.price + colWidths.total, y + rowHeight).stroke();
  doc.restore();
  
  return rowHeight;
}

// ✅ Shared render function
function renderReceiptPdf(doc: PdfDoc, payload: {
  saleId: string;
  receiptNo: string;
  businessName: string;
  receiptDate: string;
  currencyCode: string;
  locale: string;
  hasSymbolFont: boolean;
  regFont: string;
  boldFont: string;
  tx: any;
}) {
  const {
    saleId,
    receiptNo,
    businessName,
    receiptDate,
    currencyCode,
    locale,
    hasSymbolFont,
    regFont,
    boldFont,
    tx,
  } = payload;

  // ✅ Currency formatter
  const currencyDisplay = hasSymbolFont ? 'symbol' : 'code';
  const formatMoney = (n: any) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay,
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  // -------------------------------------------------
  // ✅ Page Setup
  // -------------------------------------------------
  doc.addPage();
  const pageW = doc.page.width;
  const margin = 40;
  const contentW = pageW - margin * 2;

  let y = margin;

  // -------------------------------------------------
  // ✅ HEADER (WhatsApp-style)
  // -------------------------------------------------
  doc.save();
  
  // Header background with WhatsApp green gradient
  const headerGradient = doc.linearGradient(margin, y, margin + contentW, y + 80);
  headerGradient.stop(0, THEME.primary);      // Bright WhatsApp green
  headerGradient.stop(1, THEME.primaryDark);  // Darker green
  
  doc.roundedRect(margin, y, contentW, 80, 12)
    .fill(headerGradient);
  
  // Logo/Title
  doc.font(boldFont).fillColor('#FFFFFF').fontSize(20);
  doc.text('TallyPadi', margin + 24, y + 20);
  
  doc.font(regFont).fillColor('#E8FFF3').fontSize(11);
  doc.text('POS RECEIPT', margin + 24, y + 48);
  
  // Payment status badge
  const paymentStatus = String(tx.paymentStatus || 'PAID').toUpperCase();
  const badgeW = Math.max(70, doc.widthOfString(paymentStatus) + 20);
  const badgeH = 26;
  
  doc.save();
  doc.roundedRect(margin + contentW - badgeW - 24, y + 20, badgeW, badgeH, 6)
    .fill('#FFFFFF');
  doc.fillColor(THEME.primary).fontSize(9).font(boldFont);
  doc.text(paymentStatus, margin + contentW - badgeW - 24, y + 28, {
    width: badgeW,
    align: 'center'
  });
  doc.restore();
  
  y += 80 + 20;

  // -------------------------------------------------
  // ✅ BUSINESS INFO CARD (Fixed Padding)
  // -------------------------------------------------
  const infoCardH = 72;
  
  doc.save();
  doc.roundedRect(margin, y, contentW, infoCardH, 12)
    .fill(THEME.bgHeader);
  doc.strokeColor(THEME.border).lineWidth(1);
  doc.roundedRect(margin, y, contentW, infoCardH, 12)
    .stroke();
  doc.restore();
  
  // Business name
  doc.font(boldFont).fillColor(THEME.text).fontSize(14);
  const businessNameSize = fitTextWidth(doc, businessName, contentW - 48, 14, 10);
  doc.fontSize(businessNameSize);
  doc.text(businessName, margin + 20, y + 16, {
    width: contentW - 40,
    ellipsis: true
  });
  
  // Date and Receipt info
  doc.font(regFont).fontSize(10).fillColor(THEME.textLight);
  
  // Left side: Date (20px padding)
  doc.text('Date Issued:', margin + 20, y + 44);
  doc.fillColor(THEME.text).text(receiptDate, margin + 85, y + 44);
  
  // Right side: Receipt No (Fixed: Added 20px padding from right)
  const rightPadding = 20; 
  const receiptLabelWidth = 70;
  const receiptValueWidth = 100; // Increased width for long numbers
  const rightAnchor = margin + contentW - rightPadding;

  // Draw Label
  doc.fillColor(THEME.textLight).text('Receipt No:', rightAnchor - receiptValueWidth - receiptLabelWidth, y + 44, {
    width: receiptLabelWidth,
    align: 'right'
  });

  // Draw Value
  doc.fillColor(THEME.text).text(receiptNo, rightAnchor - receiptValueWidth, y + 44, {
    width: receiptValueWidth,
    align: 'right'
  });
  
  y += infoCardH + 24;

  // -------------------------------------------------
  // ✅ TRANSACTION ID SECTION
  // -------------------------------------------------
  const fullId = String(saleId || tx?._id || '');
  const wrappedId = wrapIdLines(fullId, 32);
  
  doc.font(regFont).fontSize(9).fillColor(THEME.textLight);
  doc.text('TRANSACTION ID', margin, y);
  
  y += 14;
  
  // ID box with WhatsApp message bubble style
  doc.font('Courier').fontSize(9);
  const idBoxH = Math.max(32, doc.heightOfString(wrappedId, {
    width: contentW - 32,
    lineGap: 4
  }) + 16);
  
  doc.save();
  doc.roundedRect(margin, y, contentW, idBoxH, 8)
    .fill(THEME.primaryLight); // WhatsApp message bubble color
  doc.restore();
  
  doc.fillColor(THEME.text);
  doc.text(wrappedId, margin + 16, y + 10, {
    width: contentW - 32,
    lineGap: 4
  });
  
  y += idBoxH + 24;

  // -------------------------------------------------
  // ✅ ITEMS TABLE
  // -------------------------------------------------
  const items = Array.isArray(tx.items) ? tx.items : [];
  const colWidths = calculateColumnWidths(contentW);
  const tableX = margin;
  
  // Table header
  y = drawTableHeader(doc, tableX, y, colWidths, regFont);
  
  // Table rows
  let computedTotal = 0;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = Number(item.total ?? qty * unitPrice);
    computedTotal += lineTotal;
    
    const rowHeight = drawTableRow(doc, tableX, y, colWidths, item, formatMoney, regFont, boldFont);
    y += rowHeight;
  }
  
  // Add some spacing after the table
  y += 20;

  // -------------------------------------------------
  // ✅ TOTAL SECTION (Vertically Centered Fix)
  // -------------------------------------------------
  const totalMoney = Number(tx.totalMoney ?? computedTotal ?? 0);
  const totalBoxH = 68;
  const innerBoxMargin = 12;
  const innerBoxH = totalBoxH - (innerBoxMargin * 2); // 44px height

  // Ensure we have enough space at the bottom
  const minBottomSpace = 60;
  if (y + totalBoxH + minBottomSpace > doc.page.height - margin) {
    doc.addPage();
    y = margin;
  }
  
  // 1. Draw Green Background
  doc.save();
  doc.roundedRect(margin, y, contentW, totalBoxH, 12).fill(THEME.primary);
  
  // 2. Draw White Inner Box
  const innerBoxY = y + innerBoxMargin;
  const innerBoxW = contentW - 24;
  doc.roundedRect(margin + 12, innerBoxY, innerBoxW, innerBoxH, 8).fill('#FFFFFF');
  doc.restore();
  
  // 3. Draw "TOTAL AMOUNT" Label (Vertically Centered)
  doc.font(boldFont).fontSize(12).fillColor(THEME.primaryDark);
  const labelText = 'TOTAL AMOUNT';
  const labelHeight = doc.heightOfString(labelText, { width: innerBoxW / 2 });
  const labelY = innerBoxY + (innerBoxH - labelHeight) / 2; // Mathematical Center

  doc.text(labelText, margin + 24, labelY);
  
  // 4. Draw Total Value (Vertically Centered & Auto-Sized)
  const totalValue = formatMoney(totalMoney);
  doc.font(boldFont).fillColor(THEME.text);
  
  // Calculate available width (Right half of the white box minus padding)
  const totalValueAvailableWidth = (innerBoxW / 2) + 40; 
  
  // Fit text size
  const totalSize = fitTextWidth(doc, totalValue, totalValueAvailableWidth, 22, 14);
  doc.fontSize(totalSize);
  
  // Calculate Text Height & Centered Y Position
  const valHeight = doc.heightOfString(totalValue, { width: totalValueAvailableWidth });
  const valY = innerBoxY + (innerBoxH - valHeight) / 2; 
  
  // Draw Text
  doc.text(totalValue, margin + 24, valY - 1, { // -1 optical adjustment
    width: innerBoxW - 24, 
    align: 'right'
  });
  
  y += totalBoxH + 28;

  // -------------------------------------------------
  // ✅ FOOTER (WhatsApp-style)
  // -------------------------------------------------
  const footerY = doc.page.height - margin - 50;
  
  // WhatsApp-style divider line
  doc.save();
  doc.strokeColor(THEME.border).lineWidth(1);
  doc.moveTo(margin + 60, footerY).lineTo(margin + contentW - 60, footerY).stroke();
  doc.restore();
  
  doc.font(regFont).fontSize(10).fillColor(THEME.textLight);
  doc.text('Thank you for your purchase!', margin, footerY + 12, {
    width: contentW,
    align: 'center'
  });
  
  doc.fontSize(8).fillColor(THEME.muted);
  doc.text('Generated by TallyPadi POS • This is an official receipt', margin, footerY + 28, {
    width: contentW,
    align: 'center'
  });

  // Add page number if multiple pages
  const pageNumber = doc.bufferedPageRange().count;
  if (pageNumber > 1) {
    doc.font(regFont).fontSize(8).fillColor(THEME.muted);
    doc.text(`Page 1 of ${pageNumber}`, margin, doc.page.height - margin + 20, {
      width: contentW,
      align: 'center'
    });
  }
}

// ... (Exports remain the same)
export const generateSaleReceiptPdfBuffer = async (userId: string, saleId: string) => {
  const user: any = await User.findById(userId).lean();
  if (!user) throw new Error('User not found');

  const tx: any = await Transaction.findOne({
    _id: saleId,
    user: userId,
    type: 'SALE',
    isUndone: { $ne: true },
  }).lean();

  if (!tx) throw new Error('Sale not found');

  const offsetMinutes = user?.settings?.utcOffsetMinutes ?? 60;
  const businessName = String(user?.businessName || user?.shopName || 'My Shop');

  const userCountry = String(user?.countryCode || 'NG').toUpperCase();
  const currencyCode = String(user?.currencyCode || COUNTRY_CURRENCY_CODE[userCountry] || 'NGN').toUpperCase();
  const locale = String(user?.locale || 'en-NG');

  const when = new Date(tx.timestamp || tx.createdAt || Date.now());
  const receiptDate = fmtDDMMYYYY_HHMM(when, offsetMinutes);
  const receiptNo = makeReceiptNo(saleId, when, offsetMinutes);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    autoFirstPage: false,
    bufferPages: true,
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
    saleId,
    receiptNo,
    businessName,
    receiptDate,
    currencyCode,
    locale,
    hasSymbolFont: hasNoto,
    regFont,
    boldFont,
    tx,
  });

  doc.end();

  const buffer = await done;
  const filename = `Receipt_${String(saleId).slice(-6)}.pdf`;

  return { buffer, filename, mimeType: 'application/pdf' };
};

export const generateSaleReceiptPdf = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const saleId = String(req.params.saleId || '').trim();
    if (!saleId) return res.status(400).json({ error: 'Missing saleId' });

    const user: any = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ Improved Permission Check: Allow Owner to see Staff sales
    const tx: any = await Transaction.findOne({
      _id: saleId,
      type: 'SALE',
      isUndone: { $ne: true },
    })
    .populate({ path: 'user', select: 'ownerId hqId _id' })
    .lean();

    if (!tx) return res.status(404).json({ error: 'Sale not found' });

    const creator: any = tx.user;
    const creatorId = String(creator?._id || creator);
    
    const creatorOwnerId = creator?.ownerId ? String(creator.ownerId) : null;
    const creatorHqId = creator?.hqId ? String(creator.hqId) : null;
    
    const isAuthorized = 
      creatorId === userId || 
      creatorOwnerId === userId || 
      creatorHqId === userId;

    if (!isAuthorized) return res.status(404).json({ error: 'Sale not found' });

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
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      autoFirstPage: false,
      bufferPages: true,
    }) as unknown as PdfDoc;

    const { regFont, boldFont, hasNoto } = registerFonts(doc);
    doc.font(regFont);

    doc.pipe(res);

    renderReceiptPdf(doc, {
      saleId,
      receiptNo,
      businessName,
      receiptDate,
      currencyCode,
      locale,
      hasSymbolFont: hasNoto,
      regFont,
      boldFont,
      tx,
    });

    doc.end();
  } catch (e: any) {
    console.error('Receipt PDF Error:', e?.stack || e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate receipt' });
  }
};