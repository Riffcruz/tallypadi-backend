// src/controllers/receipt.controller.ts
import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model';
type PDFKitDoc = InstanceType<typeof PDFDocument>;




function pickFirstExisting(paths: string[]) {
  for (const p of paths) if (fs.existsSync(p)) return p;
  return null;
}

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


function dashedLine(doc: PDFKitDoc, x1: number, x2: number, y: number, dash = 3, gap = 2) {
  let x = x1;
  doc.save();
  doc.lineWidth(1);
  while (x < x2) {
    doc.moveTo(x, y).lineTo(Math.min(x + dash, x2), y).stroke();
    x += dash + gap;
  }
  doc.restore();
}

function safeEllipsis(s: string, max = 40) {
  const t = String(s || '');
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

function fitTextRight(
  doc: PDFKitDoc,
  text: string,
  x: number,
  y: number,
  width: number,
  maxFontSize: number,
  minFontSize: number
) {
  let size = maxFontSize;
  doc.fontSize(size);
  while (size > minFontSize && doc.widthOfString(text) > width) {
    size -= 1;
    doc.fontSize(size);
  }
  doc.text(text, x, y, { width, align: 'right', lineBreak: false, ellipsis: true });
}

function drawBadge(doc: PDFKitDoc, x: number, y: number, text: string) {
  const padX = 8;
  const padY = 4;
  doc.save();
  doc.fontSize(9).font('Bold');
  const w = doc.widthOfString(text) + padX * 2;
  const h = 18;

  doc.roundedRect(x, y, w, h, 9).fill('#ECFDF5'); // emerald-50
  doc.fillColor('#065F46'); // emerald-800
  doc.text(text, x + padX, y + padY, { lineBreak: false });
  doc.restore();

  return { w, h };
}

function drawCheckIcon(doc: PDFKitDoc, cx: number, cy: number, r: number) {
  // circle + check mark
  doc.save();
  doc.circle(cx, cy, r).fill('#10B981'); // emerald-500
  doc.lineWidth(2).strokeColor('#FFFFFF');

  doc.moveTo(cx - r * 0.4, cy);
  doc.lineTo(cx - r * 0.1, cy + r * 0.35);
  doc.lineTo(cx + r * 0.45, cy - r * 0.35);
  doc.stroke();
  doc.restore();
}

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
    const businessName = user?.businessName || 'My Shop';

    // ✅ Always show currency as CODE to avoid “gibberish” symbols
    const currencyCode = String(user?.currencyCode || 'NGN').toUpperCase();
    const locale = user?.locale || 'en-NG';

    const money = (n: any) => {
      const amt = Number(n || 0);
      const formatted = amt.toLocaleString(locale, { maximumFractionDigits: 0 });
      return `${currencyCode} ${formatted}`;
    };

    const receiptDate = fmtDDMMYYYY_HHMM(new Date(tx.timestamp || tx.createdAt || Date.now()), offsetMinutes);

    // ✅ Headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Receipt_${saleId}.pdf`);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      compress: true,
    });

    doc.pipe(res);

    // ✅ Fonts (use NotoSans if available; avoids weird glyphs)
    const noto = pickFirstExisting([
      path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf',
    ]);
    const notoBold = pickFirstExisting([
      path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Bold.ttf'),
      '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
      '/usr/share/fonts/opentype/noto/NotoSans-Bold.ttf',
    ]);

    if (noto) doc.registerFont('Regular', noto);
    else doc.registerFont('Regular', 'Helvetica');

    if (notoBold) doc.registerFont('Bold', notoBold);
    else doc.registerFont('Bold', 'Helvetica-Bold');

    // =========================
    // ✅ POS RECEIPT LAYOUT (centered card)
    // =========================
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    const receiptW = 380; // modern POS width feel
    const rx = (pageW - receiptW) / 2;
    let y = doc.page.margins.top;

    const pad = 16;
    const innerX = rx + pad;
    const innerW = receiptW - pad * 2;

    // Card container
    doc.roundedRect(rx, y, receiptW, pageH - y - doc.page.margins.bottom, 18).fill('#FFFFFF');
    doc.roundedRect(rx, y, receiptW, pageH - y - doc.page.margins.bottom, 18).strokeColor('#E2E8F0').lineWidth(1).stroke();

    // Header area
    y += 14;

    // Brand row
    doc.font('Bold').fontSize(18).fillColor('#0F172A').text('TallyPadi', innerX, y, { width: innerW, align: 'left' });
    drawCheckIcon(doc, rx + receiptW - pad - 10, y + 10, 7);

    y += 22;
    doc.font('Regular').fontSize(10).fillColor('#475569').text(businessName, innerX, y, { width: innerW });

    y += 14;
    const badge = drawBadge(doc, innerX, y, 'PAID');
    doc.font('Regular').fontSize(9).fillColor('#64748B').text('POS Receipt', innerX + badge.w + 10, y + 5, {
      width: innerW - badge.w - 10,
    });

    y += 26;
    dashedLine(doc, innerX, innerX + innerW, y, 3, 3);
    y += 14;

    // ✅ Date + SaleId boxes (padded, contained)
    const boxH = 44;
    const gap = 10;
    const boxW = (innerW - gap) / 2;

    // Date box
    doc.roundedRect(innerX, y, boxW, boxH, 12).fill('#F8FAFC').strokeColor('#E2E8F0').lineWidth(1).stroke();
    doc.font('Bold').fontSize(9).fillColor('#64748B').text('DATE/TIME', innerX + 10, y + 8, { width: boxW - 20 });
    doc.font('Bold').fontSize(10).fillColor('#0F172A').text(receiptDate, innerX + 10, y + 22, {
      width: boxW - 20,
      lineBreak: false,
      ellipsis: true,
    });

    // Sale ID box
    const idX = innerX + boxW + gap;
    doc.roundedRect(idX, y, boxW, boxH, 12).fill('#F8FAFC').strokeColor('#E2E8F0').lineWidth(1).stroke();
    doc.font('Bold').fontSize(9).fillColor('#64748B').text('SALE ID', idX + 10, y + 8, { width: boxW - 20 });
    doc.font('Bold').fontSize(10).fillColor('#0F172A').text(safeEllipsis(saleId, 22), idX + 10, y + 22, {
      width: boxW - 20,
      lineBreak: false,
      ellipsis: true,
    });

    y += boxH + 14;

    // Items Header row
    doc.font('Bold').fontSize(9).fillColor('#64748B').text('ITEM', innerX, y, { width: innerW * 0.52 });
    doc.text('QTY', innerX + innerW * 0.52, y, { width: innerW * 0.12, align: 'right' });
    doc.text('PRICE', innerX + innerW * 0.64, y, { width: innerW * 0.18, align: 'right' });
    doc.text('TOTAL', innerX + innerW * 0.82, y, { width: innerW * 0.18, align: 'right' });

    y += 10;
    dashedLine(doc, innerX, innerX + innerW, y, 2, 2);
    y += 10;

    const items = Array.isArray(tx.items) ? tx.items : [];
    doc.font('Regular').fontSize(10).fillColor('#0F172A');

    for (let i = 0; i < items.length; i++) {
      const it: any = items[i];
      const qty = Number(it.qty ?? it.quantity ?? 0);
      const name = String(it.name || 'Item');
      const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
      const lineTotal = Number(it.total ?? qty * unitPrice);

      const colItemW = innerW * 0.52;
      const colQtyW = innerW * 0.12;
      const colPriceW = innerW * 0.18;
      const colTotalW = innerW * 0.18;

      // name can wrap but keep neat
      const nameH = doc.heightOfString(name, { width: colItemW, ellipsis: true });
      const rowH = Math.max(18, nameH);

      // soft row background every other
      if (i % 2 === 1) {
        doc.roundedRect(innerX - 6, y - 4, innerW + 12, rowH + 8, 10).fill('#F8FAFC');
      }

      doc.fillColor('#0F172A').font('Bold').fontSize(10).text(name, innerX, y, {
        width: colItemW,
        ellipsis: true,
      });

      doc.font('Regular').fontSize(10).fillColor('#0F172A').text(String(qty), innerX + colItemW, y, {
        width: colQtyW,
        align: 'right',
      });

      doc.fillColor('#334155').text(money(unitPrice), innerX + colItemW + colQtyW, y, {
        width: colPriceW,
        align: 'right',
        ellipsis: true,
      });

      doc.fillColor('#0F172A').font('Bold').text(money(lineTotal), innerX + colItemW + colQtyW + colPriceW, y, {
        width: colTotalW,
        align: 'right',
        ellipsis: true,
      });

      y += rowH + 10;
    }

    y += 2;
    dashedLine(doc, innerX, innerX + innerW, y, 3, 3);
    y += 14;

    // TOTAL BOX (fixed width, contained, auto-fit)
    const totalMoney = Number(tx.totalMoney || 0);
    const totalText = money(totalMoney);

    const totalBoxH = 54;
    doc.roundedRect(innerX, y, innerW, totalBoxH, 14).fill('#0F172A'); // slate-900

    doc.font('Bold').fillColor('#CBD5E1').fontSize(10).text('TOTAL', innerX + 14, y + 18, {
      width: innerW * 0.35,
      lineBreak: false,
    });

    // ✅ Keep total value inside box (fit-to-width)
    doc.font('Bold').fillColor('#FFFFFF');
    fitTextRight(
      doc,
      totalText,
      innerX + innerW * 0.35,
      y + 14,
      innerW * 0.65 - 14,
      20, // max
      12  // min
    );

    y += totalBoxH + 16;

    // Footer
    doc.font('Regular').fontSize(9).fillColor('#64748B').text('Thanks for your purchase!', innerX, y, {
      width: innerW,
      align: 'center',
    });
    y += 12;
    doc.font('Regular').fontSize(8).fillColor('#94A3B8').text('Generated by TallyPadi', innerX, y, {
      width: innerW,
      align: 'center',
    });

    doc.end();
  } catch (e: any) {
    console.error('Receipt PDF Error:', e?.stack || e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate receipt' });
  }
};
