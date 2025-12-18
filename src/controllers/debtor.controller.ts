import { Request, Response } from 'express';
import { Debtor } from '../models/debtor.model'; // Adjust path to your model
import { Transaction } from '../models/transaction.model';
import mongoose from 'mongoose';

// ... (getDebtors, createDebtor, updateDebtor, deleteDebtor remain the same) ...


// 1. GET ALL DEBTORS (With calculated debt total)
export const getDebtors = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Aggregation: Join Debtors with Transactions to sum outstanding debt
    const debtors = await Debtor.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: 'transactions', // Ensure your collection name is 'transactions'
          let: { debtorId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$debtor', '$$debtorId'] }, // Match debtor ID
                    { $eq: ['$isUndone', false] }       // Exclude undone
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                // Sales on Credit (Positive Debt)
                creditTotal: {
                  $sum: {
                    $cond: [{ $eq: ['$paymentStatus', 'CREDIT'] }, '$totalMoney', 0]
                  }
                },
                // Payments (Negative Debt)
                paymentTotal: {
                  $sum: {
                    $cond: [{ $eq: ['$type', 'DEBT_PAYMENT'] }, '$amountPaid', 0]
                  }
                }
              }
            }
          ],
          as: 'financials'
        }
      },
      {
        $addFields: {
          // Calculate balance: (Credit Sales) - (Payments)
          totalDebt: {
            $subtract: [
              { $ifNull: [{ $arrayElemAt: ['$financials.creditTotal', 0] }, 0] },
              { $ifNull: [{ $arrayElemAt: ['$financials.paymentTotal', 0] }, 0] }
            ]
          }
        }
      },
      { $project: { financials: 0 } }, // Cleanup
      { $sort: { totalDebt: -1, updatedAt: -1 } } // Show highest debtors first
    ]);

    res.json(debtors);
  } catch (error) {
    console.error('Get Debtors Error:', error);
    res.status(500).json({ error: 'Failed to fetch debtors' });
  }
};


// ✅ 5. RECORD DEBT PAYMENT (Moved here)
export const recordDebtPayment = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { debtorId, amount, date } = req.body;

    if (!debtorId || !amount) {
      return res.status(400).json({ error: 'Debtor ID and Amount required' });
    }

    // Verify Debtor belongs to User
    const debtor = await Debtor.findOne({ _id: debtorId, user: userId });
    if (!debtor) return res.status(404).json({ error: 'Debtor not found' });

    // Create Payment Transaction
    const tx = await Transaction.create({
      user: userId,
      type: 'DEBT_PAYMENT',
      debtor: debtorId,
      customerName: debtor.displayName,
      amountPaid: Number(amount),
      totalMoney: 0,
      items: [],
      paymentStatus: 'PAID',
      date: date || new Date().toISOString(),
      timestamp: new Date()
    });

    res.json({ success: true, transaction: tx });
  } catch (error) {
    console.error('Record Payment Error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};


// 2. CREATE DEBTOR
export const createDebtor = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { displayName, aliases } = req.body;

    if (!displayName) return res.status(400).json({ error: 'Name is required' });

    const debtor = await Debtor.create({
      user: userId,
      displayName,
      debtorKey: displayName.toLowerCase().trim(),
      aliases: aliases || []
    });

    res.json(debtor);
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Debtor with this name already exists' });
    }
    res.status(500).json({ error: 'Failed to create debtor' });
  }
};

// 3. UPDATE DEBTOR
export const updateDebtor = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { displayName, aliases } = req.body;

    const debtor = await Debtor.findOneAndUpdate(
      { _id: id, user: userId },
      { 
        displayName, 
        debtorKey: displayName.toLowerCase().trim(),
        aliases 
      },
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

    // Optional: Check if they have debt before deleting?
    // For now, just delete the profile (transactions remain in history)
    const result = await Debtor.deleteOne({ _id: id, user: userId });

    if (result.deletedCount === 0) return res.status(404).json({ error: 'Debtor not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete debtor' });
  }
};