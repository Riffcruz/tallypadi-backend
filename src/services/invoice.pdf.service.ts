import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { IInvoice } from '../models/invoice.model';

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

// Robust font resolver
const pickFirstExisting = (paths: string[]) => {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
};

export const generateInvoicePdf = async (invoice: IInvoice, businessName: string, logoPath?: string): Promise<string> => {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 40, right: 40 },
    bufferPages: true,
    autoFirstPage: true,
  });

  const filename = `invoice-${invoice.invoiceNumber}.pdf`;
  const tempFilePath = path.join(process.cwd(), 'public', 'reports', filename);
  const dir = path.dirname(tempFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const stream = fs.createWriteStream(tempFilePath);
  doc.pipe(stream);

  // Fonts
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

  const pageWidth = doc.page.width;
  const margin = doc.page.margins.left;
  const contentWidth = pageWidth - margin * 2;

  // --- HEADER ---
  // Business Name
  doc.fillColor(THEME.dark).font('Bold').fontSize(24).text(businessName.toUpperCase(), margin, 50);
  doc.fillColor(THEME.text).font('Regular').fontSize(10).text('INVOICE', margin, 80);

  // Logo (Placeholder if not provided)
  if (logoPath && fs.existsSync(logoPath)) {
      doc.image(logoPath, pageWidth - margin - 60, 50, { width: 60, height: 60 });
  } else {
      // Fallback stylized text box
      doc.rect(pageWidth - margin - 60, 50, 60, 60).fill(THEME.primary);
      doc.fillColor(THEME.white).fontSize(16).text('TP', pageWidth - margin - 45, 68);
  }
  
  // Invoice Meta
  const metaY = 130;
  doc.fillColor(THEME.muted).fontSize(9);
  
  // Left Column: Issued To
  doc.text('Issued to:', margin, metaY);
  doc.fillColor(THEME.dark).font('Bold').fontSize(11).text(invoice.customerName, margin, metaY + 15);
  // doc.font('Regular').fontSize(10).text('client@email.com', margin, metaY + 30); // Placeholder

  // Right Column: Date & Invoice #
  const rightColX = pageWidth - margin - 150;
  doc.fillColor(THEME.muted).font('Regular').fontSize(9).text('Date Issued:', rightColX, metaY);
  doc.fillColor(THEME.dark).font('Bold').fontSize(11).text(new Date(invoice.dateIssued).toLocaleDateString(), rightColX, metaY + 15);

  doc.fillColor(THEME.muted).font('Regular').fontSize(9).text('Invoice No:', rightColX, metaY + 40);
  doc.fillColor(THEME.dark).font('Bold').fontSize(11).text(invoice.invoiceNumber, rightColX, metaY + 55);

  // --- TABLE HEADER ---
  const tableTop = 230;
  const colWidths = [250, 80, 100, 100]; // Description, Qty, Unit Price, Total
  const cols = ['Description', 'Qty', 'Unit Price', 'Total'];
  const colX = [margin, margin + 250, margin + 330, margin + 430];

  doc.rect(margin, tableTop, contentWidth, 30).fill(THEME.primary);
  doc.fillColor(THEME.white).font('Bold').fontSize(10);
  
  cols.forEach((col, i) => {
      const align = i > 1 ? 'right' : 'left';
      doc.text(col, colX[i] + 5, tableTop + 10, { width: colWidths[i] - 10, align });
  });

  // --- TABLE ROWS ---
  let y = tableTop + 30;
  doc.font('Regular').fontSize(10).fillColor(THEME.dark);

  invoice.items.forEach((item, i) => {
      const rowHeight = 30;
      if (i % 2 !== 0) doc.rect(margin, y, contentWidth, rowHeight).fill(THEME.bgLight);
      
      doc.fillColor(THEME.dark);
      doc.text(item.name, colX[0] + 5, y + 10, { width: colWidths[0] - 10 });
      doc.text(String(item.qty), colX[1] + 5, y + 10, { width: colWidths[1] - 10 });
      doc.text(item.unitPrice.toLocaleString(), colX[2] + 5, y + 10, { width: colWidths[2] - 10, align: 'right' });
      doc.text(item.total.toLocaleString(), colX[3] + 5, y + 10, { width: colWidths[3] - 10, align: 'right' });
      
      y += rowHeight;
  });

  // --- TOTALS ---
  y += 20;
  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor(THEME.dark).stroke();
  y += 10;
  
  doc.font('Bold').fontSize(12).text('Total Amount:', pageWidth - margin - 200, y, { width: 100, align: 'right' });
  doc.font('Bold').fontSize(14).text(invoice.totalAmount.toLocaleString(), pageWidth - margin - 90, y - 2, { width: 90, align: 'right' });

  // --- BANK DETAILS ---
  if (invoice.bankDetailsSnapshot) {
      y += 60;
      doc.rect(margin, y, contentWidth, 80).fill(THEME.bgHeader);
      
      doc.fillColor(THEME.muted).font('Bold').fontSize(9).text('PAYMENT INFO', margin + 15, y + 15);
      doc.fillColor(THEME.dark).font('Bold').fontSize(11);
      
      let bankY = y + 35;
      doc.text(invoice.bankDetailsSnapshot.bankName, margin + 15, bankY);
      doc.font('Regular').text(`Account Name: ${invoice.bankDetailsSnapshot.accountName}`, margin + 15, bankY + 15);
      doc.font('Bold').text(`Account No: ${invoice.bankDetailsSnapshot.accountNumber}`, margin + 15, bankY + 30);
  }

  // --- FOOTER ---
  const footerY = doc.page.height - 80;
  doc.font('Bold').fontSize(12).text('Thank you for your business.', 0, footerY, { align: 'center' });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filename));
    stream.on('error', reject);
  });
};
