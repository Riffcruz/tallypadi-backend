import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { getDailySummary, getFullSummary, getTodayTransactions } from './report.service';
import { User } from '../models/user.model';

interface ReportOptions {
  includeSummary?: boolean;
  includeTransactions?: boolean;
  includeInventory?: boolean;
}

// ✅ Currency code mapping (stable in PDF fonts)
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN',
  US: 'USD',
  GB: 'GBP',
  EU: 'EUR',
  GH: 'GHS',
  KE: 'KES',
  ZA: 'ZAR',
  IN: 'INR',
  CN: 'CNY',
  CA: 'CAD',
};

// ✅ Robust font resolver (Ubuntu paths vary)
const pickFirstExisting = (paths: string[]) => {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
};

export const generatePdfReport = async (
  userId: Types.ObjectId,
  reportType: 'SALES' | 'FULL',
  dateLabel: string,
  startDate?: Date,
  endDate?: Date,
  options: ReportOptions = { includeSummary: true, includeTransactions: true, includeInventory: true }
): Promise<string> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const businessName = user.businessName || 'Your Shop';

  // ✅ detect country code -> currency code (adjust based on your schema)
  const rawCountry =
    (user as any).countryCode ||
    (user as any).profile?.countryCode ||
    'NG';

  const currencyCode =
    COUNTRY_CURRENCY_CODE[String(rawCountry).toUpperCase()] || 'NGN';

  // ✅ bufferPages: page numbers after all pages are created
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 56, bottom: 56, left: 48, right: 48 },
    bufferPages: true,
  });

  const filename = `report-${user._id}-${Date.now()}.pdf`;
  const tempFilePath = path.join(process.cwd(), 'public', 'reports', filename);

  // Ensure directory exists
  const dir = path.dirname(tempFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const stream = fs.createWriteStream(tempFilePath);
  doc.pipe(stream);

  // ✅ Register Unicode font (helps stop weird missing chars / layout jumps)
  const notoPath = pickFirstExisting([
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansDisplay-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf',
  ]);
  if (notoPath) {
    doc.registerFont('Body', notoPath);
    doc.registerFont('BodyBold', notoPath); // using same file is fine; bold effect is simulated by PDF viewers
  }

  // ---------- BRAND THEME ----------
  const BRAND = {
    primary: '#16a34a', // emerald-600
    dark: '#0b1220',
    text: '#0f172a',
    muted: '#64748b',
    line: '#e2e8f0',
    soft: '#f1f5f9',
    white: '#ffffff',
  };

  const pageW = () => doc.page.width;
  const pageH = () => doc.page.height;
  const m = () => doc.page.margins;
  const contentW = () => pageW() - m().left - m().right;

  // ---------- HELPERS ----------
  const fmtDate = (d?: Date) =>
    d ? d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const formatPeriod = () => {
    const s = fmtDate(startDate);
    const e = fmtDate(endDate);
    if (startDate && endDate) return `${s} to ${e}`;
    if (startDate && !endDate) return `From ${s}`;
    if (!startDate && endDate) return `Up to ${e}`;
    return dateLabel || 'All time';
  };

  // ✅ decimals + currency code (no ₦)
  const formatMoney = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0;
    const num = safe.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currencyCode} ${num}`;
  };

  // ✅ Watermark that WON’T wrap/paginate (common cause of blank pages)
  const drawWatermark = () => {
    const text = `TallyPadi • ${businessName}`;
    doc.save();
    doc.rotate(-32, { origin: [pageW() / 2, pageH() / 2] });
    doc.fillColor(BRAND.dark).opacity(0.06);

    if (notoPath) doc.font('BodyBold');
    else doc.font('Helvetica-Bold');

    doc.fontSize(48);

    // IMPORTANT: lineBreak:false + huge width prevents forced wrapping/new pages
    doc.text(text, -pageW(), pageH() / 2 - 24, {
      width: pageW() * 3,
      align: 'center',
      lineBreak: false,
    });

    doc.opacity(1).restore();
  };

  const drawHeader = (subtitle: string) => {
    doc.save();
    doc.rect(0, 0, pageW(), 72).fill(BRAND.dark);

    const left = m().left;

    // TP “logo”
    doc.fillColor(BRAND.primary);
    doc.circle(left + 14, 36, 14).fill();
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(10);
    doc.text('TP', left + 6, 31, { width: 16, align: 'center', lineBreak: false });

    // Left title
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(16);
    doc.text('TallyPadi', left + 40, 22, { lineBreak: false });

    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10);
    doc.text(subtitle, left + 40, 42, { lineBreak: false });

    // Right info
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(12);
    doc.text(businessName, left, 22, { width: contentW(), align: 'right', lineBreak: false });

    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9);
    doc.text(`Period: ${formatPeriod()}`, left, 40, { width: contentW(), align: 'right', lineBreak: false });

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8);
    doc.text(`Currency: ${currencyCode}`, left, 54, { width: contentW(), align: 'right', lineBreak: false });

    doc.restore();

    doc.moveTo(m().left, 84)
      .lineTo(pageW() - m().right, 84)
      .strokeColor(BRAND.line)
      .lineWidth(1)
      .stroke();
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    const footerY = pageH() - m().bottom + 18;

    doc.save();
    doc.strokeColor(BRAND.line).lineWidth(1);
    doc.moveTo(m().left, pageH() - m().bottom + 6)
      .lineTo(pageW() - m().right, pageH() - m().bottom + 6)
      .stroke();

    doc.fillColor(BRAND.muted).font('Helvetica').fontSize(8);
    doc.text('tallypadi.com', m().left, footerY, { align: 'left', lineBreak: false });
    doc.text(`Page ${pageNumber} of ${totalPages}`, m().left, footerY, { width: contentW(), align: 'right', lineBreak: false });

    doc.restore();
  };

  const renderPageFrame = (subtitle: string) => {
    drawWatermark();
    drawHeader(subtitle);
  };

  // ---------- TABLE HELPERS ----------
  const drawTableHeader = (y: number, headers: string[], colWidths: number[]) => {
    const rowH = 22;
    doc.save();
    doc.fillColor(BRAND.soft);
    doc.roundedRect(m().left, y, contentW(), rowH, 8).fill();

    if (notoPath) doc.font('BodyBold');
    else doc.font('Helvetica-Bold');

    doc.fillColor(BRAND.text).fontSize(9);

    let x = m().left;
    headers.forEach((h, i) => {
      const align =
        h.toLowerCase().includes('amount') || h.toLowerCase().includes('revenue')
          ? 'right'
          : 'left';
      doc.text(h.toUpperCase(), x + 10, y + 6, { width: colWidths[i] - 20, align, lineBreak: false });
      x += colWidths[i];
    });

    doc.restore();
    return y + rowH + 8;
  };

  const drawTableRow = (
    y: number,
    cols: string[],
    colWidths: number[],
    rowIndex: number,
    opts?: { highlightRed?: boolean; rightAlignLast?: boolean }
  ) => {
    if (notoPath) doc.font('Body');
    else doc.font('Helvetica');
    doc.fontSize(9);

    // dynamic row height
    let maxH = 22;
    cols.forEach((text, i) => {
      const w = colWidths[i] - 20;
      const h = doc.heightOfString(text || '-', { width: w });
      maxH = Math.max(maxH, h + 12);
    });

    // zebra background
    doc.save();
    doc.fillColor(BRAND.white).opacity(rowIndex % 2 === 0 ? 0.88 : 0.60);
    doc.roundedRect(m().left, y, contentW(), maxH, 8).fill();
    doc.opacity(1);
    doc.strokeColor(BRAND.line).opacity(0.65).roundedRect(m().left, y, contentW(), maxH, 8).stroke();
    doc.opacity(1).restore();

    // text
    let x = m().left;
    cols.forEach((text, i) => {
      const isLast = i === cols.length - 1;
      const align = isLast && (opts?.rightAlignLast ?? true) ? 'right' : 'left';

      const hasAlert =
        opts?.highlightRed && (text.includes('Oversold') || text.includes('ALERT'));

      if (hasAlert) {
        doc.fillColor('#dc2626');
        if (notoPath) doc.font('BodyBold');
        else doc.font('Helvetica-Bold');
      } else if (isLast) {
        doc.fillColor(BRAND.primary);
        if (notoPath) doc.font('BodyBold');
        else doc.font('Helvetica-Bold');
      } else {
        doc.fillColor('#334155');
        if (notoPath) doc.font('Body');
        else doc.font('Helvetica');
      }

      doc.text(text || '-', x + 10, y + 6, { width: colWidths[i] - 20, align });
      x += colWidths[i];
    });

    return y + maxH + 8;
  };

  const ensureSpace = (y: number, needed: number, subtitle: string) => {
    if (y + needed > pageH() - m().bottom - 10) {
      doc.addPage();
      renderPageFrame(subtitle);
      return 100;
    }
    return y;
  };

  // ---------- START ----------
  const subtitle = reportType === 'SALES' ? 'Sales Report' : 'Full Business Report';
  renderPageFrame(subtitle);

  let currentY = 100;

  // ---------- SALES REPORT ----------
  if (reportType === 'SALES') {
    const summary = await getDailySummary(userId, startDate, endDate);
    const transactions = await getTodayTransactions(userId, startDate, endDate);

    if (options.includeSummary) {
      currentY = ensureSpace(currentY, 80, subtitle);

      doc.save();
      doc.roundedRect(m().left, currentY, contentW(), 58, 14).fillColor('#ffffff').opacity(0.9).fill();
      doc.opacity(1);
      doc.roundedRect(m().left, currentY, contentW(), 58, 14).strokeColor(BRAND.line).stroke();

      doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(9);
      doc.text('TOTAL REVENUE', m().left + 16, currentY + 12, { lineBreak: false });
      doc.text('TRANSACTIONS', m().left + 240, currentY + 12, { lineBreak: false });

      doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(16);
      doc.text(formatMoney(summary.totalRevenue || 0), m().left + 16, currentY + 30, { lineBreak: false });
      doc.text(String(transactions.length), m().left + 240, currentY + 30, { lineBreak: false });

      doc.restore();
      currentY += 78;
    }

    if (options.includeTransactions && transactions.length > 0) {
      currentY = ensureSpace(currentY, 40, subtitle);

      doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(12);
      doc.text('Transaction History', m().left, currentY);
      currentY += 16;

      const headers = ['Time', 'Item', 'Qty', `Amount (${currencyCode})`, 'Staff'];
      const colWidths = [80, 210, 70, 120, contentW() - (80 + 210 + 70 + 120)];

      currentY = drawTableHeader(currentY, headers, colWidths);

      let rowIndex = 0;
      transactions.forEach((t: any) => {
        const timeStr = new Date(t.timestamp).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
        const staffName = (t.user as any)?.name || (t.user as any)?.phoneNumber || 'Owner';

        (t.items || []).forEach((item: any) => {
          const unitLabel = item.unit ? ` ${item.unit}` : '';
          const amount = item.total ? formatMoney(item.total) : '-';

          currentY = ensureSpace(currentY, 60, subtitle);

          currentY = drawTableRow(
            currentY,
            [timeStr, item.name || '-', `${item.qty}${unitLabel}`, amount, staffName],
            colWidths,
            rowIndex++,
            { rightAlignLast: false }
          );
        });
      });
    } else {
      doc.font('Helvetica-Oblique').fillColor(BRAND.muted).text('No sales recorded for this period.', m().left, currentY);
    }
  }

  // ---------- FULL REPORT ----------
  if (reportType === 'FULL') {
    const fullData = await getFullSummary(userId, startDate, endDate);
    const revenueSummary = await getDailySummary(userId, startDate, endDate);

    if (options.includeSummary) {
      currentY = ensureSpace(currentY, 80, subtitle);

      doc.save();
      doc.roundedRect(m().left, currentY, contentW(), 58, 14).fillColor('#ffffff').opacity(0.9).fill();
      doc.opacity(1);
      doc.roundedRect(m().left, currentY, contentW(), 58, 14).strokeColor(BRAND.line).stroke();

      doc.fillColor(BRAND.muted).font('Helvetica-Bold').fontSize(9);
      doc.text('TOTAL REVENUE', m().left + 16, currentY + 12, { lineBreak: false });
      doc.text('ITEMS SOLD', m().left + 240, currentY + 12, { lineBreak: false });

      doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(16);
      doc.text(formatMoney(revenueSummary.totalRevenue || 0), m().left + 16, currentY + 30, { lineBreak: false });
      doc.text(String(revenueSummary.items?.length || 0), m().left + 240, currentY + 30, { lineBreak: false });

      doc.restore();
      currentY += 78;
    }

    if (options.includeInventory && fullData?.length > 0) {
      currentY = ensureSpace(currentY, 40, subtitle);

      doc.fillColor(BRAND.text).font('Helvetica-Bold').fontSize(12);
      doc.text('Inventory & Sales Breakdown', m().left, currentY);
      currentY += 16;

      const headers = ['Item Name', 'Sold (Paid)', 'Sold (Credit)', 'Stock Left', `Revenue (${currencyCode})`];
      const colWidths = [190, 85, 85, 115, contentW() - (190 + 85 + 85 + 115)];

      currentY = drawTableHeader(currentY, headers, colWidths);

      let rowIndex = 0;
      fullData.forEach((item: any) => {
        currentY = ensureSpace(currentY, 60, subtitle);

        // ✅ no emoji (PDF safe)
        let stockText = `${item.stock} ${item.unit || 'units'}`;
        if (item.stock < 0) stockText = `ALERT -${Math.abs(item.stock)} (Oversold)`;

        const revenue = item.revenue > 0 ? formatMoney(item.revenue) : '-';

        currentY = drawTableRow(
          currentY,
          [
            String(item.name || '-').toUpperCase(),
            String(item.soldPaid ?? 0),
            String(item.soldCredit ?? 0),
            stockText,
            revenue,
          ],
          colWidths,
          rowIndex++,
          { highlightRed: true, rightAlignLast: true }
        );
      });
    } else {
      doc.font('Helvetica-Oblique').fillColor(BRAND.muted).text('No inventory data found.', m().left, currentY);
    }
  }

  // ---------- PAGE NUMBERS / FOOTER ----------
  const range = doc.bufferedPageRange(); // { start, count }
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawFooter(i - range.start + 1, range.count);
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
};

// Cleanup old PDF files (unchanged)
export const cleanupPdfReports = () => {
  const reportsDir = path.join(process.cwd(), 'public', 'reports');
  if (!fs.existsSync(reportsDir)) return;

  fs.readdir(reportsDir, (err, files) => {
    if (err) return console.error('Error reading reports dir:', err);
    files.forEach(file => {
      const filePath = path.join(reportsDir, file);
      fs.stat(filePath, (err2, stats) => {
        if (err2) return;
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (stats.mtimeMs < twentyFourHoursAgo) fs.unlink(filePath, () => {});
      });
    });
  });
};
