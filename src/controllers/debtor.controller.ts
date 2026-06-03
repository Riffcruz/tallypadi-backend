import { Request, Response } from 'express';
import { Debtor } from '../models/debtor.model';
import { Transaction } from '../models/transaction.model';
import { DailyStats } from '../models/dailyStats.model';
import mongoose from 'mongoose';
import { applyPaymentToDebts } from '../services/debt.service';

const asMoney = (value: unknown, fallback = 0) => {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
};

export const calculateDebtorTotalFromHistory = (history: any[] = []) => {
  return history.reduce((sum, tx) => {
    if (tx?.type !== 'SALE') return sum;

    const hasStoredBalance = tx.balance !== undefined && tx.balance !== null;
    const balance = hasStoredBalance
      ? asMoney(tx.balance)
      : asMoney(tx.totalMoney) - asMoney(tx.amountPaid);

    return sum + Math.max(0, balance);
  }, 0);
};

export const getLastProductStrFromHistory = (history: any[] = []) => {
  const lastSale = history.find((tx) => tx?.type === 'SALE');
  const items = Array.isArray(lastSale?.items) ? lastSale.items : [];

  return items
    .map((item: any) => String(item?.name || '').trim())
    .filter(Boolean)
    .join(', ');
};

// 1. GET ALL DEBTORS (Includes financial summary & last items)
export const getDebtors = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const debtors = await Debtor.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      
      // Join Transactions to calculate current debt balance and last purchase
      {
        $lookup: {
          from: 'transactions',
          let: { debtorId: '$_id' },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $and: [ 
                    // Check both fields for compatibility
                    { $or: [ { $eq: ['$debtor', '$$debtorId'] }, { $eq: ['$debtorId', '$$debtorId'] } ] }, 
                    { $ne: ['$isUndone', true] } 
                  ] 
                } 
              } 
            },
            { $sort: { timestamp: -1 } }
          ],
          as: 'history'
        }
      },
    ]);

    const summarizedDebtors = debtors
      .map((debtor) => {
        const { history = [], ...rest } = debtor;
        const lastProductStr = getLastProductStrFromHistory(history) || rest.lastProductStr || '';

        return {
          ...rest,
          totalDebt: calculateDebtorTotalFromHistory(history),
          lastProductStr,
        };
      })
      .sort((a, b) => {
        const debtDelta = asMoney(b.totalDebt) - asMoney(a.totalDebt);
        if (debtDelta !== 0) return debtDelta;
        return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      });

    res.json(summarizedDebtors);
  } catch (error) {
    console.error('Get Debtors Error:', error);
    res.status(500).json({ error: 'Failed to fetch debtors' });
  }
};

// 2. CREATE DEBTOR (Supports optional Opening Balance)
export const createDebtor = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { displayName, aliases, initialDebt, initialProduct } = req.body;

    if (!displayName) return res.status(400).json({ error: 'Name is required' });

    const debtAmount = initialDebt ? Number(initialDebt) : 0;

    const debtor = await Debtor.create({
      user: userId,
      displayName,
      debtorKey: displayName.toLowerCase().trim(),
      aliases: aliases || [],
      totalDebt: debtAmount, // Update model directly
      lastProductStr: initialProduct || (debtAmount > 0 ? 'Opening Balance' : '')
    });

    // If an opening balance is provided, create a CREDIT transaction
    if (debtAmount > 0) {
      await Transaction.create({
        user: userId,
        type: 'SALE', 
        paymentStatus: 'CREDIT',
        debtorId: debtor._id,
        customerName: displayName,
        totalMoney: debtAmount,
        amountPaid: 0,
        balance: debtAmount,
        items: [{
          name: initialProduct || 'Opening Balance',
          qty: 1, 
          unit: 'pc',
          unitPrice: debtAmount, 
          total: debtAmount
        }],
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date()
      });
    }

    res.json(debtor);
  } catch (error: any) {
    if (error.code === 11000) return res.status(400).json({ error: 'Debtor already exists' });
    res.status(500).json({ error: 'Failed to create debtor' });
  }
};

// 3. UPDATE DEBTOR
export const updateDebtor = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { displayName, aliases, phone, dueDate } = req.body;

    const updateFields: any = {
      displayName,
      debtorKey: displayName.toLowerCase().trim(),
      aliases,
    };

    // Optional debt reminder fields
    if (phone !== undefined) updateFields.phone = phone?.trim() || null;
    if (dueDate !== undefined) {
      updateFields.dueDate = dueDate ? new Date(dueDate) : null;
      // Reset reminder flag so it fires again if date is updated
      updateFields.dueDateReminderSent = false;
    }

    const debtor = await Debtor.findOneAndUpdate(
      { _id: id, user: userId },
      { $set: updateFields },
      { new: true }
    );

    if (!debtor) return res.status(404).json({ error: 'Debtor not found' });
    res.json(debtor);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update debtor' });
  }
};

// 4. DELETE DEBTOR
export const deleteDebtor = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    
    const result = await Debtor.deleteOne({ _id: id, user: userId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Debtor not found' });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete debtor' });
  }
};

// 5. RECORD DEBT PAYMENT
export const recordDebtPayment = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { debtorId, amount, date } = req.body;

    if (!debtorId || !amount) {
      return res.status(400).json({ error: 'Debtor ID and Amount required' });
    }

    const debtor = await Debtor.findOne({ _id: debtorId, user: userId });
    if (!debtor) return res.status(404).json({ error: 'Debtor not found' });

    const paymentAmount = Number(amount);
    const todayString = date || new Date().toISOString().split('T')[0];

    // Use PAYMENT_RECEIVED to allow aggregation to work correctly with existing logic
    const tx = await Transaction.create({
      user: userId, 
      type: 'PAYMENT_RECEIVED', 
      debtorId: debtorId, 
      customerName: debtor.displayName,
      amountPaid: paymentAmount, 
      totalMoney: paymentAmount, 
      balance: 0,
      items: [], 
      paymentStatus: 'PAID',
      date: todayString, 
      timestamp: new Date()
    });

    // Update matching logic
    const r = await applyPaymentToDebts(userId, debtorId, paymentAmount);
    
    // Update daily stats
    await DailyStats.findOneAndUpdate(
      { user: userId, date: todayString },
      { $inc: { totalRevenue: r.applied || 0, totalTransactions: 1 } },
      { upsert: true }
    );

    // ✅ Sync frontend data + reset reminder state when debt is cleared
    const newBalance = Math.max(0, Number(debtor.totalDebt || 0) - Number(r.applied || 0));
    const reminderReset = newBalance <= 0
      ? { dueDateReminderSent: false, dueDate: null } // ← clear reminder so it can fire on future debts
      : {};

    await Debtor.findByIdAndUpdate(debtorId, {
      $set: { totalDebt: newBalance, ...reminderReset },
    });

    res.json({ success: true, transaction: tx });
  } catch (error) {
    console.error('Payment Error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};
