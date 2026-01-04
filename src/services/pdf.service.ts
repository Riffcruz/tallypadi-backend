// src/services/pdf.service.ts
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { getDailySummary, getFullSummary, getTodayTransactions } from './report.service';
import { User } from '../models/user.model';
import { toUserLocalDate } from '../utils/dates';

interface ReportOptions {
  includeSummary?: boolean;
  includeTransactions?: boolean;
  includeInventory?: boolean;

  /**
   * Optional:
   * If later you want to include undone in PDF, you can wire this to report.service.
   * For now it only affects local filtering where possible.
   */
  includeUndone?: boolean;
}

// ✅ Theme Configuration
const THEME = {
  primary: '#0F766E',
  accent: '#14B8A6',
  dark: '#1E293B',
  text: '#334155',
  muted: '#64748B',
  border: '#E2E8F0',
  bgLight: '#F8FAFC',
  bgHeader: '#F1F5F9',
  alert: '#EF4444',
  white: '#FFFFFF',
};

const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

const COUNTRY_LOCALE: Record<string, string> = {
  NG: 'en-NG',
  GH: 'en-GH',
  US: 'en-US',
  GB: 'en-GB',
  EU: 'en-IE',
  KE: 'en-KE',
  ZA: 'en-ZA',
  IN: 'en-IN',
  CA: 'en-CA',
  AU: 'en-AU',
  JP: 'ja-JP',
  AE: 'en-AE',
  RW: 'en-RW',
  TZ: 'en-TZ',
  UG: 'en-UG',
};

// ✅ Robust font resolver
const pickFirstExisting = (paths: string[]) => {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
};

function isValidNumber(n: any) {
  const x = Number(n);
  return Number.isFinite(x);
}

// ✅ DateTime formatting (date + time)
function fmtUserDateTime(d: Date, offsetMinutes: number, locale: string) {
  const local = toUserLocalDate(d, offsetMinutes);
  return local.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ✅ Date-only formatting (kept for compact places if needed)
function fmtUserDate(d: Date, offsetMinutes: number, locale: string) {
  const local = toUserLocalDate(d, offsetMinutes);
  return local.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ✅ REQUIRED: Time column format: 22/12/2025 14:05 (DD/MM/YYYY HH:mm)
function fmtDDMMYYYY_HHMM(d: Date, offsetMinutes: number) {
  const local = toUserLocalDate(d, offsetMinutes);
  const dd = String(local.getDate()).padStart(2, '0');
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const yyyy = String(local.getFullYear());
  const hh = String(local.getHours()).padStart(2, '0');
  const min = String(local.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export const generatePdfReport = async (
  userId: Types.ObjectId,
  reportType: 'SALES' | 'FULL',
  dateLabel: string,
  startDate?: Date,
  endDate?: Date,
  options: ReportOptions = { includeSummary: true, includeTransactions: true, includeInventory: true, includeUndone: false }
): Promise<string> => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const businessName = user.businessName || 'Business Report';
  const rawCountry = (user as any).countryCode || (user as any).profile?.countryCode || 'NG';
  const cc = String(rawCountry).toUpperCase();

  const currencyCode = COUNTRY_CURRENCY_CODE[cc] || 'NGN';
  const locale = COUNTRY_LOCALE[cc] || 'en-NG';

  // ✅ Use user's offset for display (times + date period)
  const offsetMinutes = (user as any)?.settings?.utcOffsetMinutes ?? 60;

  // Setup Document
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 40, right: 40 },
    bufferPages: true,
    autoFirstPage: false,
  });

  const filename = `report-${user._id}-${Date.now()}.pdf`;
  const tempFilePath = path.join(process.cwd(), 'public', 'reports', filename);
  const dir = path.dirname(tempFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const stream = fs.createWriteStream(tempFilePath);
  doc.pipe(stream);

  // ✅ Font Registration
  const notoPath = pickFirstExisting([
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf',
  ]);

  if (notoPath) {
    doc.registerFont('Regular', notoPath);
    doc.registerFont('Bold', notoPath);
  } else {
    doc.registerFont('Regular', 'Helvetica');
    doc.registerFont('Bold', 'Helvetica-Bold');
  }

  // ✅ CRITICAL: Add first page
  doc.addPage();

  // --- DIMENSIONS ---
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = doc.page.margins.left;
  const contentWidth = pageWidth - margin * 2;

  // ✅ FIX: bottomLimit must respect the real bottom margin (no hard-coded 50)
  const bottomLimit = pageHeight - doc.page.margins.bottom;

  // --- HELPERS ---
  const formatMoney = (amount: any) => {
    const safe = isValidNumber(amount) ? Number(amount) : 0;

    // ✅ Match WhatsApp style (no decimals)
    return `${currencyCode} ${safe.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const getPeriodTextWithTime = () => {
    if (startDate && endDate) {
      return `${fmtUserDateTime(startDate, offsetMinutes, locale)}  →  ${fmtUserDateTime(endDate, offsetMinutes, locale)}`;
    }
    if (startDate) return `From ${fmtUserDateTime(startDate, offsetMinutes, locale)}`;
    if (endDate) return `Until ${fmtUserDateTime(endDate, offsetMinutes, locale)}`;
    return dateLabel || 'All Time';
  };

  const getGeneratedText = () => {
    return fmtUserDateTime(new Date(), offsetMinutes, locale);
  };

  // ✅ Per-line amount fallback (fixes wrong calculation)
  const computeLineTotal = (t: any, item: any) => {
    if (isValidNumber(item?.total)) return Number(item.total);

    const qty = isValidNumber(item?.qty) ? Number(item.qty) : 0;
    const unitPrice = isValidNumber(item?.unitPrice) ? Number(item.unitPrice) : 0;
    const computed = qty * unitPrice;

    if (Number.isFinite(computed) && computed > 0) return computed;

    return 0;
  };

  const getStaffName = (t: any) => {
    return (
      t?.staffName ||
      (t?.user && typeof t.user === 'object' && ((t.user as any).name || (t.user as any).businessName)) ||
      'Admin'
    );
  };

  // --- DRAWING FUNCTIONS ---
  const drawWatermark = () => {
    const text = `TallyPadi • ${businessName}`;
    doc.save();
    doc.translate(pageWidth / 2, pageHeight / 2);
    doc.rotate(-45);
    doc.fillColor(THEME.dark).opacity(0.04);
    doc.fontSize(50);
    doc.text(text, -pageWidth / 2, 0, { align: 'center', width: pageWidth, lineBreak: false });
    doc.restore();
  };

  // ✅ Header now includes Period (with time) + Generated time
  const drawHeader = (title: string) => {
    const HEADER_H = 78; // was 60 — increased to fit period + generated
    doc.rect(0, 0, pageWidth, HEADER_H).fill(THEME.dark);

    doc.circle(margin + 15, 30, 12).fill(THEME.primary);
    doc.fillColor(THEME.white).font('Bold').fontSize(10).text('TP', margin + 8, 26.5);

    doc.fillColor(THEME.white).font('Bold').fontSize(16).text(title, margin + 40, 16);
    doc.fillColor(THEME.muted).font('Regular').fontSize(9).text('TallyPadi Business Intelligence', margin + 40, 36);

    doc.fillColor(THEME.white).font('Bold').fontSize(12)
      .text(businessName, margin, 16, { width: contentWidth, align: 'right' });

    // ✅ Period with time
    doc.fillColor('#94a3b8').font('Regular').fontSize(8)
      .text(`Period: ${getPeriodTextWithTime()}`, margin, 34, { width: contentWidth, align: 'right' });

    // ✅ Generated with time
    doc.fillColor('#94a3b8').font('Regular').fontSize(8)
      .text(`Generated: ${getGeneratedText()}`, margin, 48, { width: contentWidth, align: 'right' });

    // ✅ keep label too (optional, but helps "Today's" / "Weekly")
    if (dateLabel) {
      doc.fillColor('#94a3b8').font('Regular').fontSize(8)
        .text(`Label: ${String(dateLabel).replace(/\s+/g, ' ').trim()}`, margin, 62, { width: contentWidth, align: 'right' });
    }

    // ✅ IMPORTANT: always reset y below header
    doc.y = HEADER_H + 20;
  };

  // ✅ FIXED FOOTER: keep it INSIDE bottom margin to prevent auto new pages
  const drawFooter = (page: number, total: number) => {
    // bottom safe line (inside bottom margin)
    const safeBottom = pageHeight - doc.page.margins.bottom; // ✅ real margin
    const y = safeBottom - 18; // ✅ footer baseline safely above margin

    doc.save();

    doc
      .moveTo(margin, y - 8)
      .lineTo(pageWidth - margin, y - 8)
      .strokeColor(THEME.border)
      .lineWidth(0.5)
      .stroke();

    doc.fillColor(THEME.muted).font('Regular').fontSize(8);

    doc.text('Generated by TallyPadi', margin, y, { lineBreak: false });

    doc.text(`Page ${page} of ${total}`, margin, y, {
      width: contentWidth,
      align: 'right',
      lineBreak: false,
    });

    doc.restore();
  };

  const drawSummaryCards = (title1: string, val1: string, title2: string, val2: string) => {
    const cardW = (contentWidth / 2) - 10;
    const y = doc.y;
    const h = 50;

    doc.roundedRect(margin, y, cardW, h, 6).fill(THEME.bgLight);
    doc.rect(margin, y, 4, h).fill(THEME.primary);
    doc.fillColor(THEME.muted).fontSize(8).font('Bold').text(title1.toUpperCase(), margin + 15, y + 10);
    doc.fillColor(THEME.dark).fontSize(14).font('Bold').text(val1, margin + 15, y + 25);

    const x2 = margin + cardW + 20;
    doc.roundedRect(x2, y, cardW, h, 6).fill(THEME.bgLight);
    doc.rect(x2, y, 4, h).fill(THEME.accent);
    doc.fillColor(THEME.muted).fontSize(8).font('Bold').text(title2.toUpperCase(), x2 + 15, y + 10);
    doc.fillColor(THEME.dark).fontSize(14).font('Bold').text(val2, x2 + 15, y + 25);

    doc.y += h + 30;
  };

  const drawTableHeader = (y: number, headers: string[], widths: number[]) => {
    doc.rect(margin, y, contentWidth, 25).fill(THEME.bgHeader);
    doc.fillColor(THEME.text).font('Bold').fontSize(8);

    let x = margin;
    headers.forEach((h, i) => {
      const align = (h.includes('Amount') || h.includes('Rev') || h.includes('Qty')) ? 'right' : 'left';
      doc.text(h.toUpperCase(), x + 5, y + 8, { width: widths[i] - 10, align, lineBreak: false });
      x += widths[i];
    });
    return y + 25;
  };

  const drawTable = (headers: string[], widths: number[], rows: any[]) => {
    let currentY = drawTableHeader(doc.y, headers, widths);

    doc.font('Regular').fontSize(9);

    rows.forEach((row, idx) => {
      let maxH = 20;
      row.forEach((text: string, i: number) => {
        const h = doc.heightOfString(text, { width: widths[i] - 10 });
        if (h > maxH) maxH = h;
      });
      maxH += 12;

      // ✅ FIX: prevent page breaks from footer area too
      if (currentY + maxH > (bottomLimit - 30)) {
        doc.addPage();
        drawWatermark();
        drawHeader(reportType === 'SALES' ? 'Sales Report' : 'Full Business Report');
        currentY = doc.y; // start after header
        currentY = drawTableHeader(currentY, headers, widths);
        doc.font('Regular').fontSize(9);
      }

      if (idx % 2 !== 0) {
        doc.rect(margin, currentY, contentWidth, maxH).fill(THEME.bgLight);
      }

      let cx = margin;
      row.forEach((text: string, i: number) => {
        const hName = headers[i];
        const isNum = (hName.includes('Amount') || hName.includes('Rev') || hName.includes('Qty'));
        const align = isNum ? 'right' : 'left';

        if (String(text).includes('ALERT')) doc.fillColor(THEME.alert).font('Bold');
        else if (i === row.length - 1) doc.fillColor(THEME.dark).font('Bold');
        else doc.fillColor(THEME.text).font('Regular');

        const textHeight = doc.heightOfString(text, { width: widths[i] - 10 });
        const textY = currentY + (maxH - textHeight) / 2;

        doc.text(text, cx + 5, textY, { width: widths[i] - 10, align });
        cx += widths[i];
      });

      doc
        .moveTo(margin, currentY + maxH)
        .lineTo(margin + contentWidth, currentY + maxH)
        .strokeColor(THEME.border)
        .lineWidth(0.5)
        .stroke();

      currentY += maxH;
    });

    doc.y = currentY + 20;
  };

  // --- REPORT GENERATION LOGIC ---
  drawWatermark();

  if (reportType === 'SALES') {
    drawHeader('Sales Report');

    // ✅ Pull transactions used in the table
    let transactions = await getTodayTransactions(userId, startDate, endDate);

    // ✅ Apply undone filter locally if needed
    if (!options.includeUndone) {
      transactions = (transactions || []).filter((t: any) => !t?.isUndone);
    }

    // ✅ Ensure summary card matches table (recompute revenue from same tx list)
    const revenueFromTx = (transactions || []).reduce(
      (sum: number, t: any) => sum + (isValidNumber(t?.totalMoney) ? Number(t.totalMoney) : 0),
      0
    );

    // (Still call summary if you need other fields in future)
    await getDailySummary(userId, startDate, endDate);

    if (options.includeSummary) {
      drawSummaryCards(
        'Total Revenue',
        formatMoney(revenueFromTx),
        'Total Transactions',
        String(transactions.length)
      );
    }

    if (options.includeTransactions && transactions.length > 0) {
      doc.fillColor(THEME.dark).fontSize(12).font('Bold').text('Transaction History', margin, doc.y);
      doc.y += 10;

      // ✅ UPDATED: Time column now contains "22/12/2025 14:05" so widen it
      const fixedW = 120 + 50 + 90 + 90; // Date/Time + Qty + Amount + Staff
      const itemW = contentWidth - fixedW;

      const headers = ['Date/Time', 'Item Details', 'Qty', 'Amount', 'Staff'];
      const widths = [120, itemW, 50, 90, 90];

      const rows = transactions.flatMap((t: any) => {
        // ✅ REQUIRED: DD/MM/YYYY HH:mm
        const timeStr = fmtDDMMYYYY_HHMM(new Date(t.timestamp), offsetMinutes);

        const staffName = getStaffName(t);

        return (t.items || []).map((item: any) => {
          const lineTotal = computeLineTotal(t, item);
          const qtyText = `${item.qty ?? 0} ${item.unit || ''}`.trim();

          return [
            timeStr,
            item.name || 'Unknown Item',
            qtyText,
            formatMoney(lineTotal),
            staffName,
          ];
        });
      });

      drawTable(headers, widths, rows);
    } else {
      doc.fontSize(10).font('Regular').fillColor(THEME.muted)
        .text('No sales records found for this period.', margin, doc.y + 10);
    }
  } else if (reportType === 'FULL') {
    drawHeader('Business Overview');

    // ✅ Full summary uses your existing service
    const fullData = await getFullSummary(userId, startDate, endDate);

    // ✅ Make Period Revenue consistent (use same tx list approach)
    let txForRevenue = await getTodayTransactions(userId, startDate, endDate);
    if (!options.includeUndone) txForRevenue = (txForRevenue || []).filter((t: any) => !t?.isUndone);

    const periodRevenue = (txForRevenue || []).reduce(
      (sum: number, t: any) => sum + (isValidNumber(t?.totalMoney) ? Number(t.totalMoney) : 0),
      0
    );

    const revenueSummary = await getDailySummary(userId, startDate, endDate);

    if (options.includeSummary) {
      drawSummaryCards(
        'Period Revenue',
        formatMoney(periodRevenue),
        'Active Items',
        String(revenueSummary.items?.length || 0)
      );
    }

    if (options.includeInventory && fullData?.length > 0) {
      doc.fillColor(THEME.dark).fontSize(12).font('Bold').text('Inventory Performance', margin, doc.y);
      doc.y += 10;

      const fixedW = 60 + 60 + 90 + 100;
      const nameW = contentWidth - fixedW;

      const headers = ['Item Name', 'Sold (Paid)', 'Sold (Credit)', 'Stock Level', 'Est. Revenue'];
      const widths = [nameW, 60, 60, 100, 90];

      const rows = fullData.map((item: any) => {
        let stockText = `${item.stock}`;
        if (item.stock < 0) stockText = `ALERT: ${item.stock} (Oversold)`;
        else if (item.stock === 0) stockText = 'Out of Stock';
        else stockText += ` ${item.unit || ''}`;

        return [
          (item.name || '-').toUpperCase(),
          String(item.soldPaid ?? 0),
          String(item.soldCredit ?? 0),
          stockText,
          formatMoney(item.revenue),
        ];
      });

      drawTable(headers, widths, rows);
    } else {
      doc.fontSize(10).font('Regular').fillColor(THEME.muted)
        .text('No inventory data available.', margin, doc.y + 10);
    }
  }

  // --- PAGE BUFFERING ---
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawFooter(i + 1, range.count);
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
};

export const cleanupPdfReports = () => {
  const reportsDir = path.join(process.cwd(), 'public', 'reports');
  if (!fs.existsSync(reportsDir)) return;

  fs.readdir(reportsDir, (err, files) => {
    if (err) return;
    files.forEach((file) => {
      const filePath = path.join(reportsDir, file);
      fs.stat(filePath, (err2, stats) => {
        if (err2) return;
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (stats.mtimeMs < oneDayAgo) fs.unlink(filePath, () => {});
      });
    });
  });
};
