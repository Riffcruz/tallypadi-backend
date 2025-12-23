// src/controllers/receipt.controller.ts
import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { PassThrough } from 'stream';

import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model';

// ✅ Currency Mapping (same style as sales.controller)
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

const THEME = {
  primary: '#0F766E',
  accent: '#14B8A6',
  dark: '#0F172A',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  bg: '#FFFFFF',
  bgSoft: '#F8FAFC',
  bgHeader: '#F1F5F9',
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

// ✅ POS-style dashed divider (NO TS error)
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
function fitRightText(doc: PdfDoc, text: string, x: number, y: number, width: number, maxSize: number, minSize: number) {
  let size = maxSize;
  doc.fontSize(size);
  while (size > minSize && doc.widthOfString(text) > width) {
    size -= 1;
    doc.fontSize(size);
  }
  doc.text(text, x, y, { width, align: 'right' });
}

// ✅ Register fonts (prefer Noto for symbols like ₦, ₵, ₦ etc)
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

// function docToBuffer(doc: PdfDoc): Promise<Buffer> {
//   return new Promise((resolve, reject) => {
//     const stream = new PassThrough();
//     const chunks: Buffer[] = [];
//     stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
//     stream.on('end', () => resolve(Buffer.concat(chunks)));
//     stream.on('error', reject);
//     doc.pipe(stream);
//     doc.end();
//   });
// }

// ✅ Shared render (used by both web download + WhatsApp buffer)
function renderReceiptPdf(doc: PdfDoc, payload: {
  saleId: string;
  businessName: string;
  receiptDate: string;
  currencyCode: string;
  locale: string;
  hasSymbolFont: boolean;
  tx: any;
}) {
  const { saleId, businessName, receiptDate, currencyCode, locale, hasSymbolFont, tx } = payload;

  // ✅ If we have Noto, we can safely use symbol. If not, use CODE to avoid gibberish.
  const currencyDisplay = hasSymbolFont ? 'symbol' : 'code';

  const formatMoney = (n: any) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay,
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  // -------------------------------------------------
  // ✅ Page + Layout
  // -------------------------------------------------
  doc.addPage();
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const contentW = pageW - margin * 2;

  const cardX = margin;
  const cardY = margin;
  const cardW = contentW;
  const cardPad = 18;

  let y = cardY;

  // Card background
  doc.save();
  doc.roundedRect(cardX, y, cardW, doc.page.height - margin * 2, 18).fill(THEME.bg);
  doc.restore();

  // -------------------------------------------------
  // ✅ HEADER (Modern POS)
  // -------------------------------------------------
  doc.save();
  doc.roundedRect(cardX, y, cardW, 72, 18).fill(THEME.dark);
  doc.rect(cardX, y + 36, cardW, 40).fill(THEME.dark);
  doc.restore();

  doc.fillColor('#FFFFFF').fontSize(16).text('TallyPadi', cardX + cardPad, y + 18);
  doc.fillColor('#CBD5E1').fontSize(9).text('POS RECEIPT', cardX + cardPad, y + 40);

  const badgeText = String(tx.paymentStatus || 'PAID').toUpperCase();
  const badgeW = 74;
  const badgeH = 24;

  doc.save();
  doc.roundedRect(cardX + cardW - cardPad - badgeW, y + 22, badgeW, badgeH, 8).fill(THEME.primary);
  doc.fillColor('#FFFFFF').fontSize(9).text(
    badgeText.length > 10 ? badgeText.slice(0, 10) : badgeText,
    cardX + cardW - cardPad - badgeW,
    y + 28,
    { width: badgeW, align: 'center' }
  );
  doc.restore();

  y += 72 + 14;

  // -------------------------------------------------
  // ✅ INFO BOX (Date + Sale ID) contained
  // -------------------------------------------------
  const infoH = 58;
  doc.save();
  doc.roundedRect(cardX + cardPad, y, cardW - cardPad * 2, infoH, 14).fill(THEME.bgSoft);
  doc.restore();

  const infoX = cardX + cardPad + 12;
  const infoW = cardW - cardPad * 2 - 24;

  doc.fillColor(THEME.muted).fontSize(8).text('BUSINESS', infoX, y + 10);
  doc.fillColor(THEME.text).fontSize(11).text(ellipsize(doc, businessName, infoW), infoX, y + 22, { width: infoW });

  doc.fillColor(THEME.muted).fontSize(8).text('DATE', infoX, y + 38);
  doc.fillColor(THEME.text).fontSize(10).text(receiptDate, infoX + 36, y + 36);

  doc.fillColor(THEME.muted).fontSize(8).text('SALE ID', infoX, y + 38, { width: infoW, align: 'right' });

  const paddedId = String(saleId).replace(/[^a-zA-Z0-9]/g, '').slice(-10).padStart(10, '0');
  doc.fillColor(THEME.text).fontSize(10).text(paddedId, infoX, y + 36, { width: infoW, align: 'right' });

  y += infoH + 16;

  // -------------------------------------------------
  // ✅ ITEMS HEADER
  // -------------------------------------------------
  doc.fillColor(THEME.text).fontSize(11).text('ITEMS', cardX + cardPad, y);
  y += 10;

  dashedLine(doc, cardX + cardPad, cardX + cardW - cardPad, y, 3, 3);
  y += 12;

  const colQtyW = 40;
  const colPriceW = 90;
  const colTotalW = 95;
  const colNameW = cardW - cardPad * 2 - colQtyW - colPriceW - colTotalW;

  doc.fillColor(THEME.muted).fontSize(8);
  doc.text('QTY', cardX + cardPad, y, { width: colQtyW, align: 'left' });
  doc.text('ITEM', cardX + cardPad + colQtyW, y, { width: colNameW, align: 'left' });
  doc.text('PRICE', cardX + cardPad + colQtyW + colNameW, y, { width: colPriceW, align: 'right' });
  doc.text('TOTAL', cardX + cardPad + colQtyW + colNameW + colPriceW, y, { width: colTotalW, align: 'right' });

  y += 14;
  doc.fillColor(THEME.border).moveTo(cardX + cardPad, y).lineTo(cardX + cardW - cardPad, y).stroke();
  y += 10;

  const items = Array.isArray(tx.items) ? tx.items : [];
  let computedTotal = 0;

  doc.fillColor(THEME.text).fontSize(10);

  for (const it of items) {
    const qty = Number(it.qty ?? it.quantity ?? 0);
    const name = String(it.name || 'Item');
    const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
    const lineTotal = Number(it.total ?? qty * unitPrice);

    computedTotal += lineTotal;

    const rowH = 18;
    const nameText = ellipsize(doc, name, colNameW);

    doc.fillColor(THEME.text).fontSize(10).text(String(qty), cardX + cardPad, y, { width: colQtyW });
    doc.fillColor(THEME.text).fontSize(10).text(nameText, cardX + cardPad + colQtyW, y, { width: colNameW });

    doc.fillColor(THEME.muted).fontSize(9).text(formatMoney(unitPrice), cardX + cardPad + colQtyW + colNameW, y, {
      width: colPriceW,
      align: 'right',
    });

    doc.fillColor(THEME.text).fontSize(10).text(formatMoney(lineTotal), cardX + cardPad + colQtyW + colNameW + colPriceW, y, {
      width: colTotalW,
      align: 'right',
    });

    y += rowH;

    doc.save();
    doc.strokeColor(THEME.border).lineWidth(0.5);
    doc.moveTo(cardX + cardPad, y).lineTo(cardX + cardW - cardPad, y).stroke();
    doc.restore();

    y += 6;
  }

  // -------------------------------------------------
  // ✅ TOTAL BOX (prevents overflow)
  // -------------------------------------------------
  y += 4;
  dashedLine(doc, cardX + cardPad, cardX + cardW - cardPad, y, 3, 3);
  y += 14;

  const totalBoxH = 58;
  const totalBoxW = cardW - cardPad * 2;
  const totalBoxX = cardX + cardPad;

  doc.save();
  doc.roundedRect(totalBoxX, y, totalBoxW, totalBoxH, 16).fill('#ECFDF5');
  doc.restore();

  const totalMoney = Number(tx.totalMoney ?? computedTotal ?? 0);

  doc.fillColor('#065F46').fontSize(9).text('TOTAL AMOUNT', totalBoxX + 14, y + 12);

  // ✅ Auto-fit (so it NEVER goes outside)
  const value = formatMoney(totalMoney);
  doc.fillColor('#064E3B');
  fitRightText(doc, value, totalBoxX + 14, y + 26, totalBoxW - 28, 16, 11);

  y += totalBoxH + 16;

  // Footer
  doc.fillColor(THEME.muted).fontSize(9).text(
    'Thank you for your purchase.',
    cardX + cardPad,
    y,
    { width: cardW - cardPad * 2, align: 'center' }
  );

  doc.fillColor('#94A3B8').fontSize(8).text(
    'Generated by TallyPadi POS',
    cardX + cardPad,
    y + 14,
    { width: cardW - cardPad * 2, align: 'center' }
  );
}

/**
 * ✅ NEW: Buffer generator for WhatsApp
 * You can call this from your button handler and send the PDF.
 */
function docToBufferWithRender(render: (doc: PdfDoc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
    }) as unknown as PdfDoc;

    // ✅ MUST pipe before render
    doc.pipe(stream);

    try {
      render(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * ✅ Buffer generator for WhatsApp
 */
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

  const receiptDate = fmtDDMMYYYY_HHMM(new Date(tx.timestamp || tx.createdAt || Date.now()), offsetMinutes);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    autoFirstPage: false,     // ✅ IMPORTANT (prevents blank page)
    bufferPages: true,
  }) as unknown as PdfDoc;

  const { regFont, hasNoto } = registerFonts(doc);
  doc.font(regFont);

  // ✅ Pipe BEFORE rendering
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  doc.pipe(stream);

  const done = new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

  // Render (renderReceiptPdf still uses doc.addPage() inside)
  renderReceiptPdf(doc, {
    saleId,
    businessName,
    receiptDate,
    currencyCode,
    locale,
    hasSymbolFont: hasNoto,
    tx,
  });

  doc.end();

  const buffer = await done;
  const filename = `Receipt_${String(saleId).slice(-6)}.pdf`;

  return { buffer, filename, mimeType: 'application/pdf' };
};



/**
 * ✅ EXISTING: Web dashboard download endpoint
 */
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

    const receiptDate = fmtDDMMYYYY_HHMM(new Date(tx.timestamp || tx.createdAt || Date.now()), offsetMinutes);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${saleId}.pdf`);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      autoFirstPage: false,     // ✅ IMPORTANT (prevents blank page)
      bufferPages: true,
    }) as unknown as PdfDoc;

    const { regFont, hasNoto } = registerFonts(doc);
    doc.font(regFont);

    doc.pipe(res);

    renderReceiptPdf(doc, {
      saleId,
      businessName,
      receiptDate,
      currencyCode,
      locale,
      hasSymbolFont: hasNoto,
      tx,
    });

    doc.end();
  } catch (e: any) {
    console.error('Receipt PDF Error:', e?.stack || e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate receipt' });
  }
};

