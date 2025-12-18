import { Request, Response } from 'express';
import { Debtor } from '../models/debtor.model';
import { Transaction } from '../models/transaction.model';
import mongoose from 'mongoose';

// 1. GET ALL DEBTORS (Now includes 'lastItems')
export const getDebtors = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    const debtors = await Debtor.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      // Join Transactions to get financial summary
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
            { $sort: { timestamp: -1 } } // Sort by newest first
          ],
          as: 'history'
        }
      },
      {
        $addFields: {
          // Calculate Total Debt
          totalDebt: {
            $reduce: {
              input: '$history',
              initialValue: 0,
              in: {
                $cond: [
                  { $eq: ['$$this.type', 'DEBT_PAYMENT'] },
                  { $subtract: ['$$value', '$$this.amountPaid'] }, // Subtract payments
                  { $add: ['$$value', '$$this.totalMoney'] }       // Add sales/opening balances
                ]
              }
            }
          },
          // Get Last Purchase Info
          lastSale: {
            $arrayElemAt: [
              { 
                $filter: { 
                  input: '$history', 
                  as: 'tx', 
                  cond: { $ne: ['$$tx.type', 'DEBT_PAYMENT'] } // Ignore payments, look for sales
                } 
              }, 
              0 
            ]
          }
        }
      },
      {
        $addFields: {
          // Format the product names: "Rice, Beans"
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
      { $project: { history: 0, lastSale: 0 } }, // Clean up
      { $sort: { totalDebt: -1, updatedAt: -1 } }
    ]);

    res.json(debtors);
  } catch (error) {
    console.error('Get Debtors Error:', error);
    res.status(500).json({ error: 'Failed to fetch debtors' });
  }
};

// 2. CREATE DEBTOR (Now supports Opening Balance)
export const createDebtor = async (req: Request | any, res: Response) => {
  try {
    const userId = req.user?.id;
    // ✅ Receive optional initial debt fields
    const { displayName, aliases, initialDebt, initialProduct } = req.body;

    if (!displayName) return res.status(400).json({ error: 'Name is required' });

    // 1. Create the Profile
    const debtor = await Debtor.create({
      user: userId,
      displayName,
      debtorKey: displayName.toLowerCase().trim(),
      aliases: aliases || []
    });

    // 2. If Opening Balance provided, create a transaction immediately
    if (initialDebt && Number(initialDebt) > 0) {
      await Transaction.create({
        user: userId,
        type: 'SALE', // Treat as a sale to increase debt
        paymentStatus: 'CREDIT',
        debtor: debtor._id,
        customerName: displayName,
        totalMoney: Number(initialDebt),
        // Add a "dummy" item to represent the opening balance product
        items: [{
          name: initialProduct || 'Opening Balance',
          quantity: 1,
          price: Number(initialDebt),
          total: Number(initialDebt)
        }],
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date()
      });
    }

    res.json(debtor);
  } catch (error: any) {
    if (error.code === 11000) return res.status(400).json({ error: 'Debtor name already exists' });
    res.status(500).json({ error: 'Failed to create debtor' });
  }
};

// ... (updateDebtor, deleteDebtor, recordDebtPayment remain the same) ...
export const updateDebtor = async (req: Request | any, res: Response) => {
  /* ... keep existing code ... */
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { displayName, aliases } = req.body;
    const debtor = await Debtor.findOneAndUpdate({ _id: id, user: userId }, { displayName, debtorKey: displayName.toLowerCase().trim(), aliases }, { new: true });
    if (!debtor) return res.status(404).json({ error: 'Debtor not found' });
    res.json(debtor);
  } catch (error) { res.status(500).json({ error: 'Failed to update debtor' }); }
};

export const deleteDebtor = async (req: Request | any, res: Response) => {
  /* ... keep existing code ... */
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    await Debtor.deleteOne({ _id: id, user: userId });
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete debtor' }); }
};

export const recordDebtPayment = async (req: Request | any, res: Response) => {
  /* ... keep existing code ... */
  try {
    const userId = req.user?.id;
    const { debtorId, amount, date } = req.body;
    if (!debtorId || !amount) return res.status(400).json({ error: 'Debtor ID and Amount required' });
    const debtor = await Debtor.findOne({ _id: debtorId, user: userId });
    if (!debtor) return res.status(404).json({ error: 'Debtor not found' });
    const tx = await Transaction.create({
      user: userId, type: 'DEBT_PAYMENT', debtor: debtorId, customerName: debtor.displayName,
      amountPaid: Number(amount), totalMoney: 0, items: [], paymentStatus: 'PAID',
      date: date || new Date().toISOString(), timestamp: new Date()
    });
    res.json({ success: true, transaction: tx });
  } catch (error) { res.status(500).json({ error: 'Failed to record payment' }); }
};