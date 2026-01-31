import { Request, Response } from 'express';
import { expenseService } from '../services/expense.service';
import { IUser } from '../models/user.model';

// Helper to get user from request (assuming auth middleware populates req.user)
const getUser = (req: Request) => (req as any).user as IUser;

export const createExpense = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { amount, description, category, date } = req.body;

    if (!amount || !description) {
      return res.status(400).json({ message: 'Amount and description are required' });
    }

    const expense = await expenseService.createExpense({
      user: user._id,
      amount,
      description,
      category,
      date
    });

    res.status(201).json(expense);
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ message: 'Failed to create expense' });
  }
};

export const getExpenses = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { startDate, endDate, page, limit } = req.query;

    const result = await expenseService.getExpenses(
      String(user._id),
      String(startDate || ''),
      String(endDate || ''),
      Number(limit) || 50,
      Number(page) || 1
    );

    res.json(result);
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ message: 'Failed to fetch expenses' });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const result = await expenseService.deleteExpense(String(user._id), String(id));
    if (!result) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ message: 'Failed to delete expense' });
  }
};
