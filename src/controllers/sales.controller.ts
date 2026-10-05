import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SalesService } from '../services/sales.service';
import { generatePdfReport } from '../services/pdf.service';
import { Transaction } from '../models/transaction.model'; // For getSaleById if needed direct
import { User } from '../models/user.model';
import path from 'path';
import fs from 'fs';
import {
  buildSalePayloadHash,
  normalizeClientSaleId,
  parseClientRecordedAt,
  SaleRequestError,
  SalesIdempotencyService,
} from '../services/salesIdempotency.service';

const isStandaloneTransactionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('Transaction numbers are only allowed on a replica set member')
    || message.includes('Transaction support is not available');
};

const saleErrorStatus = (error: unknown) => {
  if (error instanceof SaleRequestError) return error.status;
  const message = error instanceof Error ? error.message : '';
  if (/Insufficient|Stock modified|already used/i.test(message)) return 409;
  if (/not found|No valid|Invalid|required|must be|older than/i.test(message)) return 400;
  if (/Subscription expired/i.test(message)) return 403;
  return 500;
};

// =====================================================
// 1) RECORD SALE 
// =====================================================
export const recordSale = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  let transactionActive = false;
  let standaloneFallbackUsed = false;
  let userId = '';
  let clientSaleId: string | null = null;
  let stockMutationKey: string | null = null;
  let items: any[] = [];

  try {
    userId = String(req.user?.id || '');
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    items = req.body.items || (Array.isArray(req.body) ? req.body : [req.body]);
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      throw new SaleRequestError('A sale must contain between 1 and 100 items', 'INVALID_SALE_ITEMS', 400);
    }

    const paymentMethod = String(req.body.paymentMethod || 'CASH').toUpperCase();
    if (!['CASH', 'TRANSFER', 'POS', 'OPAY', 'CARD', 'POINTS'].includes(paymentMethod)) {
      throw new SaleRequestError('Unsupported payment method', 'INVALID_PAYMENT_METHOD', 400);
    }
    const customerId = req.body.customerId || null;
    if (customerId && !mongoose.isValidObjectId(customerId)) {
      throw new SaleRequestError('Invalid customer ID', 'INVALID_CUSTOMER_ID', 400);
    }
    const discountAmount = req.body.discountAmount === undefined || req.body.discountAmount === null || req.body.discountAmount === ''
      ? 0
      : Number(req.body.discountAmount);
    if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > 1_000_000_000_000) {
      throw new SaleRequestError('Invalid discount amount', 'INVALID_DISCOUNT', 400);
    }

    for (const item of items) {
      const itemId = String(item?.itemId || item?.id || item?._id || item?.productId || item?.inventoryId || '').trim();
      const quantity = Number(item?.quantity ?? item?.qty ?? item?.sellQty);
      const priceInput = item?.price ?? item?.unitPrice ?? item?.sellPrice ?? item?.lastUnitPrice;
      const price = priceInput === undefined || priceInput === null || priceInput === '' ? null : Number(priceInput);
      if (!mongoose.isValidObjectId(itemId) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
        throw new SaleRequestError('One or more sale items are invalid', 'INVALID_SALE_ITEMS', 400);
      }
      if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1_000_000_000_000)) {
        throw new SaleRequestError('One or more sale prices are invalid', 'INVALID_SALE_PRICE', 400);
      }
    }
    clientSaleId = normalizeClientSaleId(req.body.clientSaleId || req.get('Idempotency-Key'));
    const recordedAtWasProvided = req.body.recordedAt !== undefined && req.body.recordedAt !== null && req.body.recordedAt !== '';
    const clientRecordedAt = parseClientRecordedAt(req.body.recordedAt);
    const source = req.body.offlineCreated === true ? 'WEB_OFFLINE' : 'WEB';

    if (clientSaleId) {
      const existingTransaction = await Transaction.findOne({ user: userId, clientSaleId });
      if (existingTransaction) {
        return res.json({
          success: true,
          duplicate: true,
          saleId: existingTransaction._id,
          transaction: existingTransaction,
        });
      }

      const payloadHash = buildSalePayloadHash({
        items,
        paymentMethod: String(paymentMethod).toUpperCase(),
        customerId: customerId || null,
        discountAmount,
        recordedAt: recordedAtWasProvided ? clientRecordedAt.toISOString() : null,
      });
      const claim = await SalesIdempotencyService.claim(userId, clientSaleId, payloadHash);
      if (!claim.acquired) {
        if (claim.status === 'COMPLETED') {
          const completedTransaction = claim.transactionId
            ? await Transaction.findById(claim.transactionId)
            : await Transaction.findOne({ user: userId, clientSaleId });
          if (completedTransaction) {
            return res.json({
              success: true,
              duplicate: true,
              saleId: completedTransaction._id,
              transaction: completedTransaction,
            });
          }
        }

        return res.status(202).json({
          success: false,
          queued: true,
          code: 'SALE_SYNC_IN_PROGRESS',
          message: 'This sale is already syncing. It will be checked again automatically.',
        });
      }

      stockMutationKey = `${userId}:${clientSaleId}`;
    }

    session.startTransaction();
    transactionActive = true;

    let transaction;
    try {
      transaction = await SalesService.recordSale(
        userId,
        items,
        paymentMethod,
        customerId,
        discountAmount,
        session,
        { clientSaleId, clientRecordedAt, source, stockMutationKey }
      );
      await session.commitTransaction();
      transactionActive = false;
    } catch (error: unknown) {
      if (transactionActive) {
        try { await session.abortTransaction(); } catch { /* ignore */ }
        transactionActive = false;
      }

      if (!isStandaloneTransactionError(error)) throw error;

      if (clientSaleId && String(paymentMethod).toUpperCase() === 'POINTS') {
        throw new SaleRequestError(
          'Customer points cannot be safely verified on this server right now. Choose another payment method.',
          'POINTS_REQUIRES_TRANSACTION',
          409
        );
      }

      standaloneFallbackUsed = true;
      console.warn('⚠️ MongoDB transactions are unavailable. Using guarded standalone sale processing.');
      transaction = await SalesService.recordSale(
        userId,
        items,
        paymentMethod,
        customerId,
        discountAmount,
        undefined,
        { clientSaleId, clientRecordedAt, source, stockMutationKey }
      );
    }

    if (clientSaleId) {
      await SalesIdempotencyService.complete(userId, clientSaleId, transaction._id.toString());
      if (stockMutationKey) {
        const itemIds = items.map((item) => String(item?.itemId || item?.id || item?._id || '')).filter(Boolean);
        SalesService.clearSaleStockMarkers(userId, itemIds, stockMutationKey).catch(console.error);
      }
    }

    return res.json({
      success: true,
      saleId: transaction._id,
      transaction
    });

  } catch (error: unknown) {
    if (transactionActive) {
      try { await session.abortTransaction(); } catch { /* ignore */ }
    }

    if (clientSaleId && userId) {
      // The standalone fallback may have created the transaction before a later
      // non-critical operation failed. Once that durable record exists, the sale
      // is complete and must not have its stock restored or be inserted again.
      const completedTransaction = await Transaction.findOne({ user: userId, clientSaleId }).catch(() => null);
      if (completedTransaction) {
        await SalesIdempotencyService.complete(userId, clientSaleId, completedTransaction._id.toString());
        if (stockMutationKey) {
          const itemIds = items.map((item) => String(item?.itemId || item?.id || item?._id || '')).filter(Boolean);
          SalesService.clearSaleStockMarkers(userId, itemIds, stockMutationKey).catch(console.error);
        }
        return res.json({
          success: true,
          duplicate: true,
          saleId: completedTransaction._id,
          transaction: completedTransaction,
        });
      }
    }

    if (standaloneFallbackUsed && clientSaleId && stockMutationKey) {
      await SalesService.rollbackSaleStock(userId, items, stockMutationKey).catch((rollbackError) => {
        console.error('Offline sale stock rollback failed:', rollbackError);
      });
    }
    if (clientSaleId && userId) await SalesIdempotencyService.fail(userId, clientSaleId, error);

    const msg = error instanceof Error ? error.message : "Server Error";
    console.error("Record Sale Error:", error instanceof Error ? error.stack || error : error);
    return res.status(saleErrorStatus(error)).json({
      error: msg,
      code: error instanceof SaleRequestError ? error.code : undefined,
    });
  } finally {
    session.endSession();
  }
};

// =====================================================
// 2) GET SALES HISTORY
// =====================================================
export const getSalesHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { startDate, endDate, page, limit } = req.query;

    const result = await SalesService.getHistory(userId, {
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50 // Default 50 items
    });

    res.json(result);
  } catch (error: unknown) {
    console.error("Fetch History Error:", error instanceof Error ? error.stack || error : error);
    res.status(500).json({ error: "Server Error" });
  }
};

// =====================================================
// 2.5) GET SALE BY ID
// =====================================================
export const getSaleById = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Sale ID required" });

    const sale = await Transaction.findById(id).populate('user', 'name businessName role');
    if (!sale) return res.status(404).json({ error: "Sale not found" });

    // Basic permission check could be here
    
    res.json(sale);
  } catch (error: unknown) {
    console.error("Get Sale Error:", error);
    res.status(500).json({ error: "Server Error" });
  }
};

// =====================================================
// 2.6) PROCESS RETURN (REFUND)
// =====================================================
export const processReturn = async (req: Request, res: Response) => {
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
    const userId = req.user?.id;
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
    const result = await SalesService.processReturn(userId as string, { originalSaleId, items }, sessionToUse as unknown as mongoose.ClientSession);

    if (transactionActive) await session.commitTransaction();
    
    // exclude any existing 'success' from result to avoid duplicate property
    const { success: _unusedSuccess, ...resultRest } = result || {};
    res.json({ ...resultRest, success: true, message: "Return processed successfully" });

  } catch (error: unknown) {
    if (transactionActive) {
      try { await session.abortTransaction(); } catch (e) { /* ignore */ }
    }

    if (transactionActive && error instanceof Error && error.message && error.message.includes("Transaction numbers are only allowed on a replica set member")) {
        console.warn("⚠️ Transaction failed (standalone Mongo detected). Retrying return without transaction.");
        try {
            const userId = req.user?.id;
            const { originalSaleId, items } = req.body;
            const result = await SalesService.processReturn(userId as string, { originalSaleId, items }, undefined as unknown as mongoose.ClientSession);
            
            // exclude any existing 'success' from result to avoid duplicate property
            const { success: _unusedSuccess, ...resultRest } = result || {};
            return res.json({ ...resultRest, success: true, message: "Return processed successfully" });
        } catch (retryError: unknown) {
            console.error("Process Return Retry Error:", retryError);
            const msg = retryError instanceof Error ? retryError.message : "Server Error";
            return res.status(500).json({ error: msg });
        }
    }

    console.error("Process Return Error:", error);
    const msg = error instanceof Error ? error.message : "Server Error";
    res.status(500).json({ error: msg });
  } finally {
    session.endSession();
  }
};

// =====================================================
// 3) GENERATE PDF REPORT
// =====================================================
export const generateSalesReport = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
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
      userId as unknown as mongoose.Types.ObjectId, 
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

  } catch (error: unknown) {
    console.error('PDF Gen Error:', error instanceof Error ? error.stack || error : error);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate report' });
  }
};

// =====================================================
// 4) CLOSE REGISTER (Z-REPORT)
// =====================================================
import { queuePushNotification } from '../services/queue.service';

export const closeRegister = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
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
      user: userId as unknown as mongoose.Types.ObjectId,
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

  } catch (error: unknown) {
    console.error('Close Register Error:', error);
    res.status(500).json({ error: 'Failed to close register' });
  }
};
