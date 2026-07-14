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

const formatDate = (d: string | Date | number) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: '2-digit' });
};

export const generateInvoicePdf = async (
  invoice: IInvoice,
  businessName: string,
  countryCode: string = 'NG',
  logoPath?: string | Buffer,
  format: 'A4' | 'thermal' = 'A4',
  staffName: string = 'Staff'
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

    // --- THERMAL LAYOUT CALCULATIONS ---
    let pageWidth = 595.28; // A4 default
    let pageHeight = 841.89; // A4 default
    let margin = 40;
    
    if (format === 'thermal') {
        pageWidth = 226; // ~80mm
        margin = 10;
        const contentWidth = pageWidth - margin * 2;
        
        // Exact height calculation via dummy doc dry run
        const dummyDoc = new PDFDocument({ size: [pageWidth, 5000], margins: { top: 20, bottom: 0, left: margin, right: margin } });
        if (notoRegular) {
          dummyDoc.registerFont('Regular', notoRegular);
          dummyDoc.registerFont('Bold', notoBold || notoRegular);
        } else {
          dummyDoc.registerFont('Regular', 'Helvetica');
          dummyDoc.registerFont('Bold', 'Helvetica-Bold');
        }

        let y = 20;

        dummyDoc.font('Bold').fontSize(14);
        y += dummyDoc.heightOfString(businessName.toUpperCase(), { width: contentWidth }) + 5;

        dummyDoc.font('Regular').fontSize(10);
        y += 15;

        y += 12;
        y += 12;
        y += 18;

        y += 10;

        y += 12;
        
        y += 8;

        dummyDoc.font('Regular').fontSize(9);
        const colW = { desc: contentWidth * 0.5 };
        (invoice.items || []).forEach((item) => {
            const desc = String(item?.name || '-');
            // 🚀 OPTIMIZATION: Fast path for thermal
            let descH = 12;
            if (desc.length > 25) { // Thermal columns are narrower
                descH = dummyDoc.heightOfString(desc, { width: colW.desc });
            }
            y += Math.max(descH, 12) + 8;
        });

        y += 10;

        y += 20;

        if (invoice.bankDetailsSnapshot) {
            y += 12;
            y += 12;
            y += 12;
            y += 12;
            y += 20;
        }

        y += 10;
        dummyDoc.font('Regular').fontSize(8);
        y += dummyDoc.heightOfString(`Served by: ${staffName}`, { width: contentWidth });
        y += dummyDoc.heightOfString('Thank you. Powered by TallyPadi.com', { width: contentWidth });
        y += 20; // explicit cushion added in dummy
        
        pageHeight = y;
    } else {
        const dummyDoc = new PDFDocument({ size: [pageWidth, 5000], margins: { top: 50, bottom: 0, left: margin, right: margin } });
        const contentWidth = pageWidth - margin * 2;
        
        if (notoRegular) {
          dummyDoc.registerFont('Regular', notoRegular);
          dummyDoc.registerFont('Bold', notoBold || notoRegular);
        } else {
          dummyDoc.registerFont('Regular', 'Helvetica');
          dummyDoc.registerFont('Bold', 'Helvetica-Bold');
        }

        dummyDoc.font('Regular').fontSize(10);

        const colW_desc = Math.floor(contentWidth * 0.52);
        const cellPadX = 8;
        const cellPadY = 7;
        
        let y = 230; 
        const tableHeaderHeight = 32;
        y += tableHeaderHeight + 2;

        (invoice.items || []).forEach((item) => {
            const desc = String(item?.name || '-');
            // 🚀 OPTIMIZATION: Fast path height calculation instead of PDFKit layout engine
            // If the text is short enough to fit on one line (usually ~45 chars for ColW at 10pt), 
            // skip the expensive `dummyDoc.heightOfString` layout calculation.
            let descH = 12; // Base height for 1 line of 10pt font
            if (desc.length > 40) {
               descH = dummyDoc.heightOfString(desc, { width: colW_desc - cellPadX * 2, align: 'left' });
            }
            const rowH = Math.max(28, Math.ceil(descH + cellPadY * 2));
            y += rowH;
        });

        y += 16;
        const totalsBoxH = 62;
        y += totalsBoxH;

        if (invoice.bankDetailsSnapshot) {
            y += 86; 
            y += 105; 
        }
        
        y += 80;

        pageHeight = y;
    }

    const doc = new PDFDocument({
      size: [pageWidth, pageHeight],
      margins: { top: format === 'thermal' ? 20 : 50, bottom: 0, left: margin, right: margin },
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

    if (notoRegular) {
      doc.registerFont('Regular', notoRegular);
      doc.registerFont('Bold', notoBold || notoRegular);
    } else {
      doc.registerFont('Regular', 'Helvetica');
      doc.registerFont('Bold', 'Helvetica-Bold');
    }

    // Recalculate dimensions based on actual doc setup
    const contentWidth = pageWidth - margin * 2;

    if (format === 'thermal') {
        // --- THERMAL GENERATION ---
        
        let y = 20;

        // Business Name
        doc.fillColor(THEME.dark).font('Bold').fontSize(14).text(businessName.toUpperCase(), margin, y, { align: 'center', width: contentWidth });
        y += doc.heightOfString(businessName.toUpperCase(), { width: contentWidth }) + 5;

        doc.fillColor(THEME.text).font('Regular').fontSize(10).text('INVOICE', margin, y, { align: 'center', width: contentWidth });
        y += 15;

        // Meta Info
        doc.fontSize(9).font('Regular');
        doc.text(`Date: ${formatDate(invoice.dateIssued)}`, margin, y);
        y += 12;
        doc.text(`Invoice: ${invoice.invoiceNumber || '-'}`, margin, y);
        y += 12;
        doc.text(`To: ${invoice.customerName || '-'}`, margin, y);
        y += 18;

        // Divider
        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor(THEME.border).stroke();
        y += 10;

        // Table Header
        const colW = {
            desc: contentWidth * 0.5,
            qty: contentWidth * 0.15,
            total: contentWidth * 0.35
        };
        const colX = {
            desc: margin,
            qty: margin + colW.desc,
            total: margin + colW.desc + colW.qty
        };

        doc.font('Bold').fontSize(9);
        doc.text('Item', colX.desc, y, { width: colW.desc });
        doc.text('Qty', colX.qty, y, { width: colW.qty, align: 'center' });
        doc.text('Total', colX.total, y, { width: colW.total, align: 'right' });
        y += 12;
        
        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor(THEME.border).stroke();
        y += 8;

        // Items
        doc.font('Regular').fontSize(9);
        (invoice.items || []).forEach((item) => {
            const desc = String(item?.name || '-');
            const qty = String(item?.qty ?? 0);
            const rowTotal = formatMoney(item?.total ?? 0);

            const descH = doc.heightOfString(desc, { width: colW.desc });
            const rowH = Math.max(descH, 12) + 8;

            doc.text(desc, colX.desc, y, { width: colW.desc });
            doc.text(qty, colX.qty, y, { width: colW.qty, align: 'center' });
            doc.text(rowTotal, colX.total, y, { width: colW.total, align: 'right' });

            y += rowH;
        });

        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor(THEME.border).stroke();
        y += 10;

        // Total
        const discount = Number(invoice.discount || 0);
        const netTotal = Number(invoice.totalAmount || 0) - discount;
        const pointsEarned = Number(invoice.pointsEarned || 0);

        if (discount > 0) {
            doc.font('Regular').fontSize(10).fillColor(THEME.dark);
            doc.text(`Subtotal: ${formatMoney(invoice.totalAmount || 0)}`, margin, y, { align: 'right', width: contentWidth });
            y += 14;
            doc.text(`Discount: -${formatMoney(discount)}`, margin, y, { align: 'right', width: contentWidth });
            y += 14;
        }

        doc.font('Bold').fontSize(12).fillColor(THEME.dark);
        doc.text(`TOTAL: ${formatMoney(netTotal)}`, margin, y, { align: 'right', width: contentWidth });
        y += 20;

        if (pointsEarned > 0) {
            doc.font('Bold').fontSize(9).fillColor(THEME.dark);
            doc.text(`*** Loyalty Points Earned: ${pointsEarned} ***`, margin, y, { align: 'center', width: contentWidth });
            y += 16;
        }

        // Bank Info (if exists)
        if (invoice.bankDetailsSnapshot) {
            doc.font('Bold').fontSize(9).text('Payment Info:', margin, y);
            y += 12;
            doc.font('Regular').fontSize(9);
            doc.text(invoice.bankDetailsSnapshot.bankName || '', margin, y);
            y += 12;
            doc.text(invoice.bankDetailsSnapshot.accountNumber || '', margin, y);
            y += 12;
            doc.text(invoice.bankDetailsSnapshot.accountName || '', margin, y);
            y += 20;
        }

        // Footer
        y += 10;
        doc.font('Regular').fontSize(8).fillColor(THEME.muted);
        doc.text(`Served by: ${staffName}`, margin, y, { align: 'center', width: contentWidth });
        y += 12;
        doc.text('Thank you. Powered by TallyPadi.com', margin, y, { align: 'center', width: contentWidth });
    } else {
        // --- ORIGINAL A4 GENERATION ---
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
       let hasRenderedLogo = false;
       if (logoPath) {
         try {
           if (Buffer.isBuffer(logoPath) || (typeof logoPath === 'string' && fs.existsSync(logoPath))) {
             doc.image(logoPath, logoBox.x, logoBox.y, { width: logoBox.w, height: logoBox.h });
             hasRenderedLogo = true;
           }
         } catch (err) {
           console.warn('[Invoice PDF] Failed to render brand logo:', err);
         }
       }
       
       if (!hasRenderedLogo) {
         doc.roundedRect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, 10).fill(THEME.primary);
         doc.fillColor(THEME.white).font('Bold').fontSize(16).text('TP', logoBox.x, logoBox.y + 20, {
           width: logoBox.w,
           align: 'center',
         });
       }

      // Meta card (Issued to / Date / Invoice no)
      const cardY = 120;
      const cardH = 74;
      doc.roundedRect(margin, cardY, contentWidth, cardH, 12).lineWidth(1).fillAndStroke(THEME.white, THEME.border);

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
      // Pagination check removed for continuous PDF flow constraint
      return currentY;
    };

    // drawFooter implementation merged into end block inline previously

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

      // 🚀 OPTIMIZATION: Measure description height (auto row height)
      let descH = 12; // Base height for 1 line of 10pt font
      if (desc.length > 40) {
        descH = doc.heightOfString(desc, { width: colW.desc - cellPadX * 2, align: 'left' });
      }
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
    y = ensureSpace(110, y);

    const discount = Number(invoice.discount || 0);
    const netTotal = Number(invoice.totalAmount || 0) - discount;
    const pointsEarned = Number(invoice.pointsEarned || 0);

    const boxLines = 1 + (discount > 0 ? 2 : 0) + (pointsEarned > 0 ? 1 : 0);
    const totalsBoxH = 50 + (boxLines * 16);
    const totalsBoxW = Math.min(260, contentWidth);
    const totalsBoxX = pageWidth - margin - totalsBoxW;

    doc.roundedRect(totalsBoxX, y, totalsBoxW, totalsBoxH, 12).fill(THEME.bgHeader);
    doc.rect(totalsBoxX, y, 5, totalsBoxH).fill(THEME.accent);

    let currentY = y + 14;

    if (discount > 0) {
        doc.fillColor(THEME.muted).font('Regular').fontSize(10).text('Subtotal:', totalsBoxX + 16, currentY);
        doc.fillColor(THEME.dark).font('Regular').fontSize(10).text(formatMoney(invoice.totalAmount || 0), totalsBoxX + 16, currentY, { width: totalsBoxW - 32, align: 'right' });
        currentY += 16;
        doc.fillColor(THEME.muted).text('Discount:', totalsBoxX + 16, currentY);
        doc.fillColor(THEME.alert).text(`-${formatMoney(discount)}`, totalsBoxX + 16, currentY, { width: totalsBoxW - 32, align: 'right' });
        currentY += 16;
    }

    doc.fillColor(THEME.muted).font('Bold').fontSize(9).text('TOTAL', totalsBoxX + 16, currentY);
    currentY += 14;
    doc.fillColor(THEME.dark).font('Bold').fontSize(18).text(formatMoney(netTotal), totalsBoxX + 16, currentY, {
      width: totalsBoxW - 32,
      align: 'right',
    });
    currentY += 24;

    if (pointsEarned > 0) {
        doc.fillColor(THEME.primary).font('Bold').fontSize(10).text(`★ Loyalty Points Earned: ${pointsEarned}`, totalsBoxX + 16, currentY, { width: totalsBoxW - 32, align: 'right' });
    }
    
    y += totalsBoxH;

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
      doc.fillColor(THEME.dark).font('Bold').fontSize(12).text(invoice.bankDetailsSnapshot.bankName || '', margin + 18, y + 32);

      // Account Name
      doc.fillColor(THEME.text).font('Regular').fontSize(10).text(
        `Account Name: ${invoice.bankDetailsSnapshot.accountName || ''}`,
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
      
      y += cardH;
    }

    // Footer on last page content flow
    y += 20;
    const footerY = y; 
    doc.fillColor(THEME.muted).font('Regular').fontSize(9).text('Thank you.', 0, footerY, {
      align: 'center',
    });
    doc.fontSize(8).text(`Served by: ${staffName}  |  Generated by TallyPadi.com`, 0, footerY + 15, {
      align: 'center',
    });

    } // END ELSE (A4)

    doc.end();
  });
};