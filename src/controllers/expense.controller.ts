import { Request, Response } from 'express';
import { expenseService } from '../services/expense.service';
import { IUser, User } from '../models/user.model';

// Helper to get user from request (assuming auth middleware populates req.user)
const getUser = (req: Request) => (req as any).user as IUser;

export const createExpense = async (req: Request, res: Response) => {
  try {
    const reqUser = (req as any).user; // Direct access, avoid misleading IUser cast
    const userId = reqUser.id || reqUser._id;
    const user = await User.findById(userId);
    
    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    const { amount, description, category, date } = req.body;

    if (!amount || !description) {
      return res.status(400).json({ message: 'Amount and description are required' });
    }

    // ✅ Auto-add new category to user's list
    if (category && !user.expenseCategories?.includes(category)) {
      if (!user.expenseCategories) user.expenseCategories = [];
      user.expenseCategories.push(category);
      await user.save();
    }

    const expense = await expenseService.createExpense({
      user: user._id as any,
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

export const getExpenseCategories = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    // Return user's categories or default if empty (though model default should handle this)
    const categories = user.expenseCategories && user.expenseCategories.length > 0 
      ? user.expenseCategories 
      : ['General', 'Rent', 'Utilities', 'Salaries', 'Restocking', 'Miscellaneous'];
      
    res.json(categories);
  } catch (error) {
    console.error('Get expense categories error:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
};
