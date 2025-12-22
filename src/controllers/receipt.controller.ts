// src/controllers/receipt.controller.ts
import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
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
  dark: '#0F172A',       // slate-900
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  bg: '#FFFFFF',
  bgSoft: '#F8FAFC',
  bgHeader: '#F1F5F9',
};

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

// ✅ POS-style dashed divider (no type error)
function dashedLine(doc: PDFKit.PDFDocument, x1: number, x2: number, y: number, dash = 3, gap = 2) {
  let x = x1;
  doc.save();
  doc.lineWidth(1);
  while (x < x2) {
    doc.moveTo(x, y).lineTo(Math.min(x + dash, x2), y).stroke();
    x += dash + gap;
  }
  doc.restore();
}

// ✅ Text clamp to avoid overflow
function ellipsize(doc: PDFKit.PDFDocument, text: string, maxWidth: number) {
  const s = String(text || '');
  if (doc.widthOfString(s) <= maxWidth) return s;
  let out = s;
  while (out.length > 2 && doc.widthOfString(out + '…') > maxWidth) out = out.slice(0, -1);
  return out + '…';
}

export const generateSaleReceiptPdf = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const saleId = String(req.params.saleId || '').trim();
    if (!saleId) return res.status(400).json({ error: 'Missing saleId' });

    const user: any = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ Only THIS sale, for THIS user, not undone
    const tx: any = await Transaction.findOne({
      _id: saleId,
      user: userId,
      type: 'SALE',
      isUndone: { $ne: true },
    }).lean();

    if (!tx) return res.status(404).json({ error: 'Sale not found' });

    const offsetMinutes = user?.settings?.utcOffsetMinutes ?? 60;
    const businessName = String(user?.businessName || 'My Shop');

    // ✅ currency based on user, fallback to country map (NO hardcoded ₦)
    const userCountry = String(user?.countryCode || 'NG').toUpperCase();
    const currencyCode = String(user?.currencyCode || COUNTRY_CURRENCY_CODE[userCountry] || 'NGN').toUpperCase();

    // ✅ locale if present
    const locale = String(user?.locale || 'en-NG');

    // ✅ Use currency CODE display to avoid broken ₦ glyph in some PDF fonts
    const formatMoney = (n: any) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        currencyDisplay: 'code',
        maximumFractionDigits: 0,
      }).format(Number(n || 0));

    const receiptDate = fmtDDMMYYYY_HHMM(new Date(tx.timestamp || tx.createdAt || Date.now()), offsetMinutes);

    // -------------------------------------------------
    // ✅ PDF Setup
    // -------------------------------------------------
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${saleId}.pdf`);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      bufferPages: true,
      autoFirstPage: false,
    });
    doc.pipe(res);
    doc.addPage();

    // ✅ Register Noto font if available (for better unicode; still we use currency codes)
    const fontPaths = [
      path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf',
    ];
    let hasNoto = false;
    for (const p of fontPaths) {
      if (fs.existsSync(p)) {
        doc.registerFont('Noto', p);
        hasNoto = true;
        break;
      }
    }
    const regFont = hasNoto ? 'Noto' : 'Helvetica';
    const boldFont = hasNoto ? 'Noto' : 'Helvetica-Bold';

    doc.font(regFont);

    // -------------------------------------------------
    // ✅ Layout Constants
    // -------------------------------------------------
    const pageW = doc.page.width;
    const margin = doc.page.margins.left;
    const contentW = pageW - margin * 2;

    // Receipt “card” (POS style centered with shadow-like border)
    const cardX = margin;
    const cardY = margin;
    const cardW = contentW;
    const cardPad = 18;

    // We’ll compute height dynamically (we draw background blocks as we go).
    let y = cardY;

    // Card background
    doc.save();
    doc.roundedRect(cardX, y, cardW, doc.page.height - margin * 2, 18).fill(THEME.bg);
    doc.restore();

    // -------------------------------------------------
    // ✅ HEADER (Modern POS)
    // -------------------------------------------------
    // Top bar
    doc.save();
    doc.roundedRect(cardX, y, cardW, 72, 18).fill(THEME.dark);
    // mask lower corners so only top corners are rounded
    doc.rect(cardX, y + 36, cardW, 40).fill(THEME.dark);
    doc.restore();

    // Brand
    doc.fillColor('#FFFFFF').font(boldFont).fontSize(16).text('TallyPadi', cardX + cardPad, y + 18);

    doc.fillColor('#CBD5E1').font(regFont).fontSize(9).text('POS RECEIPT', cardX + cardPad, y + 40);

    // Right badge: PAID
    const badgeText = String(tx.paymentStatus || 'PAID').toUpperCase();
    const badgeW = 64;
    const badgeH = 24;
    doc.save();
    doc.roundedRect(cardX + cardW - cardPad - badgeW, y + 22, badgeW, badgeH, 8).fill(THEME.primary);
    doc.fillColor('#FFFFFF').font(boldFont).fontSize(9).text(
      badgeText.length > 8 ? badgeText.slice(0, 8) : badgeText,
      cardX + cardW - cardPad - badgeW,
      y + 28,
      { width: badgeW, align: 'center' }
    );
    doc.restore();

    y += 72 + 14;

    // -------------------------------------------------
    // ✅ INFO BOX (Date + Sale ID) padded and contained
    // -------------------------------------------------
    const infoH = 58;
    doc.save();
    doc.roundedRect(cardX + cardPad, y, cardW - cardPad * 2, infoH, 14).fill(THEME.bgSoft);
    doc.restore();

    const infoX = cardX + cardPad + 12;
    const infoW = cardW - cardPad * 2 - 24;

    doc.fillColor(THEME.muted).font(boldFont).fontSize(8).text('BUSINESS', infoX, y + 10);
    doc.fillColor(THEME.text).font(boldFont).fontSize(11).text(
      ellipsize(doc, businessName, infoW),
      infoX,
      y + 22,
      { width: infoW }
    );

    doc.fillColor(THEME.muted).font(boldFont).fontSize(8).text('DATE', infoX, y + 38);
    doc.fillColor(THEME.text).font(regFont).fontSize(10).text(receiptDate, infoX + 36, y + 36);

    // Sale ID on right inside same box
    doc.fillColor(THEME.muted).font(boldFont).fontSize(8).text(
      'SALE ID',
      infoX,
      y + 38,
      { width: infoW, align: 'right' }
    );
    doc.fillColor(THEME.text).font(regFont).fontSize(10).text(
      ellipsize(doc, saleId, 160),
      infoX,
      y + 36,
      { width: infoW, align: 'right' }
    );

    y += infoH + 16;

    // -------------------------------------------------
    // ✅ ITEMS HEADER
    // -------------------------------------------------
    doc.fillColor(THEME.text).font(boldFont).fontSize(11).text('ITEMS', cardX + cardPad, y);
    y += 10;

    dashedLine(doc, cardX + cardPad, cardX + cardW - cardPad, y, 3, 3);
    y += 12;

    // Columns
    const colQtyW = 40;
    const colPriceW = 90;
    const colTotalW = 95;
    const colNameW = cardW - cardPad * 2 - colQtyW - colPriceW - colTotalW;

    doc.fillColor(THEME.muted).font(boldFont).fontSize(8);
    doc.text('QTY', cardX + cardPad, y, { width: colQtyW, align: 'left' });
    doc.text('ITEM', cardX + cardPad + colQtyW, y, { width: colNameW, align: 'left' });
    doc.text('PRICE', cardX + cardPad + colQtyW + colNameW, y, { width: colPriceW, align: 'right' });
    doc.text('TOTAL', cardX + cardPad + colQtyW + colNameW + colPriceW, y, { width: colTotalW, align: 'right' });

    y += 14;
    doc.fillColor(THEME.border).moveTo(cardX + cardPad, y).lineTo(cardX + cardW - cardPad, y).stroke();
    y += 10;

    // Items
    const items = Array.isArray(tx.items) ? tx.items : [];
    let computedTotal = 0;

    doc.font(regFont).fontSize(10).fillColor(THEME.text);

    for (const it of items) {
      const qty = Number(it.qty ?? it.quantity ?? 0);
      const name = String(it.name || 'Item');
      const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
      const lineTotal = Number(it.total ?? qty * unitPrice);

      computedTotal += lineTotal;

      const nameText = ellipsize(doc, name, colNameW);

      // Row height based on name wrap (keep single line for POS clean)
      const rowH = 18;

      // Qty
      doc.fillColor(THEME.text).font(boldFont).text(String(qty), cardX + cardPad, y, {
        width: colQtyW,
        align: 'left',
      });

      // Item name
      doc.fillColor(THEME.text).font(regFont).text(nameText, cardX + cardPad + colQtyW, y, {
        width: colNameW,
        align: 'left',
      });

      // Unit price
      doc.fillColor(THEME.muted).font(regFont).text(formatMoney(unitPrice), cardX + cardPad + colQtyW + colNameW, y, {
        width: colPriceW,
        align: 'right',
      });

      // Line total
      doc.fillColor(THEME.text).font(boldFont).text(formatMoney(lineTotal), cardX + cardPad + colQtyW + colNameW + colPriceW, y, {
        width: colTotalW,
        align: 'right',
      });

      y += rowH;

      // light divider
      doc.save();
      doc.strokeColor(THEME.border).lineWidth(0.5);
      doc.moveTo(cardX + cardPad, y).lineTo(cardX + cardW - cardPad, y).stroke();
      doc.restore();

      y += 6;
    }

    // -------------------------------------------------
    // ✅ TOTAL BOX (fix overflow + keep value inside)
    // -------------------------------------------------
    y += 4;
    dashedLine(doc, cardX + cardPad, cardX + cardW - cardPad, y, 3, 3);
    y += 14;

    const totalBoxH = 58;
    const totalBoxW = cardW - cardPad * 2;
    const totalBoxX = cardX + cardPad;

    doc.save();
    doc.roundedRect(totalBoxX, y, totalBoxW, totalBoxH, 16).fill('#ECFDF5'); // emerald-50
    doc.restore();

    const totalLabelY = y + 12;
    const totalValueY = y + 28;

    // Use tx.totalMoney if present, else computed
    const totalMoney = Number(tx.totalMoney ?? computedTotal ?? 0);

    doc.fillColor('#065F46').font(boldFont).fontSize(9).text('TOTAL AMOUNT', totalBoxX + 14, totalLabelY);

    // ✅ Keep inside box with width + right align
    doc.fillColor('#064E3B').font(boldFont).fontSize(16).text(
      formatMoney(totalMoney),
      totalBoxX + 14,
      totalValueY,
      { width: totalBoxW - 28, align: 'right' }
    );

    y += totalBoxH + 16;

    // -------------------------------------------------
    // ✅ FOOTER NOTE (no emoji, because PDF fonts may not support it)
    // -------------------------------------------------
    doc.fillColor(THEME.muted).font(regFont).fontSize(9).text(
      'Thank you for your purchase.',
      cardX + cardPad,
      y,
      { width: cardW - cardPad * 2, align: 'center' }
    );

    doc.moveDown(0.3);
    doc.fillColor('#94A3B8').font(regFont).fontSize(8).text(
      'Generated by TallyPadi POS',
      cardX + cardPad,
      y + 14,
      { width: cardW - cardPad * 2, align: 'center' }
    );

    doc.end();
  } catch (e: any) {
    console.error('Receipt PDF Error:', e?.stack || e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate receipt' });
  }
};
