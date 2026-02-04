import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceData {
  documentTitle?: string;
  invoiceNumber: string;
  themeColor?: string;
  date: string;
  dueDate: string;
  currency: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  items: Array<{ description: string; quantity: number; price: number }>;
  logo: string | null;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
}

export const generatePdf = async (data: InvoiceData) => {
  const doc = new jsPDF();

  // Colors
  const primaryColor = data.themeColor || '#10b981';
  const darkColor = '#1e293b'; // slate-800
  const textColor = '#334155'; // slate-700
  const lightColor = '#f1f5f9'; // slate-100

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;

  // Preload TallyPadi Icon for Footer
  let tallyIconBase64: string | null = null;
  try {
      // Basic fetch to get blob and convert to base64
      const response = await fetch('/icon-192x192.png');
      const blob = await response.blob();
      tallyIconBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
      });
  } catch (err) {
      console.warn("Could not load footer icon", err);
  }

  // Add Logo
  if (data.logo) {
    try {
        doc.addImage(data.logo, 'PNG', margin, 20, 30, 30, undefined, 'FAST');
    } catch (e) {
        console.warn("Could not add logo", e);
    }
  }

  // Header (Right Side)
  doc.setFontSize(32);
  doc.setTextColor(primaryColor);
  doc.text(data.documentTitle || 'INVOICE', pageWidth - margin, 35, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setTextColor(textColor);
  doc.text(`#${data.invoiceNumber}`, pageWidth - margin, 42, { align: 'right' });
  doc.text(`Date: ${data.date}`, pageWidth - margin, 47, { align: 'right' });
  if(data.dueDate) doc.text(`Due: ${data.dueDate}`, pageWidth - margin, 52, { align: 'right' });

  // Business Info (Left Side, below logo)
  let yPos = 65;
  doc.setFontSize(12);
  doc.setTextColor(darkColor);
  doc.setFont('helvetica', 'bold');
  doc.text(data.businessName || 'Your Business', margin, yPos);
  
  yPos += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textColor);
  if(data.businessAddress) {
      doc.text(data.businessAddress, margin, yPos);
      yPos += 5 * (data.businessAddress.split('\n').length);
  }
  if(data.businessEmail) { doc.text(data.businessEmail, margin, yPos); yPos += 5; }
  if(data.businessPhone) { doc.text(data.businessPhone, margin, yPos); yPos += 5; }

  // Customer Info (Right Side aligned with Business Info or slightly below)
  yPos = 65; // Reset or adjust
  doc.setFontSize(12);
  doc.setTextColor(darkColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', pageWidth - margin - 80, yPos);
  
  yPos += 6;
  doc.setFontSize(10);
  doc.setTextColor(textColor);
  doc.setFont('helvetica', 'normal');
  doc.text(data.customerName || 'Customer Name', pageWidth - margin - 80, yPos);
  yPos += 5;
  if(data.customerAddress) {
      doc.text(data.customerAddress, pageWidth - margin - 80, yPos);
      yPos += 5 * (data.customerAddress.split('\n').length);
  }
  if(data.customerEmail) { doc.text(data.customerEmail, pageWidth - margin - 80, yPos); yPos += 5; }
  if(data.customerPhone) { doc.text(data.customerPhone, pageWidth - margin - 80, yPos); }

  // Table
  const tableY = Math.max(yPos, 100) + 10;

  const tableColumn = ["Item Description", "Qty", "Price", "Total"];
  const tableRows = data.items.map(item => [
    item.description,
    item.quantity,
    item.price.toLocaleString(),
    (item.quantity * item.price).toLocaleString()
  ]);

  autoTable(doc, {
    startY: tableY,
    head: [tableColumn],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: '#ffffff', fontStyle: 'bold' },
    styles: { textColor: textColor, fontSize: 10 },
    columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' }
    },
  });

  // @ts-ignore
  const finalY = doc.lastAutoTable.finalY + 10;

  // Totals
  doc.setFontSize(10);
  doc.setTextColor(textColor);
  
  const rightColX = pageWidth - margin - 30;
  const labelColX = pageWidth - margin - 70;

  doc.text('Subtotal:', labelColX, finalY, { align: 'right' });
  doc.text(`${data.subtotal.toLocaleString()}`, rightColX, finalY, { align: 'right' });

  if (data.tax > 0) {
      doc.text(`Tax (${data.taxRate}%):`, labelColX, finalY + 7, { align: 'right' });
      doc.text(`${data.tax.toLocaleString()}`, rightColX, finalY + 7, { align: 'right' });
  }

  doc.setFontSize(14);
  doc.setTextColor(primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Total:', labelColX, finalY + 16, { align: 'right' });
  doc.text(`${data.currency} ${data.total.toLocaleString()}`, rightColX, finalY + 16, { align: 'right' });

  // Notes
  if (data.notes) {
      doc.setFontSize(10);
      doc.setTextColor(darkColor);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', margin, finalY + 30);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textColor);
      doc.text(data.notes, margin, finalY + 36, { maxWidth: 120 });
  }

  // Footer
  const footerY = pageHeight - 15;
  doc.setFontSize(8);
  doc.setTextColor('#94a3b8');

  // Draw Footer Icon and Text
  if (tallyIconBase64) {
      const iconSize = 8;
      const text = 'Generated by TallyPadi';
      const textWidth = doc.getTextWidth(text);
      const totalWidth = iconSize + 2 + textWidth;
      const startX = (pageWidth - totalWidth) / 2;

      doc.addImage(tallyIconBase64, 'PNG', startX, footerY - 5, iconSize, iconSize);
      doc.text(text, startX + iconSize + 2, footerY);
  } else {
      doc.text('Generated by TallyPadi (tallypadi.com)', pageWidth / 2, footerY, { align: 'center' });
  }

  doc.save(`${data.documentTitle || 'Invoice'}-${data.invoiceNumber}.pdf`);
};
