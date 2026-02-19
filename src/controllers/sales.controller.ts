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
  session.startTransaction();
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      return res.status(401).json({ error: "Unauthorized" });
    }

    const items = req.body.items || (Array.isArray(req.body) ? req.body : [req.body]);
    const paymentMethod = req.body.paymentMethod || 'CASH';

    const transaction = await SalesService.recordSale(userId, items, paymentMethod, session);

    await session.commitTransaction();

    return res.json({
      success: true,
      saleId: transaction._id,
      transaction
    });

  } catch (error: any) {
    await session.abortTransaction();
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
  session.startTransaction();
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      await session.abortTransaction();
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { originalSaleId, items } = req.body;
    if (!originalSaleId || !items || !Array.isArray(items)) {
       await session.abortTransaction();
       return res.status(400).json({ error: "Invalid return data" });
    }

    const result = await SalesService.processReturn(userId, { originalSaleId, items }, session);

    await session.commitTransaction();
    // exclude any existing 'success' from result to avoid duplicate property
    const { success: _unusedSuccess, ...resultRest } = result || {};
    res.json({ ...resultRest, success: true, message: "Return processed successfully" });

  } catch (error: any) {
    await session.abortTransaction();
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
      // Cleanup file after download? 
      // pdf.service.ts has a cleanup job, but we can do it here too if desired.
      // Leaving it to the cleanup job or explicit cleanupPdfReports() call is safer for retries.
    });

  } catch (error: any) {
    console.error('PDF Gen Error:', error?.stack || error);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate report' });
  }
};
