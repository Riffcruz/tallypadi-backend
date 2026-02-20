import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SalesService } from '../services/sales.service';
import { generatePdfReport } from '../services/pdf.service';
import { Transaction } from '../models/transaction.model'; // For getSaleById if needed direct
import { User } from '../models/user.model';
import path from 'path';
import fs from 'fs';

// =====================================================
// 1) RECORD SALE 
// =====================================================
export const recordSale = async (req: Request | any, res: Response) => {
  const session = await mongoose.startSession();
  let transactionActive = false;

  try {
    session.startTransaction();
    transactionActive = true;
  } catch (err) {
    // If running on standalone Mongo, transactions fail. Proceed without one.
    console.warn("⚠️ Transaction start failed (likely standalone Mongo). Proceeding without transaction.");
    transactionActive = false;
  }

  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      if (transactionActive) await session.abortTransaction();
      return res.status(401).json({ error: "Unauthorized" });
    }

    const items = req.body.items || (Array.isArray(req.body) ? req.body : [req.body]);
    const paymentMethod = req.body.paymentMethod || 'CASH';
    const customerId = req.body.customerId || null;
    const discountAmount = Number(req.body.discountAmount) || 0;

    // If transaction active, pass session. Else pass undefined so service runs normally.
    const sessionToUse = transactionActive ? session : undefined;

    const transaction = await SalesService.recordSale(userId, items, paymentMethod, customerId, discountAmount, sessionToUse as any);

    if (transactionActive) await session.commitTransaction();

    return res.json({
      success: true,
      saleId: transaction._id,
      transaction
    });

  } catch (error: any) {
    if (transactionActive) {
      try { await session.abortTransaction(); } catch (e) { /* ignore */ }
    }

    // RETRY LOGIC for standalone mongo error
    if (transactionActive && error.message && error.message.includes("Transaction numbers are only allowed on a replica set member")) {
       console.warn("⚠️ Transaction failed (standalone Mongo detected). Retrying without transaction.");
       try {
           const userId = req.user?.id || req.user?._id;
           const items = req.body.items || (Array.isArray(req.body) ? req.body : [req.body]);
           const paymentMethod = req.body.paymentMethod || 'CASH';
           const customerId = req.body.customerId || null;
           const discountAmount = Number(req.body.discountAmount) || 0;
           
           const transaction = await SalesService.recordSale(userId, items, paymentMethod, customerId, discountAmount, undefined as any);
           return res.json({
             success: true,
             saleId: transaction._id,
             transaction
           });
       } catch (retryError: any) {
           console.error("Record Sale Retry Error:", retryError);
           return res.status(retryError.message?.includes("Insufficient") ? 409 : 500).json({ 
             error: retryError.message || "Server Error" 
           });
       }
    }

    console.error("Record Sale Error:", error?.stack || error);
    return res.status(error.message?.includes("Insufficient") ? 409 : 500).json({ 
      error: error.message || "Server Error" 
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

    const { startDate, endDate, page, limit } = req.query;

    const result = await SalesService.getHistory(userId, {
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50 // Default 50 items
    });

    res.json(result);
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

    // Basic permission check could be here
    
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
  let transactionActive = false;

  try {
    session.startTransaction();
    transactionActive = true;
  } catch (err) {
    console.warn("⚠️ Transaction start failed (likely standalone Mongo). Proceeding without transaction.");
    transactionActive = false;
  }

  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      if (transactionActive) await session.abortTransaction();
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { originalSaleId, items } = req.body;
    if (!originalSaleId || !items || !Array.isArray(items)) {
       if (transactionActive) await session.abortTransaction();
       return res.status(400).json({ error: "Invalid return data" });
    }

    const sessionToUse = transactionActive ? session : undefined;
    const result = await SalesService.processReturn(userId, { originalSaleId, items }, sessionToUse as any);

    if (transactionActive) await session.commitTransaction();
    
    // exclude any existing 'success' from result to avoid duplicate property
    const { success: _unusedSuccess, ...resultRest } = result || {};
    res.json({ ...resultRest, success: true, message: "Return processed successfully" });

  } catch (error: any) {
    if (transactionActive) {
      try { await session.abortTransaction(); } catch (e) { /* ignore */ }
    }

    // RETRY LOGIC for standalone mongo error
    if (transactionActive && error.message && error.message.includes("Transaction numbers are only allowed on a replica set member")) {
        console.warn("⚠️ Transaction failed (standalone Mongo detected). Retrying return without transaction.");
        try {
            const userId = req.user?.id || req.user?._id;
            const { originalSaleId, items } = req.body;
            const result = await SalesService.processReturn(userId, { originalSaleId, items }, undefined as any);
            
            // exclude any existing 'success' from result to avoid duplicate property
            const { success: _unusedSuccess, ...resultRest } = result || {};
            return res.json({ ...resultRest, success: true, message: "Return processed successfully" });
        } catch (retryError: any) {
            console.error("Process Return Retry Error:", retryError);
            return res.status(500).json({ error: retryError.message || "Server Error" });
        }
    }

    console.error("Process Return Error:", error);
    res.status(500).json({ error: error.message || "Server Error" });
  } finally {
    session.endSession();
  }
};

// =====================================================
// 3) GENERATE PDF REPORT
// =====================================================
export const generateSalesReport = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Fetch User Details for Header & Plan Check
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.planType !== 'TYCOON') {
      return res.status(403).json({ error: 'Upgrade to Tycoon plan to download reports' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const dateLabel = req.query.label || 'Custom Range';

    // Use shared PDF service
    const filename = await generatePdfReport(
      userId, 
      'SALES', 
      dateLabel as string, 
      startDate, 
      endDate,
      { includeSummary: true, includeTransactions: true, includeUndone: false }
    );

    const filePath = path.join(process.cwd(), 'public', 'reports', filename);
    
    // Download and optionally delete after
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error("Download error:", err);
      }
    });

  } catch (error: any) {
    console.error('PDF Gen Error:', error?.stack || error);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate report' });
  }
};

// =====================================================
// 4) CLOSE REGISTER (Z-REPORT)
// =====================================================
import { queuePushNotification } from '../services/queue.service';

export const closeRegister = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { physicalCash } = req.body;
    if (typeof physicalCash !== 'number') {
       return res.status(400).json({ error: "Physical cash amount is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const ownerId = (user.role === 'STAFF' && user.ownerId) ? user.ownerId : user._id;
    const authorName = user.role === 'STAFF' ? user.name : 'Owner';

    // Calculate Today's Sales for this specific user (Cashier)
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Aggregate cash sales
    const sales = await Transaction.find({
      user: userId,
      type: 'SALE',
      date: todayStr,
      isUndone: { $ne: true },
      paymentMethod: 'CASH'
    });

    const expectedCash = sales.reduce((acc, sale) => acc + (sale.amountPaid || 0), 0);
    const discrepancy = physicalCash - expectedCash;

    // Send Push Notification to Owner
    const message = `Register Closed by ${authorName}\nExpected Cash: ${expectedCash}\nActual Cash: ${physicalCash}\nDiscrepancy: ${discrepancy >= 0 ? '+' : ''}${discrepancy}`;

    await queuePushNotification({
      type: 'SINGLE',
      agentId: ownerId.toString(),
      title: '📊 Z-Report (Register Closed)',
      body: message,
    });

    res.json({
      success: true,
      expectedCash,
      physicalCash,
      discrepancy,
      message: 'Register closed successfully. Report sent to owner.'
    });

  } catch (error: any) {
    console.error('Close Register Error:', error);
    res.status(500).json({ error: 'Failed to close register' });
  }
};
