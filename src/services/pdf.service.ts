import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { getDailySummary, getFullSummary, getTodayTransactions } from './report.service';
import { Transaction } from '../models/transaction.model';
import { User } from '../models/user.model'; 

interface ReportOptions {
    includeSummary?: boolean;
    includeTransactions?: boolean;
    includeInventory?: boolean;
}

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

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const filename = `report-${user._id}-${Date.now()}.pdf`;
    const tempFilePath = path.join(process.cwd(), 'public', 'reports', filename);

    // Ensure the directory exists
    const dir = path.dirname(tempFilePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(tempFilePath);
    doc.pipe(stream);

    // --- HELPER: Draw Table Row ---
    const drawRow = (y: number, columns: string[], columnWidths: number[], isHeader: boolean = false, rowIndex: number = 0) => {
        let currentX = 50;
        
        // Background for header or zebra striping
        if (isHeader) {
            doc.rect(50, y - 5, 495, 20).fill('#f3f4f6');
            doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9);
        } else {
            if (rowIndex % 2 !== 0) {
                doc.rect(50, y - 5, 495, 20).fill('#f9fafb'); // Light gray for odd rows
            }
            doc.fillColor('#1f2937').font('Helvetica').fontSize(9);
        }

        columns.forEach((text, i) => {
            // Check if text indicates negative stock to color it red
            if (!isHeader && (text.includes('Oversold') || text.includes('⚠️'))) {
                doc.fillColor('#dc2626'); // Red
            }
            
            doc.text(text, currentX + 5, y, { 
                width: columnWidths[i] - 10, 
                align: 'left', 
                lineBreak: false, 
                ellipsis: true 
            });
            
            // Reset color
            if (!isHeader) doc.fillColor('#1f2937');
            
            currentX += columnWidths[i];
        });
        
        // Bottom border for all rows
        doc.moveTo(50, y + 15).lineTo(545, y + 15).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
    };

    // Format Period to include actual date
    let periodText = dateLabel;
    if (startDate) {
        const dateStr = startDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
        if (!dateLabel.toLowerCase().includes(dateStr.toLowerCase())) {
             periodText = `${dateLabel} (${dateStr})`;
        }
    }

    // Helper for safe currency display
    const formatMoney = (amount: number) => `NGN ${amount.toLocaleString('en-NG')}`;

    // --- HEADER ---
    doc.rect(0, 0, 600, 10).fill('#16a34a'); // Green top bar
    doc.moveDown(2);
    
    doc.fontSize(24).fillColor('#16a34a').font('Helvetica-Bold').text('Tallypadi', { align: 'left' });
    doc.fontSize(10).fillColor('#6b7280').font('Helvetica').text('Automated Business Report', { align: 'left' });
    doc.moveUp(2);
    
    // Shop Info (Right Aligned)
    doc.fontSize(14).fillColor('#111827').text(user.businessName || 'Your Shop', { align: 'right' });
    doc.fontSize(10).fillColor('#4b5563').text(`Period: ${periodText}`, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleString('en-NG')}`, { align: 'right' });
    
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(1.5);

    let currentY = doc.y;

    // --- SALES REPORT ---
    if (reportType === 'SALES') {
        const summary = await getDailySummary(userId, startDate, endDate);
        const transactions = await getTodayTransactions(userId, startDate, endDate);

        if (options.includeSummary) {
            // Summary Cards Logic (Simulated with Rectangles)
            const boxY = currentY;
            
            // Revenue Box
            doc.roundedRect(50, boxY, 240, 60, 5).fill('#f0fdf4').stroke('#16a34a');
            doc.fillColor('#166534').fontSize(10).font('Helvetica-Bold').text('TOTAL REVENUE', 70, boxY + 15);
            doc.fontSize(16).text(formatMoney(summary.totalRevenue), 70, boxY + 35);
            
            // Transactions Box
            doc.roundedRect(305, boxY, 240, 60, 5).fill('#eff6ff').stroke('#2563eb');
            doc.fillColor('#1e40af').fontSize(10).font('Helvetica-Bold').text('TRANSACTIONS', 325, boxY + 15);
            doc.fontSize(16).text(transactions.length.toString(), 325, boxY + 35);
            
            currentY += 90;
        }

        if (options.includeTransactions && transactions.length > 0) {
            doc.fontSize(12).fillColor('#111827').font('Helvetica-Bold').text('Transaction History', 50, currentY);
            currentY += 20;

            const headers = ['Time', 'Item', 'Qty', 'Amount', 'Staff'];
            const colWidths = [70, 190, 70, 90, 75];

            drawRow(currentY, headers, colWidths, true);
            currentY += 20;

            transactions.forEach((t, index) => {
                const date = new Date(t.timestamp);
                const timeStr = date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
                const staffName = (t.user as any).name || (t.user as any).phoneNumber || 'Owner';

                t.items.forEach((item: any) => {
                    const itemTotal = item.total ? formatMoney(item.total) : '-';
                    const unitLabel = item.unit ? ` ${item.unit}` : '';
                    
                    if (currentY > 750) {
                        doc.addPage();
                        currentY = 50;
                        drawRow(currentY, headers, colWidths, true);
                        currentY += 20;
                    }

                    drawRow(currentY, [
                        timeStr,
                        item.name,
                        `${item.qty}${unitLabel}`,
                        itemTotal,
                        staffName
                    ], colWidths, false, index);
                    currentY += 20;
                });
            });
        } else {
            doc.font('Helvetica-Oblique').text('No sales recorded for this period.', 50, currentY);
        }
    } 
    // --- FULL REPORT ---
    else if (reportType === 'FULL') {
        const fullData = await getFullSummary(userId, startDate, endDate);
        const revenueSummary = await getDailySummary(userId, startDate, endDate);

        if (options.includeSummary) {
            // Summary Cards
            const boxY = currentY;
            doc.roundedRect(50, boxY, 240, 60, 5).fill('#f0fdf4');
            doc.fillColor('#166534').fontSize(10).font('Helvetica-Bold').text('TOTAL REVENUE', 70, boxY + 15);
            doc.fontSize(16).text(formatMoney(revenueSummary.totalRevenue), 70, boxY + 35);
            
            doc.roundedRect(305, boxY, 240, 60, 5).fill('#eff6ff');
            doc.fillColor('#1e40af').fontSize(10).font('Helvetica-Bold').text('ITEMS SOLD', 325, boxY + 15);
            doc.fontSize(16).text(revenueSummary.items.length.toString(), 325, boxY + 35);
            
            currentY += 90;
        }

        if (options.includeInventory && fullData.length > 0) {
            doc.fontSize(12).fillColor('#111827').font('Helvetica-Bold').text('Inventory & Sales Breakdown', 50, currentY);
            currentY += 20;

            const headers = ['Item Name', 'Sold (Paid)', 'Sold (Credit)', 'Stock Left', 'Revenue'];
            const colWidths = [160, 75, 75, 90, 95];

            drawRow(currentY, headers, colWidths, true);
            currentY += 20;

            fullData.forEach((item, index) => {
                const unit = item.unit || 'units';
                const revenue = item.revenue > 0 ? formatMoney(item.revenue) : '-';
                
                if (currentY > 750) {
                    doc.addPage();
                    currentY = 50;
                    drawRow(currentY, headers, colWidths, true);
                    currentY += 20;
                }

                // Warn about negative stock
                let stockText = `${item.stock} ${unit}`;
                if (item.stock < 0) {
                     stockText = `⚠️ -${Math.abs(item.stock)} (Oversold)`;
                }

                drawRow(currentY, [
                    item.name.toUpperCase(),
                    `${item.soldPaid}`,
                    `${item.soldCredit}`,
                    stockText,
                    revenue
                ], colWidths, false, index);
                
                currentY += 20;
            });
        } else {
            doc.font('Helvetica-Oblique').text('No inventory data found.', 50, currentY);
        }
    }

    // --- FOOTER ---
    const footerText = 'Generated by Tallypadi | Business Intelligence for Nigerian SMEs';
    const footerY = doc.page.height - 40;
    
    // Draw Footer Line
    doc.moveTo(50, footerY - 10).lineTo(545, footerY - 10).strokeColor('#e5e7eb').lineWidth(1).stroke();
    
    doc.fontSize(8).fillColor('#9ca3af').text(footerText, 50, footerY, { align: 'center', width: 495 });

    doc.end();

    return new Promise((resolve, reject) => {
        stream.on('finish', () => resolve(filename));
        stream.on('error', reject);
    });
};

// Cleanup old PDF files
export const cleanupPdfReports = () => {
    const reportsDir = path.join(process.cwd(), 'public', 'reports');
    if (!fs.existsSync(reportsDir)) return;

    fs.readdir(reportsDir, (err, files) => {
        if (err) return console.error('Error reading reports dir:', err);
        files.forEach(file => {
            const filePath = path.join(reportsDir, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                if (stats.mtimeMs < twentyFourHoursAgo) {
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
};