import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { IInvoice } from '../models/invoice.model';

const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

const THEME = {
  primary: '#0F766E', // Teal
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

const pickFirstExisting = (paths: string[]) => {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
};

const formatAcctNumber = (acct: string) => {
  const raw = String(acct || '').replace(/\s+/g, '');
  if (!raw) return '';
  // Group by 3-3-4 for 10-digit (common), else group by 4s
  if (raw.length === 10) return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
  return raw.replace(/(.{4})/g, '$1 ').trim();
};

const formatDate = (d: any) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: '2-digit' });
};

export const generateInvoicePdf = async (
  invoice: IInvoice,
  businessName: string,
  countryCode: string = 'NG',
  logoPath?: string
): Promise<Buffer> => {
  // Determine currency
  const currencyCode = COUNTRY_CURRENCY_CODE[countryCode.toUpperCase()] || 'NGN';
  const locale = 'en-' + countryCode.toUpperCase(); // crude locale guess

  // Currency formatter
  const formatMoney = (n: number) => {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 0
    }).format(Number(n || 0));
  };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
      autoFirstPage: true,
    });

    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
    });
    doc.on('error', reject);

    // Fonts (try proper bold if available, fallback safely)
    const notoRegular = pickFirstExisting([
      path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf',
    ]);

    const notoBold = pickFirstExisting([
      path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSans-Bold.ttf'),
      '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
      '/usr/share/fonts/opentype/noto/NotoSans-Bold.ttf',
    ]);

    if (notoRegular) {
      doc.registerFont('Regular', notoRegular);
      doc.registerFont('Bold', notoBold || notoRegular);
    } else {
      doc.registerFont('Regular', 'Helvetica');
      doc.registerFont('Bold', 'Helvetica-Bold');
    }

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = doc.page.margins.left;
    const contentWidth = pageWidth - margin * 2;

    // Layout constants
    const headerTop = 40;
    const safeBottom = 110; // keep space for footer + breathing room
    const tableHeaderHeight = 32;
    const cellPadX = 8;
    const cellPadY = 7;

    const drawHeader = () => {
      // Soft header background strip
      doc.save();
      doc.rect(0, 0, pageWidth, 140).fill(THEME.bgHeader);
      doc.restore();

      // Business name + title (big + clean like your reference PDF)
      doc.fillColor(THEME.dark).font('Bold').fontSize(22).text(businessName.toUpperCase(), margin, headerTop);

      doc.fillColor(THEME.text).font('Regular').fontSize(11).text('INVOICE', margin, headerTop + 28);
      doc.fillColor(THEME.muted).font('Regular').fontSize(9).text('Professional billing document', margin, headerTop + 44);

      // Logo / badge (right)
      const logoBox = { w: 62, h: 62, x: pageWidth - margin - 62, y: headerTop - 2 };
      if (logoPath && fs.existsSync(logoPath)) {
        doc.image(logoPath, logoBox.x, logoBox.y, { width: logoBox.w, height: logoBox.h });
      } else {
        doc.roundedRect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, 10).fill(THEME.primary);
        doc.fillColor(THEME.white).font('Bold').fontSize(16).text('TP', logoBox.x, logoBox.y + 20, {
          width: logoBox.w,
          align: 'center',
        });
      }

      // Meta card (Issued to / Date / Invoice no)
      const cardY = 120;
      const cardH = 74;
      doc.roundedRect(margin, cardY, contentWidth, cardH, 12).lineWidth(1).strokeColor(THEME.border).fill(THEME.white);

      // Left: issued to
      const leftX = margin + 14;
      doc.fillColor(THEME.muted).font('Bold').fontSize(9).text('ISSUED TO', leftX, cardY + 12);

      doc.fillColor(THEME.dark).font('Bold').fontSize(12).text(invoice.customerName || '-', leftX, cardY + 28, {
        width: contentWidth * 0.55,
      });

      // Right: date + invoice no (with invoice number pill)
      const rightX = margin + contentWidth * 0.62;
      doc.fillColor(THEME.muted).font('Bold').fontSize(9).text('DATE ISSUED', rightX, cardY + 12);
      doc.fillColor(THEME.dark).font('Regular').fontSize(11).text(formatDate(invoice.dateIssued), rightX, cardY + 28);

      doc.fillColor(THEME.muted).font('Bold').fontSize(9).text('INVOICE NO', rightX, cardY + 48);

      const invNo = String(invoice.invoiceNumber || '-');
      doc.fontSize(11).font('Bold'); // Set font/size on doc first
      const pillW = Math.min(200, Math.max(120, doc.widthOfString(invNo) + 22));
      const pillX = pageWidth - margin - pillW;
      const pillY = cardY + 44;

      doc.roundedRect(pillX, pillY, pillW, 26, 13).fill(THEME.primary);
      doc.fillColor(THEME.white).font('Bold').fontSize(11).text(invNo, pillX, pillY + 7, { width: pillW, align: 'center' });

      // Divider line under header
      doc.moveTo(margin, cardY + cardH + 18).lineTo(pageWidth - margin, cardY + cardH + 18).strokeColor(THEME.border).stroke();
    };

    // Table columns computed from contentWidth (fixes alignment permanently)
    const colW = {
      desc: Math.floor(contentWidth * 0.52),
      qty: Math.floor(contentWidth * 0.12),
      unit: Math.floor(contentWidth * 0.18),
      total: contentWidth - (Math.floor(contentWidth * 0.52) + Math.floor(contentWidth * 0.12) + Math.floor(contentWidth * 0.18)),
    };
    const colX = {
      desc: margin,
      qty: margin + colW.desc,
      unit: margin + colW.desc + colW.qty,
      total: margin + colW.desc + colW.qty + colW.unit,
    };

    const drawTableHeader = (y: number) => {
      doc.roundedRect(margin, y, contentWidth, tableHeaderHeight, 10).fill(THEME.primary);

      doc.fillColor(THEME.white).font('Bold').fontSize(10);
      doc.text('Description', colX.desc + cellPadX, y + 10, { width: colW.desc - cellPadX * 2, align: 'left' });
      doc.text('Qty', colX.qty + cellPadX, y + 10, { width: colW.qty - cellPadX * 2, align: 'center' });
      doc.text('Unit Price', colX.unit + cellPadX, y + 10, { width: colW.unit - cellPadX * 2, align: 'right' });
      doc.text('Total', colX.total + cellPadX, y + 10, { width: colW.total - cellPadX * 2, align: 'right' });

      return y + tableHeaderHeight;
    };

    const ensureSpace = (nextHeight: number, currentY: number) => {
      if (currentY + nextHeight > pageHeight - safeBottom) {
        doc.addPage();
        drawHeader();
        const startY = 230; // consistent table start after header on new page
        return drawTableHeader(startY) + 2;
      }
      return currentY;
    };

    const drawFooter = () => {
      const footerY = doc.page.height - 70;
      doc.fillColor(THEME.muted).font('Regular').fontSize(9).text('Thank you for your business.', 0, footerY, {
        align: 'center',
      });
    };

    // Build document
    drawHeader();

    // --- TABLE ---
    let y = 230;
    y = drawTableHeader(y) + 2;

    doc.font('Regular').fontSize(10).fillColor(THEME.dark);

    (invoice.items || []).forEach((item, idx) => {
      const desc = String(item?.name || '-');
      const qty = String(item?.qty ?? 0);
      const unitPrice = formatMoney(item?.unitPrice ?? 0);
      const rowTotal = formatMoney(item?.total ?? 0);

      // Measure description height (auto row height)
      const descH = doc.heightOfString(desc, { width: colW.desc - cellPadX * 2, align: 'left' });
      const rowH = Math.max(28, Math.ceil(descH + cellPadY * 2));

      y = ensureSpace(rowH + 2, y);

      // Zebra + border
      if (idx % 2 === 1) {
        doc.rect(margin, y, contentWidth, rowH).fill(THEME.bgLight);
      } else {
        doc.rect(margin, y, contentWidth, rowH).fill(THEME.white);
      }

      doc.lineWidth(0.7).strokeColor(THEME.border).rect(margin, y, contentWidth, rowH).stroke();

      // Cell texts
      doc.fillColor(THEME.dark).font('Regular').fontSize(10);

      doc.text(desc, colX.desc + cellPadX, y + cellPadY, {
        width: colW.desc - cellPadX * 2,
        align: 'left',
      });

      doc.text(qty, colX.qty + cellPadX, y + cellPadY, {
        width: colW.qty - cellPadX * 2,
        align: 'center',
      });

      doc.text(unitPrice, colX.unit + cellPadX, y + cellPadY, {
        width: colW.unit - cellPadX * 2,
        align: 'right',
      });

      doc.text(rowTotal, colX.total + cellPadX, y + cellPadY, {
        width: colW.total - cellPadX * 2,
        align: 'right',
      });

      y += rowH;
    });

    // --- TOTALS BOX ---
    y += 16;
    y = ensureSpace(90, y);

    const totalsBoxH = 62;
    const totalsBoxW = Math.min(260, contentWidth);
    const totalsBoxX = pageWidth - margin - totalsBoxW;

    doc.roundedRect(totalsBoxX, y, totalsBoxW, totalsBoxH, 12).fill(THEME.bgHeader);
    doc.rect(totalsBoxX, y, 5, totalsBoxH).fill(THEME.accent);

    doc.fillColor(THEME.muted).font('Bold').fontSize(9).text('TOTAL', totalsBoxX + 16, y + 12);
    doc.fillColor(THEME.dark).font('Bold').fontSize(18).text(formatMoney(invoice.totalAmount || 0), totalsBoxX + 16, y + 28, {
      width: totalsBoxW - 32,
      align: 'right',
    });

    // --- BANK / PAYMENT INFO (make account number VERY visible) ---
    if (invoice.bankDetailsSnapshot) {
      y += 86;
      y = ensureSpace(140, y);

      const cardH = 105;
      doc.roundedRect(margin, y, contentWidth, cardH, 14).fill(THEME.white);
      doc.lineWidth(1).strokeColor(THEME.border).roundedRect(margin, y, contentWidth, cardH, 14).stroke();
      doc.rect(margin, y, 6, cardH).fill(THEME.primary);

      doc.fillColor(THEME.muted).font('Bold').fontSize(9).text('PAYMENT INFO', margin + 18, y + 14);

      // Bank line
      doc.fillColor(THEME.dark).font('Bold').fontSize(12).text(invoice.bankDetailsSnapshot.bankName, margin + 18, y + 32);

      // Account Name
      doc.fillColor(THEME.text).font('Regular').fontSize(10).text(
        `Account Name: ${invoice.bankDetailsSnapshot.accountName}`,
        margin + 18,
        y + 52
      );

      // Account Number BIG + spaced
      const acct = formatAcctNumber(invoice.bankDetailsSnapshot.accountNumber);
      doc.fillColor(THEME.dark).font('Bold').fontSize(10).text('Account No:', margin + 18, y + 74);

      doc.save();
      doc.fillColor(THEME.primary).font('Bold').fontSize(16);
      doc.text(acct, margin + 105, y + 70, { width: contentWidth - 125, align: 'left' });
      doc.restore();
    }

    // Footer on last page content flow
    drawFooter();

    // Optional: page numbering (safe because bufferPages: true)
    const range = doc.bufferedPageRange(); // { start: 0, count: n }
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(THEME.muted).font('Regular').fontSize(8).text(
        `Page ${i + 1} of ${range.count}`,
        margin,
        doc.page.height - 28,
        { width: contentWidth, align: 'right' }
      );
    }
    doc.switchToPage(range.count - 1);

    doc.end();
  });
};