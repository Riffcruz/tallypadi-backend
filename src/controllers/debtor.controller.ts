import { Request, Response } from 'express';
import { Debtor } from '../models/debtor.model';
import { Transaction } from '../models/transaction.model';
import mongoose from 'mongoose';

// 1. GET ALL DEBTORS (Includes financial summary & last items)
export const getDebtors = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const debtors = await Debtor.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      
      // Join Transactions to calculate total debt balance
      {
        $lookup: {
          from: 'transactions',
          let: { debtorId: '$_id' },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $and: [ 
                    { $eq: ['$debtor', '$$debtorId'] }, 
                    { $eq: ['$isUndone', false] } 
                  ] 
                } 
              } 
            },
            { $sort: { timestamp: -1 } }
          ],
          as: 'history'
        }
      },
      
      {
        $addFields: {
          // Balance Calculation: (Sales/Credits) - (Payments Received)
          totalDebt: {
            $reduce: {
              input: '$history',
              initialValue: 0,
              in: {
                $cond: [
                  { $eq: ['$$this.type', 'DEBT_PAYMENT'] },
                  { $subtract: ['$$value', { $ifNull: ['$$this.amountPaid', 0] }] },
                  { $add: ['$$value', { $ifNull: ['$$this.totalMoney', 0] }] }
                ]
              }
            }
          },
          // Identify the most recent Sale to show what was bought
          lastSale: {
            $arrayElemAt: [
              { 
                $filter: { 
                  input: '$history', 
                  as: 'tx', 
                  cond: { $ne: ['$$tx.type', 'DEBT_PAYMENT'] } 
                } 
              }, 
              0 
            ]
          }
        }
      },
      
      {
        $addFields: {
          // Clean string for UI: "Item A, Item B"
          lastProductStr: {
            $reduce: {
              input: '$lastSale.items',
              initialValue: '',
              in: {
                $cond: [
                  { $eq: ['$$value', ''] },
                  '$$this.name',
                  { $concat: ['$$value', ', ', '$$this.name'] }
                ]
              }
            }
          }
        }
      },
      
      { $project: { history: 0, lastSale: 0 } },
      { $sort: { totalDebt: -1, updatedAt: -1 } }
    ]);

    res.json(debtors);
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

    const debtor = await Debtor.create({
      user: userId,
      displayName,
      debtorKey: displayName.toLowerCase().trim(),
      aliases: aliases || []
    });

    // If an opening balance is provided, create a CREDIT transaction
    if (initialDebt && Number(initialDebt) > 0) {
      const debtAmount = Number(initialDebt);
      await Transaction.create({
        user: userId,
        type: 'SALE', 
        paymentStatus: 'CREDIT',
        debtor: debtor._id,
        customerName: displayName,
        totalMoney: debtAmount,
        amountPaid: 0,
        balance: debtAmount,
        items: [{
          name: initialProduct || 'Opening Balance',
          qty: 1, // ✅ Updated to match model
          unit: 'pc',
          unitPrice: debtAmount, // ✅ Updated to match model
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

    const tx = await Transaction.create({
      user: userId, 
      type: 'DEBT_PAYMENT', 
      debtor: debtorId, 
      customerName: debtor.displayName,
      amountPaid: paymentAmount, 
      totalMoney: 0, 
      balance: 0,
      items: [], 
      paymentStatus: 'PAID',
      date: date || new Date().toISOString().split('T')[0], 
      timestamp: new Date()
    });

    res.json({ success: true, transaction: tx });
  } catch (error) {
    console.error('Payment Error:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
};