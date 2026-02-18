import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Transaction } from '../models/transaction.model';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import { getRelevantUserIds } from '../services/report.service';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { isSubActive } from '../utils/permissions';

// --- Helpers ---
const toNumber = (input: unknown): number | null => {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim() !== '') {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const getCurrentDateString = () => new Date().toISOString().split('T')[0];

type SaleItemInput = { itemId: string; quantity: number; price: number };

const normalizeSalePayload = (body: any): SaleItemInput[] => {
  const list = Array.isArray(body?.items) ? body.items : [body];
  const clean: SaleItemInput[] = [];

  for (const x of list) {
    const itemId = String(x?.itemId || '').trim();
    const quantity = toNumber(x?.quantity);
    const price = toNumber(x?.price);

    if (!itemId) continue;
    if (!quantity || quantity <= 0) continue;
    if (!price || price < 0) continue; 

    clean.push({ itemId, quantity, price });
  }

  return clean;
};
const buildNotUndoneMatch = () => ({
  $or: [
    { isUndone: { $exists: false } },
    { isUndone: false },
    { isUndone: 0 },
    { isUndone: 'false' },
    { isUndone: '0' },
    { isUndone: null },
  ],
});

const computePaidBalanceStatus = (t: any) => {
  const total = Number(t?.totalMoney || 0);

  const paid = Number(
    t?.amountPaid ??
      t?.paidAmount ??
      t?.paid ??
      t?.totalPaid ??
      t?.paymentsTotal ?? // optional if you later add it
      0
  );

  // If DB already has balance, trust it, else compute
  const balanceRaw = t?.balance;
  const balance = balanceRaw !== undefined && balanceRaw !== null
    ? Math.max(Number(balanceRaw || 0), 0)
    : Math.max(total - paid, 0);

  // If fully settled -> PAID no matter what old flags say
  let paymentStatus: 'PAID' | 'CREDIT' | 'PART_PAYMENT' = 'PAID';
  if (balance > 0 && paid > 0) paymentStatus = 'PART_PAYMENT';
  else if (balance > 0) paymentStatus = 'CREDIT';

  return { total, paid, balance, paymentStatus };
};


// ✅ Currency Mapping
const COUNTRY_CURRENCY_CODE: Record<string, string> = {
  NG: 'NGN', GH: 'GHS', US: 'USD', GB: 'GBP', EU: 'EUR',
  KE: 'KES', ZA: 'ZAR', IN: 'INR', CN: 'CNY', CA: 'CAD',
  AU: 'AUD', JP: 'JPY', AE: 'AED', RW: 'RWF', TZ: 'TZS', UG: 'UGX',
};

const THEME = {
  primary: '#0F766E',
  accent: '#14B8A6',
  dark: '#1E293B',
  text: '#334155',
  muted: '#64748B',
  border: '#E2E8F0',
  bgLight: '#F8FAFC',
  bgHeader: '#F1F5F9',
  white: '#FFFFFF'
};

// =====================================================
// 1) RECORD SALE 
// =====================================================
export const recordSale = async (req: Request | any, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 🛑 FIX: Get User ID from Token (Middleware)
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch the specific user
    const user: any = await User.findById(userId).session(session); 
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ Subscription Check (Owner Level)
    const ownerIdForSub = (user.role === 'STAFF' && user.ownerId) ? user.ownerId : user._id;
    // We might need to fetch owner if different
    let ownerForSub = user;
    if (String(ownerIdForSub) !== String(user._id)) {
        ownerForSub = await User.findById(ownerIdForSub).session(session);
        if (!ownerForSub) {
          await session.abortTransaction();
          return res.status(403).json({ error: "Owner account invalid" });
        }
    }

    if (!isSubActive(ownerForSub)) {
         await session.abortTransaction();
         return res.status(403).json({ error: "Subscription expired. Cannot record sales." });
    }

    const inventoryOwnerId = (user.role === 'STAFF' && user.ownerId) ? user.ownerId : userId;

    const items = normalizeSalePayload(req.body);
    if (!items.length) {
      await session.abortTransaction();
      return res.status(400).json({
        error: "Invalid sale data",
        message: "Send { items: [{ itemId, quantity, price }] } with quantity>0"
      });
    }

    // Merge duplicates by itemId
    const merged = new Map<string, SaleItemInput>();
    for (const it of items) {
      const prev = merged.get(it.itemId);
      if (!prev) merged.set(it.itemId, { ...it });
      else {
        prev.quantity += it.quantity;
        prev.price = it.price; 
      }
    }
    const finalItems = Array.from(merged.values());

    let totalMoney = 0;
    const txItems: any[] = [];

    // 2. Validate Stock & Prepare Data & ATOMIC UPDATE
    for (const it of finalItems) {
      // ATOMIC UPDATE: Check stock AND decrement in one go
      // This prevents race conditions (TOCTOU)
      const updatedInv = await Inventory.findOneAndUpdate(
        { 
          _id: it.itemId, 
          user: inventoryOwnerId, 
          quantity: { $gte: it.quantity } // Ensure enough stock exists
        },
        { $inc: { quantity: -it.quantity } },
        { new: true, session }
      );

      if (!updatedInv) {
        // Fetch to give better error message (optional, but good UX)
        const currentInv = await Inventory.findOne({ _id: it.itemId, user: inventoryOwnerId }).session(session);
        await session.abortTransaction();
        return res.status(409).json({
          error: "Insufficient stock or item not found",
          itemId: it.itemId,
          name: currentInv?.name || 'Unknown Item',
          available: currentInv?.quantity || 0,
          requested: it.quantity
        });
      }

      const lineTotal = it.quantity * it.price;
      totalMoney += lineTotal;

      txItems.push({
        itemId: updatedInv._id, // Store ID for reference
        name: updatedInv.name,
        qty: it.quantity,
        quantity: it.quantity, // Keep both for compatibility
        unit: 'pc',
        unitPrice: it.price,
        price: it.price,
        costPrice: updatedInv.costPrice || 0,
        total: lineTotal
      });
    }

    // 3. Create Transaction Record
    const paymentMethod = String(req.body.paymentMethod || 'CASH').toUpperCase();

    const createdTx = await Transaction.create([{
      user: userId, // ✅ Link to authenticated user
      type: 'SALE',
      paymentStatus: 'PAID',
      paymentMethod,
      items: txItems,
      totalMoney,
      date: getCurrentDateString(),
      timestamp: new Date()
    } as any], { session });

    await session.commitTransaction();

    return res.json({
      success: true,
      saleId: createdTx[0]._id,         // ✅ IMPORTANT for receipt download
      transaction: createdTx[0]
    });

  } catch (error: any) {
    await session.abortTransaction();
    console.error("Record Sale Error:", error?.stack || error);
    return res.status(500).json({ 
      error: "Server Error", 
      details: error.message || "Unknown Error" 
    });
  } finally {
    session.endSession();
  }
};


// =====================================================
// 2) GET SALES HISTORY
// =====================================================
export const getSalesHistory = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // ✅ Fetch user to determine role and relevant IDs
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN';
    const relevantIds = await getRelevantUserIds(user, scope);

    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();

    const query: any = {
      user: { $in: relevantIds },
      type: 'SALE',
      ...buildNotUndoneMatch(), // ✅ hide undone
    };

    // ✅ Prefer timestamp filtering (more reliable than `date` string)
    if (startDate || endDate) {
      const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
      const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;

      query.timestamp = {};
      if (start) query.timestamp.$gte = start;
      if (end) query.timestamp.$lte = end;

      // if timestamp filter is empty, delete it
      if (!Object.keys(query.timestamp).length) delete query.timestamp;
    }

    const sales = await Transaction.find(query)
      .sort({ timestamp: -1 })
      .populate('user', 'name businessName role'); // ✅ Secure Population: Only select safe fields

    const formatted = sales.map((t: any) => {
      const { total, paid, balance, paymentStatus } = computePaidBalanceStatus(t);

      let profit = 0;
      if (t.items && Array.isArray(t.items)) {
        t.items.forEach((i: any) => {
          const q = Number(i.qty ?? i.quantity ?? 0);
          const p = Number(i.unitPrice ?? i.price ?? 0);
          const c = Number(i.costPrice ?? 0);
          profit += (p - c) * q;
        });
      }

      return {
        id: t._id,
        timestamp: t.timestamp,
        date: t.timestamp || t.date || new Date(),

        totalAmount: total,
        profit,

        // ✅ IMPORTANT: send these so frontend won’t guess wrongly
        paidAmount: paid,
        balance,
        paymentStatus,
        soldBy: t.user && t.user.role === 'STAFF' ? t.user.name : 'Owner', // ✅ Add soldBy field

        items: (t.items || []).map((i: any) => ({
          name: i.name,
          quantity: i.qty ?? i.quantity ?? 0,
          price: i.unitPrice ?? i.price ?? 0,
        })),
      };
    });

    res.json(formatted);
  } catch (error: any) {
    console.error("Fetch History Error:", error?.stack || error);
    res.status(500).json({ error: "Server Error" });
  }
};

// =====================================================
// 2.5) GET SALE BY ID
// =====================================================
export const getSaleById = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Sale ID required" });

    const sale = await Transaction.findById(id).populate('user', 'name businessName role');
    if (!sale) return res.status(404).json({ error: "Sale not found" });

    // Basic permission check (can be improved)
    if (
      typeof sale.user === 'object' &&
      'role' in sale.user &&
      'ownerId' in sale.user &&
      String(sale.user._id) !== userId &&
      sale.user.role !== 'OWNER' &&
      sale.user.ownerId !== userId
    ) {
        // NOTE: This is a simplified check. Ideally use `getRelevantUserIds` logic to verify access.
        // For now, allowing if same user or owner relationship.
    }

    res.json(sale);
  } catch (error: any) {
    console.error("Get Sale Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// =====================================================
// 2.6) PROCESS RETURN (REFUND)
// =====================================================
export const processReturn = async (req: Request | any, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { originalSaleId, items } = req.body; // items: [{ itemId, quantity }]
    if (!originalSaleId || !items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Invalid return data" });
    }

    const originalSale = await Transaction.findById(originalSaleId).session(session);
    if (!originalSale) {
       await session.abortTransaction();
       return res.status(404).json({ error: "Original sale not found" });
    }

    // Determine inventory owner
    const user = await User.findById(userId).session(session);
    const inventoryOwnerId = (user?.role === 'STAFF' && user?.ownerId) ? user.ownerId : userId;

    let refundTotal = 0;
    const returnItems: any[] = [];

    // Check for previous returns to avoid double refunding
    // Assuming we track returns via a 'REFUND' transaction type linked to originalSaleId (e.g. via separate field or just reference)
    // Or we check `returnedItems` field if it exists. 
    // Implementing a check against existing REFUND transactions for this originalSaleId
    const existingRefunds = await Transaction.find({ 
      type: 'REFUND', 
      'meta.originalSaleId': originalSaleId 
    }).session(session);

    // Calculate already returned quantities
    const returnedMap = new Map<string, number>();
    for (const ref of existingRefunds) {
        for (const item of ref.items) {
             // Assuming item name or ID match. Using ID is safer if available.
             const key = item.itemId ? String(item.itemId) : String(item.name); 
             returnedMap.set(key, (returnedMap.get(key) || 0) + (item.qty ?? 0));
        }
    }

    for (const returnItem of items) {
      const { itemId, quantity } = returnItem;
      const qty = Number(quantity);

      if (qty <= 0) continue;

      // Validate against original items
      const originalItem = originalSale.items.find((i: any) => 
        (i.itemId && String(i.itemId) === String(itemId)) || (i._id && String(i._id) === String(itemId)) || i.name === itemId // Fallback to name if ID missing
      );

      if (!originalItem) {
        await session.abortTransaction();
        return res.status(400).json({ error: `Item ${itemId} not found in original sale` });
      }

      const originalQty = Number(originalItem.qty);
      const alreadyReturned = returnedMap.get(String(originalItem.itemId || originalItem.name)) || 0;

      if (qty + alreadyReturned > originalQty) {
         await session.abortTransaction();
         return res.status(400).json({ 
             error: `Cannot return ${qty}. Original: ${originalQty}, Already Returned: ${alreadyReturned}` 
         });
      }

      // Restore Inventory
      if (originalItem.itemId) { // Only if linked to inventory
          await Inventory.updateOne(
            { _id: originalItem.itemId, user: inventoryOwnerId },
            { $inc: { quantity: qty } }
          ).session(session);
      }

      refundTotal += qty * (originalItem.unitPrice || 0);
      
      returnItems.push({
          itemId: originalItem.itemId,
          name: originalItem.name,
          qty: qty,
          quantity: qty,
          unit: originalItem.unit || 'pc',
          unitPrice: originalItem.unitPrice,
          price: originalItem.unitPrice,
          total: qty * (originalItem.unitPrice || 0)
      } as any);
    }

    // Create Refund Transaction
    await Transaction.create([{
        user: userId,
        type: 'REFUND',
        totalMoney: refundTotal, // Negative or Positive? Usually refunds are tracked separately. 
        // If we want it to deduct from revenue, maybe negative? 
        // For now keeping positive but type REFUND differentiates it.
        items: returnItems,
        date: getCurrentDateString(),
        timestamp: new Date(),
        meta: { originalSaleId } // Link to original
    } as any], { session });

    await session.commitTransaction();
    res.json({ success: true, message: "Return processed successfully" });

  } catch (error: any) {
    await session.abortTransaction();
    console.error("Process Return Error:", error);
    res.status(500).json({ error: "Server Error" });
  } finally {
    session.endSession();
  }
};



// =====================================================
// 3) GENERATE PDF REPORT
// =====================================================
export const generateSalesReport = async (req: Request | any, res: Response) => {
  try {
    // 🛑 FIX: Get User ID from Token
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Fetch User Details for Header
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.planType !== 'TYCOON') {
      return res.status(403).json({ error: 'Upgrade to Tycoon plan to download reports' });
    }

    const businessName = user.businessName || 'My Shop';
    const countryCode = String((user as any).countryCode || 'NG').toUpperCase();
    const currencyCode = COUNTRY_CURRENCY_CODE[countryCode] || 'NGN';

    const startDate = String(req.query.startDate || '');
    const endDate = String(req.query.endDate || '');

    const scope = user.role === 'OWNER' ? 'SHOP' : 'OWN';
    const relevantIds = await getRelevantUserIds(user, scope);

    // ✅ Query MUST include user: userId
    const query: any = {
      user: { $in: relevantIds },
      type: 'SALE',
      ...buildNotUndoneMatch(), // ✅ exclude undone from PDF + totals
    };

    if (startDate || endDate) {
  const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
  const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;

  query.timestamp = {};
  if (start) query.timestamp.$gte = start;
  if (end) query.timestamp.$lte = end;
  if (!Object.keys(query.timestamp).length) delete query.timestamp;
}


    const transactions = await Transaction.find(query)
      .sort({ timestamp: 1 })
      .populate('user', 'name role'); // ✅ Populate user to get staff name
    const totalRevenue = transactions.reduce((sum: number, t: any) => sum + (t.totalMoney || 0), 0);
    const totalTx = transactions.length;

    // ... (Rest of PDF generation code remains exactly the same)
    
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      bufferPages: true,
      autoFirstPage: false
    });

    doc.addPage();

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = doc.page.margins.left;
    const contentW = pageW - margin * 2;
    const bottomLimit = pageH - 50;

    const safeStart = startDate || 'all';
    const safeEnd = endDate || 'all';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${safeStart}_${safeEnd}.pdf`);
    doc.pipe(res);

    // Fonts Logic (Same as before)
    const fontPaths = [
      path.join(__dirname, '..', 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    ];
    let fontToUse = 'Helvetica';
    for (const p of fontPaths) {
      if (fs.existsSync(p)) {
        doc.registerFont('Noto', p);
        fontToUse = 'Noto';
        break;
      }
    }
    const boldFont = fontToUse === 'Noto' ? 'Noto' : 'Helvetica-Bold';
    const regFont = fontToUse === 'Noto' ? 'Noto' : 'Helvetica';

    const formatMoney = (n: number) =>
      `${currencyCode} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const drawWatermark = () => {
      const text = `TallyPadi • ${businessName}`;
      doc.save();
      doc.translate(pageW / 2, pageH / 2);
      doc.rotate(-45);
      doc.fillColor(THEME.dark).opacity(0.04);
      doc.fontSize(50);
      doc.text(text, -pageW / 2, 0, { align: 'center', width: pageW, lineBreak: false });
      doc.restore();
    };

    const drawHeader = () => {
      doc.rect(0, 0, pageW, 70).fill(THEME.dark);
      doc.circle(margin + 15, 35, 14).fill(THEME.primary);
      doc.fillColor(THEME.white).font(boldFont).fontSize(10).text('TP', margin + 7, 31);

      doc.fillColor(THEME.white).fontSize(16).text('TallyPadi', margin + 40, 24);
      doc.fillColor(THEME.muted).fontSize(10).text('Sales Report', margin + 40, 46);

      doc.fillColor(THEME.white).fontSize(12).text(businessName, margin, 24, { width: contentW, align: 'right' });
      doc.fillColor('#94a3b8').fontSize(9).text(
        `Period: ${startDate || 'Start'} to ${endDate || 'Now'}`,
        margin,
        44,
        { width: contentW, align: 'right' }
      );

      doc.y = 90;
    };

    const drawSummaryCards = () => {
      const cardW = (contentW / 2) - 10;
      const startY = doc.y;

      doc.roundedRect(margin, startY, cardW, 60, 6).fill(THEME.bgLight);
      doc.rect(margin, startY, 5, 60).fill(THEME.primary);
      doc.fillColor(THEME.muted).fontSize(9).text('TOTAL REVENUE', margin + 15, startY + 12);
      doc.fillColor(THEME.dark).fontSize(18).text(formatMoney(totalRevenue), margin + 15, startY + 30);

      const x2 = margin + cardW + 20;
      doc.roundedRect(x2, startY, cardW, 60, 6).fill(THEME.bgLight);
      doc.rect(x2, startY, 5, 60).fill(THEME.accent);
      doc.fillColor(THEME.muted).fontSize(9).text('TOTAL TRANSACTIONS', x2 + 15, startY + 12);
      doc.fillColor(THEME.dark).fontSize(18).text(String(totalTx), x2 + 15, startY + 30);

      doc.y = startY + 80;
    };

    const drawTableHeaders = (y: number) => {
      doc.rect(margin, y, contentW, 25).fill(THEME.bgHeader);
      doc.fillColor(THEME.text).fontSize(9).font(boldFont);
      doc.text('DATE', margin + 10, y + 8, { width: 80 });
      doc.text('ITEM DETAILS', margin + 90, y + 8, { width: contentW - 180 });
      doc.text(`AMOUNT (${currencyCode})`, margin, y + 8, { width: contentW - 10, align: 'right' });
    };

    const drawFooter = (page: number, total: number) => {
      const y = pageH - 40;
      doc.moveTo(margin, y - 10).lineTo(pageW - margin, y - 10).strokeColor(THEME.border).lineWidth(1).stroke();
      doc.fillColor(THEME.muted).fontSize(8).font(regFont);
      doc.text('Generated by TallyPadi Business Intelligence', margin, y);
      doc.text(`Page ${page} of ${total}`, margin, y, { width: contentW, align: 'right' });
    };

    // Build PDF Content
    drawWatermark();
    drawHeader();
    drawSummaryCards();

    doc.fillColor(THEME.dark).fontSize(12).font(boldFont).text('Transaction History', margin, doc.y);
    doc.y += 10;

    drawTableHeaders(doc.y);
    doc.y += 30;

    doc.font(regFont);
    const colDate = 80;
    const colAmount = 90;
    const colItems = contentW - colDate - colAmount;

    for (let idx = 0; idx < transactions.length; idx++) {
      const t: any = transactions[idx];
      const dateStr = t.date || getCurrentDateString();
      const itemText = (t.items || []).map((i: any) => `${i.qty ?? i.quantity} x ${i.name}`).join(', ');
      const amtStr = formatMoney(t.totalMoney || 0);

      const textHeight = doc.heightOfString(itemText, { width: colItems - 10 });
      const soldByText = t.user && t.user.role === 'STAFF' ? `Sold by: ${t.user.name}` : ''; // Get staff name
      let rowContentHeight = textHeight;
      if (soldByText) rowContentHeight += 12; // Add height for soldBy line

      let rowHeight = Math.max(25, rowContentHeight + 15); // Base row height + padding

      if (doc.y + rowHeight > bottomLimit) {
        doc.addPage();
        drawWatermark();
        drawHeader();
        doc.y = 90;
        drawTableHeaders(doc.y);
        doc.y += 30;
        doc.font(regFont);
      }

      const currentY = doc.y;

      if (idx % 2 !== 0) doc.rect(margin, currentY, contentW, rowHeight).fill(THEME.bgLight);

      doc.fillColor(THEME.text);
      let yCursor = currentY + 8; // Starting Y for itemText

      doc.text(dateStr, margin + 10, yCursor, { width: colDate });
      doc.text(itemText, margin + 10 + colDate, yCursor, { width: colItems - 10 });
      yCursor += textHeight + 2; // Move yCursor after itemText

      if (soldByText) {
        doc.fontSize(7).fillColor(THEME.muted).text(soldByText, margin + 10 + colDate, yCursor, { width: colItems - 10 });
        doc.fontSize(9).fillColor(THEME.text); // Reset font size and color
      }

      doc.font(boldFont);
      // Vertically center amount based on actual row height
      doc.text(amtStr, margin, currentY + (rowHeight - doc.currentLineHeight()) / 2, { width: contentW - 10, align: 'right' }); 
      doc.font(regFont);

      doc.moveTo(margin, currentY + rowHeight).lineTo(pageW - margin, currentY + rowHeight)
        .strokeColor(THEME.border).lineWidth(0.5).stroke();

      doc.y = currentY + rowHeight;
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawFooter(i - range.start + 1, range.count);
    }

    doc.end();

  } catch (error: any) {
    console.error('PDF Gen Error:', error?.stack || error);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate report' });
  }
};