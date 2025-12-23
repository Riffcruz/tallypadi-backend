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

// Modern color palette
const THEME = {
  primary: '#0F766E',
  primaryLight: '#14B8A6',
  accent: '#8B5CF6',
  dark: '#1E293B',
  text: '#0F172A',
  textLight: '#475569',
  muted: '#64748B',
  border: '#E2E8F0',
  bg: '#FFFFFF',
  bgSoft: '#F8FAFC',
  bgHeader: '#F1F5F9',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

type PdfDoc = InstanceType<typeof PDFDocument>;

function toUserLocalDate(d: any, offsetMinutes: number) {
  return new Date(new Date(d).getTime() + offsetMinutes * 60_000);
}

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

// ✅ POS-style dashed divider
function dashedLine(doc: PdfDoc, x1: number, x2: number, y: number, dash = 3, gap = 2) {
  let x = x1;
  doc.save();
  doc.lineWidth(1);
  doc.strokeColor(THEME.border);
  while (x < x2) {
    doc.moveTo(x, y).lineTo(Math.min(x + dash, x2), y).stroke();
    x += dash + gap;
  }
  doc.restore();
}

// ✅ Text clamp to avoid overflow
function ellipsize(doc: PdfDoc, text: string, maxWidth: number) {
  const s = String(text || '');
  if (doc.widthOfString(s) <= maxWidth) return s;
  let out = s;
  while (out.length > 2 && doc.widthOfString(out + '…') > maxWidth) out = out.slice(0, -1);
  return out + '…';
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
    qty: 60,          // Fixed width for quantity
    price: 100,       // Fixed width for price
    total: 100,       // Fixed width for total
    item: availableWidth - 60 - 100 - 100 - 20, // Remaining width for item name (minus padding)
  };
}

// ✅ Draw modern table header
function drawTableHeader(doc: PdfDoc, x: number, y: number, colWidths: any, regFont: string) {
  doc.save();
  
  // Header background
  doc.rect(x, y, colWidths.qty + colWidths.item + colWidths.price + colWidths.total, 24)
    .fill(THEME.bgHeader);
  
  // Header text
  doc.font(regFont).fontSize(9).fillColor(THEME.textLight);
  
  // QTY
  doc.text('QTY', x + 8, y + 8, { width: colWidths.qty - 16, align: 'left' });
  
  // ITEM
  doc.text('ITEM', x + colWidths.qty + 8, y + 8, { width: colWidths.item - 16, align: 'left' });
  
  // PRICE
  doc.text('PRICE', x + colWidths.qty + colWidths.item + 8, y + 8, { 
    width: colWidths.price - 16, 
    align: 'right' 
  });
  
  // TOTAL
  doc.text('TOTAL', x + colWidths.qty + colWidths.item + colWidths.price + 8, y + 8, { 
    width: colWidths.total - 16, 
    align: 'right' 
  });
  
  // Bottom border
  doc.strokeColor(THEME.border).lineWidth(1);
  doc.moveTo(x, y + 24).lineTo(x + colWidths.qty + colWidths.item + colWidths.price + colWidths.total, y + 24).stroke();
  
  doc.restore();
  return y + 24;
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
    width: colWidths.item - 16,
    ellipsis: true
  });
  const rowHeight = Math.max(20, nameHeight + 8);
  
  // Draw row background (alternating for better readability)
  doc.save();
  doc.fillColor('#FFFFFF');
  doc.rect(x, y, colWidths.qty + colWidths.item + colWidths.price + colWidths.total, rowHeight).fill();
  doc.restore();
  
  // Draw item name with wrapping
  doc.font(regFont).fontSize(10).fillColor(THEME.text);
  doc.text(name, x + colWidths.qty + 8, y + 4, {
    width: colWidths.item - 16,
    ellipsis: true,
    lineGap: 2
  });
  
  // Draw quantity
  doc.text(qty.toString(), x + 8, y + 4, {
    width: colWidths.qty - 16,
    align: 'left'
  });
  
  // Draw price
  doc.fontSize(9).fillColor(THEME.textLight);
  doc.text(formatMoney(unitPrice), x + colWidths.qty + colWidths.item + 8, y + 4, {
    width: colWidths.price - 16,
    align: 'right'
  });
  
  // Draw total
  doc.fontSize(10).fillColor(THEME.text);
  doc.text(formatMoney(lineTotal), x + colWidths.qty + colWidths.item + colWidths.price + 8, y + 4, {
    width: colWidths.total - 16,
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
  const margin = 48; // Increased margin for better spacing
  const contentW = pageW - margin * 2;

  let y = margin;

  // -------------------------------------------------
  // ✅ HEADER (Modern Design)
  // -------------------------------------------------
  doc.save();
  
  // Header background with gradient effect
  doc.rect(margin, y, contentW, 80)
    .fill(THEME.dark);
  
  // Logo/Title
  doc.font(boldFont).fillColor('#FFFFFF').fontSize(20);
  doc.text('TallyPadi', margin + 24, y + 20);
  
  doc.font(regFont).fillColor('#CBD5E1').fontSize(11);
  doc.text('POS RECEIPT', margin + 24, y + 48);
  
  // Receipt number badge
  const badgeW = doc.widthOfString(receiptNo) + 32;
  const badgeH = 28;
  
  doc.save();
  doc.roundedRect(margin + contentW - badgeW - 24, y + 20, badgeW, badgeH, 6)
    .fill(THEME.primaryLight);
  doc.fillColor('#FFFFFF').fontSize(10).font(boldFont);
  doc.text(receiptNo, margin + contentW - badgeW - 24, y + 26, {
    width: badgeW,
    align: 'center'
  });
  doc.restore();
  
  y += 80 + 24;

  // -------------------------------------------------
  // ✅ BUSINESS INFO CARD
  // -------------------------------------------------
  const infoCardH = 70;
  
  doc.save();
  doc.roundedRect(margin, y, contentW, infoCardH, 12)
    .fill(THEME.bgSoft);
  
  // Add subtle border
  doc.strokeColor(THEME.border).lineWidth(1);
  doc.roundedRect(margin, y, contentW, infoCardH, 12)
    .stroke();
  doc.restore();
  
  // Business name
  doc.font(boldFont).fillColor(THEME.text).fontSize(14);
  const businessNameSize = fitTextWidth(doc, businessName, contentW - 48, 14, 10);
  doc.fontSize(businessNameSize);
  doc.text(businessName, margin + 24, y + 16, {
    width: contentW - 48,
    ellipsis: true
  });
  
  // Date and Receipt info
  doc.font(regFont).fontSize(10).fillColor(THEME.textLight);
  doc.text('Date:', margin + 24, y + 42);
  doc.fillColor(THEME.text).text(receiptDate, margin + 60, y + 42);
  
  doc.fillColor(THEME.textLight).text('Receipt No:', margin + contentW - 160, y + 42);
  doc.fillColor(THEME.text).text(receiptNo, margin + contentW - 100, y + 42, {
    width: 100,
    align: 'right'
  });
  
  y += infoCardH + 20;

  // -------------------------------------------------
  // ✅ TRANSACTION ID SECTION
  // -------------------------------------------------
  const fullId = String(saleId || tx?._id || '');
  const wrappedId = wrapIdLines(fullId, 32);
  
  doc.font(regFont).fontSize(9).fillColor(THEME.textLight);
  doc.text('TRANSACTION ID', margin, y);
  
  y += 14;
  
  // ID box with proper height calculation
  doc.font('Courier').fontSize(9);
  const idBoxH = Math.max(28, doc.heightOfString(wrappedId, {
    width: contentW,
    lineGap: 4
  }) + 16);
  
  doc.save();
  doc.roundedRect(margin, y, contentW, idBoxH, 8)
    .fill('#F0F9FF');
  doc.strokeColor(THEME.border).lineWidth(1);
  doc.roundedRect(margin, y, contentW, idBoxH, 8)
    .stroke();
  doc.restore();
  
  doc.fillColor(THEME.text);
  doc.text(wrappedId, margin + 16, y + 8, {
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
  
  for (const item of items) {
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = Number(item.total ?? qty * unitPrice);
    computedTotal += lineTotal;
    
    const rowHeight = drawTableRow(doc, tableX, y, colWidths, item, formatMoney, regFont, boldFont);
    y += rowHeight;
  }
  
  // Add some spacing after the table
  y += 16;

  // -------------------------------------------------
  // ✅ TOTAL SECTION (Modern Card)
  // -------------------------------------------------
  const totalMoney = Number(tx.totalMoney ?? computedTotal ?? 0);
  const totalBoxH = 60;
  
  doc.save();
  // Gradient-like background
  const gradient = doc.linearGradient(margin, y, margin + contentW, y + totalBoxH);
  gradient.stop(0, THEME.primaryLight + '20'); // 20% opacity
  gradient.stop(1, THEME.primary + '10');
  
  doc.roundedRect(margin, y, contentW, totalBoxH, 12)
    .fill(gradient);
  
  // Border
  doc.strokeColor(THEME.primaryLight).lineWidth(1);
  doc.roundedRect(margin, y, contentW, totalBoxH, 12)
    .stroke();
  doc.restore();
  
  // Total label
  doc.font(boldFont).fontSize(12).fillColor(THEME.primary);
  doc.text('TOTAL AMOUNT', margin + 24, y + 16);
  
  // Total value
  const totalValue = formatMoney(totalMoney);
  doc.font(boldFont).fillColor(THEME.dark);
  
  // Fit text to avoid overflow
  const totalSize = fitTextWidth(doc, totalValue, contentW - 100, 24, 16);
  doc.fontSize(totalSize);
  doc.text(totalValue, margin + 24, y + 36, {
    width: contentW - 48,
    align: 'right'
  });
  
  y += totalBoxH + 32;

  // -------------------------------------------------
  // ✅ FOOTER
  // -------------------------------------------------
  const footerY = doc.page.height - margin - 40;
  
  // Divider
  dashedLine(doc, margin, margin + contentW, footerY, 4, 3);
  
  doc.font(regFont).fontSize(10).fillColor(THEME.textLight);
  doc.text('Thank you for your business!', margin, footerY + 12, {
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

// ✅ Buffer generator for WhatsApp (unchanged, but uses updated render function)
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

// ✅ EXISTING: Web dashboard download endpoint
export const generateSaleReceiptPdf = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const saleId = String(req.params.saleId || '').trim();
    if (!saleId) return res.status(400).json({ error: 'Missing saleId' });

    const user: any = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tx: any = await Transaction.findOne({
      _id: saleId,
      user: userId,
      type: 'SALE',
      isUndone: { $ne: true },
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