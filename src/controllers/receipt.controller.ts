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

// POS Constants
const POS_WIDTH = 227; // ~80mm
const POS_MARGIN = 10;
const CONTENT_WIDTH = POS_WIDTH - (POS_MARGIN * 2);

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

// ✅ Shared render function (POS Style UI)
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
}, isDryRun: boolean = false): number {
  const {
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

  const currencyDisplay = hasSymbolFont ? 'symbol' : 'code';
  const formatMoney = (n: any) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay,
      maximumFractionDigits: 0,
    }).format(Number(n || 0));

  const margin = POS_MARGIN;
  let y = margin; // Start at top

  // --- HEADER ---
  // Business Name
  doc.font(boldFont).fontSize(14);
  if (!isDryRun) doc.text(businessName.toUpperCase(), margin, y, { width: CONTENT_WIDTH, align: 'center' });
  y += doc.heightOfString(businessName.toUpperCase(), { width: CONTENT_WIDTH }) + 4;

  // Title
  doc.font(regFont).fontSize(10);
  if (!isDryRun) doc.text('RECEIPT', margin, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 14;

  // Meta
  doc.font(regFont).fontSize(9);
  
  if (!isDryRun) doc.text('Date:', margin, y);
  if (!isDryRun) doc.text(receiptDate, margin + 30, y, { align: 'left' });
  if (!isDryRun) doc.text(receiptNo, margin, y, { width: CONTENT_WIDTH, align: 'right' });
  y += 14;

  const custName = tx.customerName || 'Walk-in Customer';
  if (!isDryRun) doc.text('Customer:', margin, y);
  if (!isDryRun) doc.font(boldFont).text(custName, margin + 45, y, { width: CONTENT_WIDTH - 45 });
  
  // Measure customer name height in case it wraps
  doc.font(boldFont).fontSize(9);
  y += doc.heightOfString(custName, { width: CONTENT_WIDTH - 45 }) + 4;

  // Divider
  if (!isDryRun) {
    doc.moveTo(margin, y).lineTo(POS_WIDTH - margin, y).strokeColor(THEME.border).stroke();
  }
  y += 8;

  // --- TABLE HEADER ---
  const colW = {
    qty: 25,
    total: 50,
    desc: CONTENT_WIDTH - 75
  };
  const colX = {
    qty: margin,
    desc: margin + 25,
    total: margin + 25 + colW.desc
  };

  doc.font(boldFont).fontSize(9);
  if (!isDryRun) {
    doc.text('Qty', colX.qty, y, { width: colW.qty, align: 'left' });
    doc.text('Item', colX.desc, y, { width: colW.desc, align: 'left' });
    doc.text('Total', colX.total, y, { width: colW.total, align: 'right' });
  }
  y += 14;

  if (!isDryRun) {
    doc.moveTo(margin, y).lineTo(POS_WIDTH - margin, y).strokeColor(THEME.border).stroke();
  }
  y += 6;

  // --- ITEMS ---
  const items = Array.isArray(tx.items) ? tx.items : [];
  let computedTotal = 0;

  doc.font(regFont).fontSize(9);

  items.forEach((item: any) => {
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = Number(item.total ?? qty * unitPrice);
    computedTotal += lineTotal;

    const desc = String(item.name || '-');
    const descH = doc.heightOfString(desc, { width: colW.desc });
    const rowH = Math.max(14, descH);

    if (!isDryRun) {
      doc.text(String(qty), colX.qty, y, { width: colW.qty, align: 'center' });
      doc.text(desc, colX.desc, y, { width: colW.desc, align: 'left' });
      doc.text(formatMoney(lineTotal), colX.total, y, { width: colW.total, align: 'right' });
    }

    y += rowH + 6;
  });

  if (!isDryRun) {
    doc.moveTo(margin, y).lineTo(POS_WIDTH - margin, y).strokeColor(THEME.border).stroke();
  }
  y += 8;

  // --- TOTALS ---
  const totalMoney = Number(tx.totalMoney ?? computedTotal ?? 0);
  
  doc.font(boldFont).fontSize(12);
  if (!isDryRun) {
    doc.text('TOTAL PAID:', margin, y);
    doc.text(formatMoney(totalMoney), margin, y, { width: CONTENT_WIDTH, align: 'right' });
  }
  y += 20;

  // --- FOOTER ---
  y += 15;
  doc.font(regFont).fontSize(8).fillColor(THEME.muted);
  if (!isDryRun) doc.text('Thank you for your business.', margin, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 12;
  if (!isDryRun) doc.text('Generated by TallyPadi.com', margin, y, { width: CONTENT_WIDTH, align: 'center' });
  y += 10;

  return y + margin; // Total Height
}

// ✅ Helper to Calculate Height
const calculateReceiptHeight = (payload: any): number => {
  const doc = new PDFDocument({ size: [POS_WIDTH, 2000], margin: POS_MARGIN });
  const { regFont, boldFont, hasNoto } = registerFonts(doc as any);
  
  payload.hasSymbolFont = hasNoto;
  payload.regFont = regFont;
  payload.boldFont = boldFont;

  const height = renderReceiptPdf(doc as any, payload, true);
  doc.end(); // Discard dummy
  return height;
};

// ... (Exports)
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

  const payload = {
    saleId,
    receiptNo,
    businessName,
    receiptDate,
    currencyCode,
    locale,
    hasSymbolFont: false,
    regFont: 'Helvetica',
    boldFont: 'Helvetica-Bold',
    tx,
  };

  // 1. Calculate Height
  const height = calculateReceiptHeight(payload);

  // 2. Generate Real PDF
  const doc = new PDFDocument({
    size: [POS_WIDTH, height],
    margins: { top: POS_MARGIN, bottom: POS_MARGIN, left: POS_MARGIN, right: POS_MARGIN },
    autoFirstPage: true,
  }) as unknown as PdfDoc;

  const { regFont, boldFont, hasNoto } = registerFonts(doc);
  payload.hasSymbolFont = hasNoto;
  payload.regFont = regFont;
  payload.boldFont = boldFont;

  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  doc.pipe(stream);

  const done = new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

  renderReceiptPdf(doc, payload, false);

  doc.end();

  const buffer = await done;
  
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

    const user: any = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

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

    const payload = {
        saleId,
        receiptNo,
        businessName,
        receiptDate,
        currencyCode,
        locale,
        hasSymbolFont: false,
        regFont: 'Helvetica',
        boldFont: 'Helvetica-Bold',
        tx,
    };

    // 1. Calculate Height
    const height = calculateReceiptHeight(payload);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${saleId}.pdf`);

    // 2. Generate Real PDF
    const doc = new PDFDocument({
      size: [POS_WIDTH, height],
      margins: { top: POS_MARGIN, bottom: POS_MARGIN, left: POS_MARGIN, right: POS_MARGIN },
      autoFirstPage: true,
    }) as unknown as PdfDoc;

    const { regFont, boldFont, hasNoto } = registerFonts(doc);
    payload.hasSymbolFont = hasNoto;
    payload.regFont = regFont;
    payload.boldFont = boldFont;

    doc.pipe(res);

    renderReceiptPdf(doc, payload, false);

    doc.end();
  } catch (e: any) {
    console.error('Receipt PDF Error:', e?.stack || e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate receipt' });
  }
};