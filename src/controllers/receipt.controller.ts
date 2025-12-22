// src/controllers/receipt.controller.ts
import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model';

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

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function computePaidBalance(tx: any) {
  const total = safeNum(tx?.totalMoney);
  const paid = safeNum(tx?.amountPaid ?? tx?.paidAmount ?? tx?.paid ?? tx?.totalPaid ?? 0);
  const balanceFromDb = tx?.balance;
  const balance =
    balanceFromDb !== undefined && balanceFromDb !== null
      ? Math.max(safeNum(balanceFromDb), 0)
      : Math.max(total - paid, 0);

  // Normalize status
  let status: 'PAID' | 'CREDIT' | 'PART_PAYMENT' = 'PAID';
  if (balance > 0 && paid > 0) status = 'PART_PAYMENT';
  else if (balance > 0) status = 'CREDIT';

  return { total, paid, balance, status };
}

type PDFDoc = InstanceType<typeof PDFDocument>;

function dashedLine(doc: PDFDoc, x1: number, x2: number, y: number, dash = 3, gap = 2) {
  let x = x1;
  doc.save();
  doc.lineWidth(1);
  while (x < x2) {
    doc.moveTo(x, y).lineTo(Math.min(x + dash, x2), y).stroke();
    x += dash + gap;
  }
  doc.restore();
}

function truncate(s: string, max: number) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + '…';
}

/**
 * Modern POS-like receipt (80mm thermal style PDF).
 * Route: GET /api/sales/:saleId/receipt
 */
export const generateSaleReceiptPdf = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const saleId = String(req.params.saleId || '').trim();
    if (!saleId) return res.status(400).json({ error: 'Missing saleId' });

    const user: any = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ Optional TYCOON gate (enable if you want)
    // if (String(user?.planType || '').toUpperCase() !== 'TYCOON') {
    //   return res.status(403).json({ error: 'Upgrade to Tycoon to print receipt' });
    // }

    const tx: any = await Transaction.findOne({
      _id: saleId,
      user: userId,
      type: 'SALE',
      isUndone: { $ne: true },
    }).lean();

    if (!tx) return res.status(404).json({ error: 'Sale not found' });

    // ----- user formatting -----
    const offsetMinutes = user?.settings?.utcOffsetMinutes ?? 60;
    const businessName = String(user?.businessName || 'My Shop').trim();
    const currencyCode = String(user?.currencyCode || 'NGN');
    const locale = String(user?.locale || 'en-NG');
    const phone = String(user?.phoneNumber || '').trim();

    const formatMoney = (n: any) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 0,
      }).format(safeNum(n));

    const receiptDate = fmtDDMMYYYY_HHMM(new Date(tx.timestamp || tx.createdAt || Date.now()), offsetMinutes);

    const items = Array.isArray(tx.items) ? tx.items : [];

    // ----- thermal sizing (80mm) -----
    // 80mm at 72dpi ≈ 226.77 points
    const PAGE_W = 226.77;

    // Rough height estimate (avoid page cut-off)
    const charsPerLine = 26; // for narrow width
    const baseH = 320; // header + totals + footer
    const perItemBase = 26; // qty/price line + spacing
    const perLineH = 11; // each wrapped name line
    const itemsH = items.reduce((sum: number, it: any) => {
      const name = String(it?.name || 'Item');
      const lines = Math.max(1, Math.ceil(name.length / charsPerLine));
      return sum + perItemBase + lines * perLineH;
    }, 0);

    const PAGE_H = Math.min(Math.max(baseH + itemsH, 480), 8000);

    // ----- headers -----
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=TallyPadi_Receipt_${saleId}.pdf`);

    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margins: { top: 14, bottom: 16, left: 12, right: 12 },
      bufferPages: false,
    });

    doc.pipe(res);

    // ----- theme -----
    const COLORS = {
      ink: '#0f172a', // slate-900
      muted: '#64748b', // slate-500
      light: '#94a3b8', // slate-400
      border: '#e2e8f0', // slate-200
      bg: '#f8fafc', // slate-50
      accent: '#0F766E', // emerald/teal
      accent2: '#14B8A6',
      danger: '#ef4444',
      white: '#ffffff',
    };

    const M = doc.page.margins.left;
    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ----- helpers for layout -----
    const rightText = (text: string, y: number, size = 9, bold = false) => {
      doc.fillColor(COLORS.ink).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      doc.text(text, M, y, { width: W, align: 'right' });
    };

    const leftText = (text: string, y: number, size = 9, bold = false, color = COLORS.ink) => {
      doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      doc.text(text, M, y, { width: W, align: 'left' });
    };

    // ----- header card -----
    const headerH = 86;
    doc.roundedRect(M, doc.y, W, headerH, 10).fill(COLORS.bg);
    doc.roundedRect(M, doc.y, W, headerH, 10).strokeColor(COLORS.border).lineWidth(1).stroke();

    // accent bar
    doc.save();
    doc.rect(M, doc.y, 6, headerH).fill(COLORS.accent);
    doc.restore();

    const headerTop = doc.y + 10;

    // Title
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(12);
    doc.text('RECEIPT', M + 12, headerTop, { width: W - 12, align: 'left' });

    // Brand (small)
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
    doc.text('TallyPadi POS', M + 12, headerTop + 16, { width: W - 12 });

    // Business name centered-ish
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11);
    doc.text(truncate(businessName, 42), M + 12, headerTop + 34, { width: W - 24, align: 'left' });

    // Date + Sale Id (right aligned)
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.2);
    doc.text(receiptDate, M, headerTop + 4, { width: W, align: 'right' });
    doc.text(`ID: ${truncate(saleId, 16)}`, M, headerTop + 18, { width: W, align: 'right' });

    // Optional phone
    if (phone) {
      doc.fillColor(COLORS.light).font('Helvetica').fontSize(8);
      doc.text(truncate(phone, 24), M, headerTop + 52, { width: W, align: 'right' });
    }

    doc.y = doc.y + headerH + 12;

    // ----- section divider -----
    doc.strokeColor(COLORS.border);
    dashedLine(doc, M, M + W, doc.y, 3, 2);
    doc.y += 10;

    // ----- items header -----
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8.2);
    doc.text('ITEM', M, doc.y, { width: W * 0.62, align: 'left' });
    doc.text('AMT', M, doc.y, { width: W, align: 'right' });
    doc.y += 10;

    doc.strokeColor(COLORS.border);
    dashedLine(doc, M, M + W, doc.y, 3, 2);
    doc.y += 10;

    // ----- items list -----
    doc.font('Helvetica').fontSize(9);
    for (const it of items) {
      const qty = safeNum(it?.qty ?? it?.quantity ?? 0);
      const name = String(it?.name || 'Item');
      const unitPrice = safeNum(it?.unitPrice ?? it?.price ?? 0);
      const lineTotal = safeNum(it?.total ?? qty * unitPrice);

      // Item name (wrap)
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(9);
      doc.text(name, M, doc.y, { width: W, align: 'left' });

      // Move down based on wrapped height
      const nameH = doc.heightOfString(name, { width: W });
      doc.y += nameH + 2;

      // Qty x price (left) and amount (right)
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5);
      const left = `${qty} × ${formatMoney(unitPrice)}`;
      doc.text(left, M, doc.y, { width: W * 0.62, align: 'left' });

      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5);
      doc.text(formatMoney(lineTotal), M, doc.y, { width: W, align: 'right' });

      doc.y += 14;

      // subtle row divider
      doc.strokeColor(COLORS.border);
      dashedLine(doc, M, M + W, doc.y, 2, 3);
      doc.y += 8;
    }

    // ----- totals -----
    const { total, paid, balance, status } = computePaidBalance(tx);

    doc.y += 2;
    doc.strokeColor(COLORS.border);
    dashedLine(doc, M, M + W, doc.y, 3, 2);
    doc.y += 10;

    // Subtotal
    leftText('SUBTOTAL', doc.y, 8.3, true, COLORS.muted);
    rightText(formatMoney(total), doc.y - 1, 9.2, true);
    doc.y += 16;

    // Payment status (optional)
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8.1);
    doc.text('STATUS', M, doc.y, { width: W * 0.5, align: 'left' });

    const statusLabel =
      status === 'PAID' ? 'PAID' : status === 'PART_PAYMENT' ? 'PART PAYMENT' : 'CREDIT';

    doc.fillColor(status === 'PAID' ? COLORS.accent : status === 'CREDIT' ? COLORS.danger : COLORS.accent2)
      .font('Helvetica-Bold')
      .fontSize(8.6)
      .text(statusLabel, M, doc.y, { width: W, align: 'right' });

    doc.y += 14;

    // Paid + Balance lines only if relevant
    if (paid > 0 || balance > 0) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.3);
      doc.text('PAID', M, doc.y, { width: W * 0.5, align: 'left' });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.7);
      doc.text(formatMoney(paid), M, doc.y, { width: W, align: 'right' });
      doc.y += 12;

      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.3);
      doc.text('BALANCE', M, doc.y, { width: W * 0.5, align: 'left' });
      doc.fillColor(balance > 0 ? COLORS.danger : COLORS.ink).font('Helvetica-Bold').fontSize(8.7);
      doc.text(formatMoney(balance), M, doc.y, { width: W, align: 'right' });
      doc.y += 14;
    }

    // Big total bar
    const totalBarH = 34;
    doc.roundedRect(M, doc.y, W, totalBarH, 10).fill(COLORS.ink);
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9.5);
    doc.text('TOTAL', M + 12, doc.y + 10, { width: W - 24, align: 'left' });
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11.5);
    doc.text(formatMoney(total), M, doc.y + 8, { width: W - 10, align: 'right' });

    doc.y += totalBarH + 12;

    // Footer
    doc.strokeColor(COLORS.border);
    dashedLine(doc, M, M + W, doc.y, 3, 2);
    doc.y += 10;

    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8);
    doc.text('Thanks for your purchase 🙌', M, doc.y, { width: W, align: 'center' });
    doc.y += 12;

    doc.fillColor(COLORS.light).font('Helvetica').fontSize(7.5);
    doc.text('Powered by TallyPadi', M, doc.y, { width: W, align: 'center' });

    doc.end();
  } catch (e: any) {
    console.error('Receipt PDF Error:', e?.stack || e);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate receipt' });
  }
};
