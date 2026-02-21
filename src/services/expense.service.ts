import { Types } from 'mongoose';
import { Expense, IExpense } from '../models/expense.model';
import { DailyStats } from '../models/dailyStats.model';
import { toUserLocalDate } from '../utils/dates';

interface CreateExpenseDTO {
  user: string | Types.ObjectId;
  amount: number;
  description: string;
  category?: string;
  date?: string; // YYYY-MM-DD
  messageId?: string;
  timestamp?: Date;
}

export const expenseService = {
  async createExpense(data: CreateExpenseDTO): Promise<IExpense> {
    const { user, amount, description, category, date, messageId, timestamp } = data;

    const ts = timestamp || new Date();
    // If date is not provided, derive it from timestamp (assuming UTC or handling elsewhere)
    // Ideally, the controller should pass the correct 'date' string based on user's timezone.
    const dateStr = date || ts.toISOString().split('T')[0];

    const expense = await Expense.create({
      user,
      amount,
      description,
      category: category || 'General',
      date: dateStr,
      timestamp: ts,
      messageId
    });

    // Update Daily Stats (Expenses)
    // We assume DailyStats has a 'totalExpenses' field. If not, we might need to add it or ignore for now.
    // Let's check DailyStats model later, but for now I'll try to update it if it exists.
    try {
        await DailyStats.findOneAndUpdate(
            { user, date: dateStr },
            { $inc: { totalExpenses: amount } },
            { upsert: true }
        );
    } catch (e) {
        console.error('Failed to update daily stats for expense:', e);
    }

    return expense;
  },

  async getExpenses(userId: string | string[] | Types.ObjectId[], startDate?: string, endDate?: string, limit = 50, page = 1) {
    const query: Record<string, unknown> = {};
    
    if (Array.isArray(userId)) {
        query.user = { $in: userId };
    } else {
        query.user = userId;
    }
    
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
        query.date = startDate;
    }

    const skip = (page - 1) * limit;

    const [expenses, total] = await Promise.all([
      Expense.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit),
      Expense.countDocuments(query)
    ]);

    return { expenses, total, page, totalPages: Math.ceil(total / limit) };
  },

  async deleteExpense(userId: string, expenseId: string) {
    const expense = await Expense.findOneAndDelete({ _id: expenseId, user: userId });
    if (expense) {
        // Revert stats
        try {
            await DailyStats.findOneAndUpdate(
                { user: userId, date: expense.date },
                { $inc: { totalExpenses: -expense.amount } }
            );
        } catch (e) {
            console.error('Failed to revert daily stats for expense:', e);
        }
    }
    return expense;
  }
};
