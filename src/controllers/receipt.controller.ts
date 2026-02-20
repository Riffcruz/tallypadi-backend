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

// ✅ Shared render function (Invoice Style UI)
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
  format: 'A4' | 'thermal';
  exactHeight?: number;
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
    format
  } = payload;

  const currencyDisplay = hasSymbolFont ? 'symbol' : 'code';
  const formatMoney = (n: any) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay,
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  // --- Theme ---
  const THEME_INVOICE = {
    primary: '#0F766E', // Teal
    accent: '#14B8A6',
    dark: '#1E293B',
    text: '#334155',
    muted: '#64748B',
    border: '#E2E8F0',
    bgLight: '#F8FAFC',
    bgHeader: '#F1F5F9',
    white: '#FFFFFF',
    alert: '#EF4444',
  };

  const isThermal = format === 'thermal';

  // --- Page Setup ---
  let pageW = 595.28; // A4
  let pageH = 841.89; // A4
  let topMargin = 40;
  let bottomMargin = 40;
  let sideMargin = 40;

  if (isThermal) {
      pageW = 226; // ~80mm
      topMargin = 10;
      bottomMargin = 0; // Set to 0 to completely disable auto-pagination near bottom
      sideMargin = 10;
      if (payload.exactHeight) {
          pageH = payload.exactHeight;
      } else {
          // Dummy run: use huge page height so it NEVER paginates, letting us capture the true exact height
          pageH = 5000;
      }
  } else {
      bottomMargin = 0; // Disable auto pagination for continuous A4 too
      if (payload.exactHeight) {
          pageH = payload.exactHeight;
      } else {
          pageH = 5000;
      }
  }

  doc.addPage({ 
    size: [pageW, pageH], 
    margins: { top: topMargin, bottom: bottomMargin, left: sideMargin, right: sideMargin } 
  });
  
  // Recalculate based on actual if needed, but we set it explicitly
  const contentW = pageW - sideMargin * 2;
  const margin = sideMargin;

  // --- HEADER ---
  let y = isThermal ? 10 : 40;
  
  if (!isThermal) {
      // Soft header background strip for A4
      doc.save();
      doc.rect(0, 0, pageW, 140).fill(THEME_INVOICE.bgHeader);
      doc.restore();
  }

  // Business name + title
  const headerFontSize = isThermal ? 14 : 22;
  doc.fillColor(THEME_INVOICE.dark).font(boldFont).fontSize(headerFontSize).text(businessName.toUpperCase(), margin, y, {
      align: isThermal ? 'center' : 'left',
      width: isThermal ? contentW : undefined
  });
  
  y += doc.heightOfString(businessName.toUpperCase(), { width: isThermal ? contentW : undefined }) + 5;

  if (isThermal) {
      doc.fillColor(THEME_INVOICE.text).font(regFont).fontSize(10).text('RECEIPT', margin, y, { align: 'center', width: contentW });
      y += 15;
      
      // Meta
      doc.fontSize(9).font(regFont);
      doc.text(receiptDate, margin, y, { align: 'center', width: contentW });
      y += 12;
      doc.text(receiptNo, margin, y, { align: 'center', width: contentW });
      y += 12;
      doc.text(`Customer: ${tx.customerName || 'Guest'}`, margin, y, { align: 'center', width: contentW });
      y += 20;

      // Divider
      doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor(THEME_INVOICE.border).stroke();
      y += 10;

  } else {
      // A4 Header continues
      doc.fillColor(THEME_INVOICE.text).font(regFont).fontSize(11).text('RECEIPT', margin, y);
      doc.fillColor(THEME_INVOICE.muted).font(regFont).fontSize(9).text('Payment Confirmation', margin, y + 16);

      // Logo / badge (right)
      const logoBox = { w: 62, h: 62, x: pageW - margin - 62, y: 38 }; // simplified y
      doc.roundedRect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, 10).fill(THEME_INVOICE.primary);
      doc.fillColor(THEME_INVOICE.white).font(boldFont).fontSize(16).text('TP', logoBox.x, logoBox.y + 20, {
        width: logoBox.w,
        align: 'center',
      });

      // Meta card
      const cardY = 120;
      const cardH = 74;
      doc.roundedRect(margin, cardY, contentW, cardH, 12).lineWidth(1).strokeColor(THEME_INVOICE.border).fill(THEME_INVOICE.white);

      // Left: Customer Name
      const leftX = margin + 14;
      doc.fillColor(THEME_INVOICE.muted).font(boldFont).fontSize(9).text('CUSTOMER', leftX, cardY + 12);
      const custName = tx.customerName || 'Walk-in Customer';
      doc.fillColor(THEME_INVOICE.dark).font(boldFont).fontSize(12).text(custName, leftX, cardY + 28, {
        width: contentW * 0.55,
      });

      // Right: Date & Receipt #
      const rightX = margin + contentW * 0.62;
      doc.fillColor(THEME_INVOICE.muted).font(boldFont).fontSize(9).text('DATE PAID', rightX, cardY + 12);
      doc.fillColor(THEME_INVOICE.dark).font(regFont).fontSize(11).text(receiptDate, rightX, cardY + 28);

      doc.fillColor(THEME_INVOICE.muted).font(boldFont).fontSize(9).text('RECEIPT NO', rightX, cardY + 48);
      doc.fontSize(11);
      const pillW = Math.min(200, Math.max(120, doc.widthOfString(receiptNo) + 22));
      const pillX = pageW - margin - pillW;
      const pillY = cardY + 44;

      doc.roundedRect(pillX, pillY, pillW, 26, 13).fill(THEME_INVOICE.primary);
      doc.fillColor(THEME_INVOICE.white).font(boldFont).fontSize(11).text(receiptNo, pillX, pillY + 7, { width: pillW, align: 'center' });
      
      y = 230; // Start table at 230 for A4
  }

  // --- TABLE ---
  const tableHeaderHeight = isThermal ? 20 : 32;
  const cellPadX = isThermal ? 4 : 8;
  const cellPadY = isThermal ? 4 : 7;
  const fontSizeBody = isThermal ? 9 : 10;

  // Columns
  let colW: any;
  let colX: any;

  if (isThermal) {
      colW = {
        desc: contentW * 0.5,
        qty: contentW * 0.15,
        unit: 0, // skip unit price column if tight, or keep small
        total: contentW * 0.35,
      };
      colX = {
        desc: margin,
        qty: margin + colW.desc,
        unit: margin + colW.desc + colW.qty, // effectively unused if unit width is 0
        total: margin + colW.desc + colW.qty,
      };
  } else {
      colW = {
        desc: Math.floor(contentW * 0.52),
        qty: Math.floor(contentW * 0.12),
        unit: Math.floor(contentW * 0.18),
        total: contentW - (Math.floor(contentW * 0.52) + Math.floor(contentW * 0.12) + Math.floor(contentW * 0.18)),
      };
      colX = {
        desc: margin,
        qty: margin + colW.desc,
        unit: margin + colW.desc + colW.qty,
        total: margin + colW.desc + colW.qty + colW.unit,
      };
  }

  // Header Row
  if (!isThermal) {
      doc.roundedRect(margin, y, contentW, tableHeaderHeight, 10).fill(THEME_INVOICE.primary);
      doc.fillColor(THEME_INVOICE.white).font(boldFont).fontSize(10);
      doc.text('Description', colX.desc + cellPadX, y + 10, { width: colW.desc - cellPadX * 2, align: 'left' });
      doc.text('Qty', colX.qty + cellPadX, y + 10, { width: colW.qty - cellPadX * 2, align: 'center' });
      doc.text('Price', colX.unit + cellPadX, y + 10, { width: colW.unit - cellPadX * 2, align: 'right' });
      doc.text('Total', colX.total + cellPadX, y + 10, { width: colW.total - cellPadX * 2, align: 'right' });
      y += tableHeaderHeight + 2;
  } else {
      // Thermal Header
      doc.font(boldFont).fontSize(9).fillColor(THEME_INVOICE.dark);
      doc.text('Item', colX.desc, y, { width: colW.desc });
      doc.text('Qty', colX.qty, y, { width: colW.qty, align: 'center' });
      doc.text('Total', colX.total, y, { width: colW.total, align: 'right' });
      y += 12;
      doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor(THEME_INVOICE.border).stroke();
      y += 8;
  }

  // Items
  const items = Array.isArray(tx.items) ? tx.items : [];
  let computedTotal = 0;

  items.forEach((item: any, idx: number) => {
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = Number(item.total ?? qty * unitPrice);
    computedTotal += lineTotal;

    const desc = String(item.name || '-');
    
    // Auto height
    const descH = doc.heightOfString(desc, { width: colW.desc - cellPadX * 2 });
    const rowH = Math.max(isThermal ? 16 : 28, Math.ceil(descH + cellPadY * 2));

    // Pagination check
    // Ensure thermal and A4 NEVER paginate by removing the pageH check for it entirely
    // Removed pagination check entirely for continuous flow

    // Zebra
    if (!isThermal) {
        if (idx % 2 === 1) doc.rect(margin, y, contentW, rowH).fill(THEME_INVOICE.bgLight);
        else doc.rect(margin, y, contentW, rowH).fill(THEME_INVOICE.white);
        doc.lineWidth(0.7).strokeColor(THEME_INVOICE.border).rect(margin, y, contentW, rowH).stroke();
    }

    // Cell Text
    doc.fillColor(THEME_INVOICE.dark).font(regFont).fontSize(fontSizeBody);
    
    if (isThermal) {
        doc.text(desc, colX.desc, y, { width: colW.desc });
        doc.text(String(qty), colX.qty, y, { width: colW.qty, align: 'center' });
        doc.text(formatMoney(lineTotal), colX.total, y, { width: colW.total, align: 'right' });
    } else {
        doc.text(desc, colX.desc + cellPadX, y + cellPadY, { width: colW.desc - cellPadX * 2 });
        doc.text(String(qty), colX.qty + cellPadX, y + cellPadY, { width: colW.qty - cellPadX * 2, align: 'center' });
        doc.text(formatMoney(unitPrice), colX.unit + cellPadX, y + cellPadY, { width: colW.unit - cellPadX * 2, align: 'right' });
        doc.text(formatMoney(lineTotal), colX.total + cellPadX, y + cellPadY, { width: colW.total - cellPadX * 2, align: 'right' });
    }

    y += rowH;
  });

  // --- TOTALS ---
  y += 16;

  const totalMoney = Number(tx.totalMoney ?? computedTotal ?? 0);
  const discount = Number(tx.discount ?? 0);
  const netTotal = Number(tx.amountPaid ?? totalMoney - discount);
  const pointsEarned = Number(tx.pointsEarned ?? 0);

  if (isThermal) {
      doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor(THEME_INVOICE.border).stroke();
      y += 10;
      
      if (discount > 0) {
        doc.font(regFont).fontSize(10).fillColor(THEME_INVOICE.dark);
        doc.text(`Subtotal: ${formatMoney(totalMoney)}`, margin, y, { align: 'right', width: contentW });
        y += 14;
        doc.text(`Discount: -${formatMoney(discount)}`, margin, y, { align: 'right', width: contentW });
        y += 14;
      }
      
      doc.font(boldFont).fontSize(12).fillColor(THEME_INVOICE.dark);
      doc.text(`TOTAL: ${formatMoney(netTotal)}`, margin, y, { align: 'right', width: contentW });
      y += 20;
      
      if (pointsEarned > 0) {
        doc.font(boldFont).fontSize(9).fillColor(THEME_INVOICE.dark); // using dark instead of primary to ensure thermal printer contrast
        doc.text(`*** Loyalty Points Earned: ${pointsEarned} ***`, margin, y, { align: 'center', width: contentW });
        y += 16;
      }
  } else {
      const boxLines = 1 + (discount > 0 ? 2 : 0) + (pointsEarned > 0 ? 1 : 0);
      const totalsBoxH = 50 + (boxLines * 16);
      const totalsBoxW = Math.min(260, contentW);
      const totalsBoxX = pageW - margin - totalsBoxW;

      doc.roundedRect(totalsBoxX, y, totalsBoxW, totalsBoxH, 12).fill(THEME_INVOICE.bgHeader);
      doc.rect(totalsBoxX, y, 5, totalsBoxH).fill(THEME_INVOICE.accent);

      let currentY = y + 14;

      if (discount > 0) {
          doc.fillColor(THEME_INVOICE.muted).font(regFont).fontSize(10).text('Subtotal:', totalsBoxX + 16, currentY);
          doc.fillColor(THEME_INVOICE.dark).font(regFont).fontSize(10).text(formatMoney(totalMoney), totalsBoxX + 16, currentY, { width: totalsBoxW - 32, align: 'right' });
          currentY += 16;
          doc.fillColor(THEME_INVOICE.muted).text('Discount:', totalsBoxX + 16, currentY);
          doc.fillColor(THEME_INVOICE.alert).text(`-${formatMoney(discount)}`, totalsBoxX + 16, currentY, { width: totalsBoxW - 32, align: 'right' });
          currentY += 16;
      }

      doc.fillColor(THEME_INVOICE.muted).font(boldFont).fontSize(9).text('TOTAL PAID', totalsBoxX + 16, currentY);
      currentY += 14;
      doc.fillColor(THEME_INVOICE.dark).font(boldFont).fontSize(18).text(formatMoney(netTotal), totalsBoxX + 16, currentY, {
        width: totalsBoxW - 32,
        align: 'right',
      });
      currentY += 24;

      if (pointsEarned > 0) {
          doc.fillColor(THEME_INVOICE.primary).font(boldFont).fontSize(10).text(`★ Loyalty Points Earned: ${pointsEarned}`, totalsBoxX + 16, currentY, { width: totalsBoxW - 32, align: 'right' });
      }

      y += totalsBoxH;
  }

  // --- FOOTER ---
  if (isThermal) {
      y += 10;
      doc.font(regFont).fontSize(8).fillColor(THEME_INVOICE.muted);
      doc.text('Thank you. Powered by TallyPadi.com', margin, y, { align: 'center', width: contentW });
      y += 20; // Final bottom margin cushion
  } else {
      y += 40;
      const footerY = y;
      doc.fontSize(9).fillColor(THEME_INVOICE.muted).text('Thank you.', 0, footerY - 15, { align: 'center' });
      doc.fontSize(8).text('Generated by TallyPadi.com', 0, footerY, { align: 'center' });
      y += 30; // buffer 
  }

  return y;
}

export const generateSaleReceiptPdfBuffer = async (userId: string, saleId: string, format: 'A4' | 'thermal' = 'A4') => {
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

    let exactHeight: number | undefined;
    const dummyDoc = new PDFDocument({ autoFirstPage: false }) as unknown as PdfDoc;
    const { regFont: dReg, boldFont: dBold, hasNoto: dNoto } = registerFonts(dummyDoc);
    exactHeight = renderReceiptPdf(dummyDoc, {
      saleId, receiptNo, businessName, receiptDate, currencyCode, locale, 
      hasSymbolFont: dNoto, regFont: dReg, boldFont: dBold, tx, format
    });

  const doc = new PDFDocument({
    size: 'A4', // Default, will be overridden in render if thermal via addPage
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
    format,
    exactHeight
  });

  doc.end();

  const buffer = await done;
  
  // Create descriptive filename
  const safeShop = (businessName || 'Shop').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const safeCust = (tx.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  const filename = `Receipt_${safeShop}_${safeCust}_${String(saleId).slice(-6)}.pdf`;

  return { buffer, filename, mimeType: 'application/pdf' };
};

export const generateSaleReceiptPdf = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const saleId = String(req.params.saleId || '').trim();
    if (!saleId) return res.status(400).json({ error: 'Missing saleId' });
    const format = String(req.query.format).toLowerCase() === 'thermal' ? 'thermal' : 'A4';

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
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${saleId}${format === 'thermal' ? '_thermal' : ''}.pdf`);

    // ALWAYS CALCULATE EXACT HEIGHT FOR CONTINUOUS SCROLL
    let exactHeight: number | undefined;
    const dummyDoc = new PDFDocument({ autoFirstPage: false }) as unknown as PdfDoc;
    const { regFont: dReg, boldFont: dBold, hasNoto: dNoto } = registerFonts(dummyDoc);
    exactHeight = renderReceiptPdf(dummyDoc, {
      saleId, receiptNo, businessName, receiptDate, currencyCode, locale, 
      hasSymbolFont: dNoto, regFont: dReg, boldFont: dBold, tx, format
    });

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
      format,
      exactHeight
    });

    doc.end();
  } catch (e: any) {
    console.error('Receipt PDF Error:', e?.stack || e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate receipt' });
  }
};