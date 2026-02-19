import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { IInvoice } from '../models/invoice.model';

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
  if (raw.length === 10) return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6)}`;
  return raw.replace(/(.{4})/g, '$1 ').trim();
};

const formatDate = (d: any) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
};

// Extracted rendering logic to support dry-run for height calculation
const drawInvoiceContent = (
  doc: PDFKit.PDFDocument,
  invoice: IInvoice,
  businessName: string,
  currencyCode: string,
  locale: string,
  logoPath: string | undefined,
  isDryRun: boolean
): number => {
  const margin = POS_MARGIN;
  let currentY = margin; // Start from top margin

  const formatMoney = (n: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0
    }).format(Number(n || 0));
  };

  // --- HEADER ---
  // Business Name
  doc.font('Bold').fontSize(14).text(businessName.toUpperCase(), margin, currentY, { width: CONTENT_WIDTH, align: 'center' });
  currentY += doc.heightOfString(businessName.toUpperCase(), { width: CONTENT_WIDTH }) + 4;

  // Title
  doc.font('Regular').fontSize(10).text('INVOICE', margin, currentY, { width: CONTENT_WIDTH, align: 'center' });
  currentY += 14;

  // Meta (Date / Invoice No)
  const metaY = currentY + 10;
  doc.font('Regular').fontSize(9);
  
  doc.text('Date:', margin, metaY);
  doc.text(formatDate(invoice.dateIssued), margin + 30, metaY, { align: 'left' });
  
  doc.text(String(invoice.invoiceNumber || '-'), margin, metaY, { width: CONTENT_WIDTH, align: 'right' });
  currentY = metaY + 14;

  // Customer
  if (invoice.customerName) {
    doc.text('Customer:', margin, currentY);
    doc.font('Bold').text(invoice.customerName, margin + 45, currentY, { width: CONTENT_WIDTH - 45 });
    currentY += doc.heightOfString(invoice.customerName, { width: CONTENT_WIDTH - 45 }) + 4;
  }

  // Divider
  if (!isDryRun) {
    doc.moveTo(margin, currentY).lineTo(POS_WIDTH - margin, currentY).strokeColor(THEME.border).stroke();
  }
  currentY += 8;

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

  doc.font('Bold').fontSize(9);
  doc.text('Qty', colX.qty, currentY, { width: colW.qty, align: 'left' });
  doc.text('Item', colX.desc, currentY, { width: colW.desc, align: 'left' });
  doc.text('Total', colX.total, currentY, { width: colW.total, align: 'right' });
  currentY += 14;

  if (!isDryRun) {
    doc.moveTo(margin, currentY).lineTo(POS_WIDTH - margin, currentY).strokeColor(THEME.border).stroke();
  }
  currentY += 6;

  // --- ITEMS ---
  doc.font('Regular').fontSize(9);
  (invoice.items || []).forEach((item, idx) => {
    const desc = String(item?.name || '-');
    const qty = String(item?.qty ?? 0);
    const rowTotal = formatMoney(item?.total ?? 0);

    const descH = doc.heightOfString(desc, { width: colW.desc });
    const rowH = Math.max(14, descH);

    // Render if not dry run
    if (!isDryRun) {
      doc.text(qty, colX.qty, currentY, { width: colW.qty, align: 'center' });
      doc.text(desc, colX.desc, currentY, { width: colW.desc, align: 'left' });
      doc.text(rowTotal, colX.total, currentY, { width: colW.total, align: 'right' });
    }

    currentY += rowH + 6;
  });

  if (!isDryRun) {
    doc.moveTo(margin, currentY).lineTo(POS_WIDTH - margin, currentY).strokeColor(THEME.border).stroke();
  }
  currentY += 8;

  // --- TOTALS ---
  doc.font('Bold').fontSize(12);
  const totalLabel = 'TOTAL:';
  const totalVal = formatMoney(invoice.totalAmount || 0);

  doc.text(totalLabel, margin, currentY);
  doc.text(totalVal, margin, currentY, { width: CONTENT_WIDTH, align: 'right' });
  currentY += 20;

  // --- BANK INFO ---
  if (invoice.bankDetailsSnapshot) {
    currentY += 10;
    doc.font('Bold').fontSize(10).text('PAYMENT INFO', margin, currentY, { align: 'center' });
    currentY += 14;

    doc.font('Regular').fontSize(9);
    const bankName = invoice.bankDetailsSnapshot.bankName || '';
    const acctNum = formatAcctNumber(invoice.bankDetailsSnapshot.accountNumber);
    const acctName = invoice.bankDetailsSnapshot.accountName || '';

    doc.text(bankName, margin, currentY, { align: 'center' });
    currentY += 12;
    doc.font('Bold').fontSize(11).text(acctNum, margin, currentY, { align: 'center' });
    currentY += 14;
    doc.font('Regular').fontSize(9).text(acctName, margin, currentY, { align: 'center' });
    currentY += 14;
  }

  // --- FOOTER ---
  currentY += 15;
  doc.font('Regular').fontSize(8).fillColor(THEME.muted);
  doc.text('Thank you for your business.', margin, currentY, { width: CONTENT_WIDTH, align: 'center' });
  currentY += 12;
  doc.text('Powered by TallyPadi', margin, currentY, { width: CONTENT_WIDTH, align: 'center' });
  
  return currentY + margin; // Total height
};

export const generateInvoicePdf = async (
  invoice: IInvoice,
  businessName: string,
  countryCode: string = 'NG',
  logoPath?: string
): Promise<Buffer> => {
  const currencyCode = COUNTRY_CURRENCY_CODE[countryCode.toUpperCase()] || 'NGN';
  const locale = 'en-' + countryCode.toUpperCase();

  // 1. Calculate Height (Dry Run)
  const dryDoc = new PDFDocument({ size: [POS_WIDTH, 2000], margin: POS_MARGIN });
  // We need to register fonts even for dry run to get accurate metrics
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
    dryDoc.registerFont('Regular', notoRegular);
    dryDoc.registerFont('Bold', notoBold || notoRegular);
  } else {
    dryDoc.registerFont('Regular', 'Helvetica');
    dryDoc.registerFont('Bold', 'Helvetica-Bold');
  }

  const calculatedHeight = drawInvoiceContent(dryDoc, invoice, businessName, currencyCode, locale, logoPath, true);
  dryDoc.end(); // Discard

  // 2. Generate Real PDF
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [POS_WIDTH, calculatedHeight],
      margins: { top: POS_MARGIN, bottom: POS_MARGIN, left: POS_MARGIN, right: POS_MARGIN },
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

    drawInvoiceContent(doc, invoice, businessName, currencyCode, locale, logoPath, false);

    doc.end();
  });
};