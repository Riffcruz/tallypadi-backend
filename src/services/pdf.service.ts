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

// ✅ Theme Configuration (Professional Invoice/Report Palette)
const THEME = {
  primary: '#0F766E',      // Teal 700 (Brand Color)
  accent: '#14B8A6',       // Teal 500 (Highlights)
  dark: '#1E293B',         // Slate 800 (Headings)
  text: '#334155',         // Slate 700 (Body)
  muted: '#64748B',        // Slate 500 (Subtext)
  border: '#E2E8F0',       // Slate 200 (Dividers)
  bgLight: '#F8FAFC',      // Slate 50 (Alternating rows)
  bgHeader: '#F1F5F9',     // Slate 100 (Table Headers)
  alert: '#EF4444',        // Red 500 (Warnings)
  white: '#FFFFFF'
};

const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', US: 'USD', GB: 'GBP', EU: 'EUR', GH: 'GHS',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
};

// ✅ Robust font resolver
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

  const businessName = user.businessName || 'Business Report';
  const rawCountry = (user as any).countryCode || (user as any).profile?.countryCode || 'NG';
  const currencyCode = COUNTRY_CURRENCY_CODE[String(rawCountry).toUpperCase()] || 'NGN';

  // Setup Document
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 40, right: 40 }, // Slightly tighter margins for more data space
    bufferPages: true,
  });

  const filename = `report-${user._id}-${Date.now()}.pdf`;
  const tempFilePath = path.join(process.cwd(), 'public', 'reports', filename);
  const dir = path.dirname(tempFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const stream = fs.createWriteStream(tempFilePath);
  doc.pipe(stream);

  // ✅ Font Registration
  const notoPath = pickFirstExisting([
    path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'), // Priority to local assets if you have them
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf',
  ]);
  
  if (notoPath) {
    doc.registerFont('Regular', notoPath);
    doc.registerFont('Bold', notoPath); // Simulate bold if separate file unavailable
  } else {
    doc.registerFont('Regular', 'Helvetica');
    doc.registerFont('Bold', 'Helvetica-Bold');
  }

  // --- DIMENSIONS ---
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = doc.page.margins.left; // assuming left=right
  const contentWidth = pageWidth - margin * 2;

  // --- HELPERS ---
  const formatMoney = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0;
    return `${currencyCode} ${safe.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtDate = (d?: Date) => d ? d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const getPeriodText = () => {
    if (startDate && endDate) return `${fmtDate(startDate)} — ${fmtDate(endDate)}`;
    if (startDate) return `From ${fmtDate(startDate)}`;
    if (endDate) return `Until ${fmtDate(endDate)}`;
    return dateLabel || 'All Time';
  };

  // --- DRAWING FUNCTIONS ---

  const drawHeader = (title: string) => {
    // 1. Top Bar Background
    doc.rect(0, 0, pageWidth, 60).fill(THEME.dark);
    
    // 2. Logo / Icon
    doc.circle(margin + 15, 30, 12).fill(THEME.primary);
    doc.fillColor(THEME.white).font('Bold').fontSize(10).text('TP', margin + 8, 26.5);

    // 3. Report Title (Left)
    doc.fillColor(THEME.white).font('Bold').fontSize(16)
       .text(title, margin + 40, 18);
    
    doc.fillColor(THEME.muted).font('Regular').fontSize(9)
       .text('TallyPadi Business Intelligence', margin + 40, 38);

    // 4. Business Info (Right)
    doc.fillColor(THEME.white).font('Bold').fontSize(12)
       .text(businessName, margin, 18, { width: contentWidth, align: 'right' });

    doc.fillColor('#94a3b8').font('Regular').fontSize(9)
       .text(getPeriodText(), margin, 36, { width: contentWidth, align: 'right' });
       
    // Reset cursor
    doc.y = 80; 
  };

  const drawFooter = (page: number, total: number) => {
    const y = pageHeight - 35;
    doc.moveTo(margin, y - 10).lineTo(pageWidth - margin, y - 10).strokeColor(THEME.border).lineWidth(0.5).stroke();
    
    doc.fillColor(THEME.muted).font('Regular').fontSize(8);
    doc.text('Generated by TallyPadi', margin, y);
    doc.text(`Page ${page} of ${total}`, margin, y, { width: contentWidth, align: 'right' });
  };

  const drawSummaryCards = (title1: string, val1: string, title2: string, val2: string) => {
    const cardW = (contentWidth / 2) - 10;
    const y = doc.y;
    const h = 50;

    // Card 1
    doc.roundedRect(margin, y, cardW, h, 6).fill(THEME.bgLight);
    doc.rect(margin, y, 4, h).fill(THEME.primary); // Accent strip
    
    doc.fillColor(THEME.muted).fontSize(8).font('Bold').text(title1.toUpperCase(), margin + 15, y + 10);
    doc.fillColor(THEME.dark).fontSize(14).font('Bold').text(val1, margin + 15, y + 25);

    // Card 2
    const x2 = margin + cardW + 20;
    doc.roundedRect(x2, y, cardW, h, 6).fill(THEME.bgLight);
    doc.rect(x2, y, 4, h).fill(THEME.accent); // Accent strip

    doc.fillColor(THEME.muted).fontSize(8).font('Bold').text(title2.toUpperCase(), x2 + 15, y + 10);
    doc.fillColor(THEME.dark).fontSize(14).font('Bold').text(val2, x2 + 15, y + 25);

    doc.y += h + 30; // Spacing after cards
  };

  const drawTable = (headers: string[], widths: number[], rows: any[]) => {
    const startX = margin;
    let currentY = doc.y;
    
    // Header
    doc.font('Bold').fontSize(8).fillColor(THEME.muted);
    let x = startX;
    
    // Draw Header Background
    doc.rect(startX, currentY, contentWidth, 25).fill(THEME.bgHeader);
    
    // Draw Header Text
    doc.fillColor(THEME.text);
    headers.forEach((h, i) => {
      // Auto-align numeric columns (headers with Price, Amount, Cost, Qty)
      const align = (h.includes('Amount') || h.includes('Rev') || h.includes('Qty')) ? 'right' : 'left';
      // Add slight padding to text
      doc.text(h.toUpperCase(), x + 5, currentY + 8, { width: widths[i] - 10, align, lineBreak: false });
      x += widths[i];
    });

    currentY += 25;

    // Rows
    rows.forEach((row, idx) => {
      // Check for page break
      if (currentY + 30 > pageHeight - 50) {
        doc.addPage();
        drawHeader(reportType === 'SALES' ? 'Sales Report' : 'Full Business Report');
        currentY = 80; // Reset Y
        // Redraw Header on new page
        doc.font('Bold').fontSize(8).fillColor(THEME.text);
        doc.rect(startX, currentY, contentWidth, 25).fill(THEME.bgHeader);
        let rx = startX;
        headers.forEach((h, i) => {
          const align = (h.includes('Amount') || h.includes('Rev') || h.includes('Qty')) ? 'right' : 'left';
          doc.text(h.toUpperCase(), rx + 5, currentY + 8, { width: widths[i] - 10, align, lineBreak: false });
          rx += widths[i];
        });
        currentY += 25;
      }

      // Determine Row Height (Dynamic based on longest text)
      doc.font('Regular').fontSize(9);
      let maxH = 20;
      row.forEach((text: string, i: number) => {
        const h = doc.heightOfString(text, { width: widths[i] - 10 });
        if (h > maxH) maxH = h;
      });
      maxH += 12; // Add vertical padding

      // Zebra background
      if (idx % 2 !== 0) {
        doc.rect(startX, currentY, contentWidth, maxH).fill(THEME.bgLight);
      }

      // Draw Cell Text
      let cx = startX;
      row.forEach((text: string, i: number) => {
        const hName = headers[i];
        const isNum = (hName.includes('Amount') || hName.includes('Rev') || hName.includes('Qty'));
        const align = isNum ? 'right' : 'left';

        // Special Styling for Alerts
        if (text.includes('ALERT')) {
          doc.fillColor(THEME.alert).font('Bold');
        } else if (i === row.length - 1) {
             // Last column usually bold/primary
            doc.fillColor(THEME.dark).font('Bold');
        } else {
          doc.fillColor(THEME.text).font('Regular');
        }

        // Vertically center text
        const textHeight = doc.heightOfString(text, { width: widths[i] - 10 });
        const textY = currentY + (maxH - textHeight) / 2;

        doc.text(text, cx + 5, textY, { width: widths[i] - 10, align });
        cx += widths[i];
      });

      // Bottom border for row
      doc.moveTo(startX, currentY + maxH).lineTo(startX + contentWidth, currentY + maxH)
         .strokeColor(THEME.border).lineWidth(0.5).stroke();

      currentY += maxH;
    });

    doc.y = currentY + 20;
  };

  // --- REPORT GENERATION LOGIC ---

  if (reportType === 'SALES') {
    drawHeader('Sales Report');

    const summary = await getDailySummary(userId, startDate, endDate);
    const transactions = await getTodayTransactions(userId, startDate, endDate);

    if (options.includeSummary) {
      drawSummaryCards(
        'Total Revenue', 
        formatMoney(summary.totalRevenue || 0), 
        'Total Transactions', 
        String(transactions.length)
      );
    }

    if (options.includeTransactions && transactions.length > 0) {
      doc.fillColor(THEME.dark).fontSize(12).font('Bold').text('Transaction History', margin, doc.y);
      doc.y += 10;

      // Define Column Widths (Fixed grid to ensure alignment)
      // Time (60), Item (Flex), Qty (40), Amount (80), Staff (80)
      const fixedW = 60 + 50 + 90 + 90;
      const itemW = contentWidth - fixedW;
      
      const headers = ['Time', 'Item Details', 'Qty', 'Amount', 'Staff'];
      const widths = [60, itemW, 50, 90, 90];

      const rows = transactions.flatMap((t: any) => {
        const timeStr = new Date(t.timestamp).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
        const staffName = (t.user as any)?.name || 'Admin';

        // Flatten items into rows
        return (t.items || []).map((item: any) => [
          timeStr,
          item.name || 'Unknown Item',
          `${item.qty} ${item.unit || ''}`,
          formatMoney(item.total),
          staffName
        ]);
      });

      drawTable(headers, widths, rows);
    } else {
        doc.fontSize(10).font('Regular').fillColor(THEME.muted)
           .text('No sales records found for this period.', margin, doc.y + 10);
    }
  } 
  else if (reportType === 'FULL') {
    drawHeader('Business Overview');

    const fullData = await getFullSummary(userId, startDate, endDate);
    const revenueSummary = await getDailySummary(userId, startDate, endDate);

    if (options.includeSummary) {
      drawSummaryCards(
        'Period Revenue', 
        formatMoney(revenueSummary.totalRevenue || 0), 
        'Active Items', 
        String(revenueSummary.items?.length || 0)
      );
    }

    if (options.includeInventory && fullData?.length > 0) {
        doc.fillColor(THEME.dark).fontSize(12).font('Bold').text('Inventory Performance', margin, doc.y);
        doc.y += 10;

        // Columns: Name (Flex), Paid(60), Credit(60), Stock(80), Revenue(90)
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
                formatMoney(item.revenue)
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
    files.forEach(file => {
      const filePath = path.join(reportsDir, file);
      fs.stat(filePath, (err2, stats) => {
        if (err2) return;
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (stats.mtimeMs < oneDayAgo) fs.unlink(filePath, () => {});
      });
    });
  });
};