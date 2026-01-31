import { Schema, model, Document, Types } from 'mongoose';
import { IUser } from './user.model';

export interface IExpense extends Document {
  user: Types.ObjectId | IUser;
  amount: number;
  category?: string;
  description: string;
  date: string; // YYYY-MM-DD
  timestamp: Date;
  messageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    user: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    amount: { 
      type: Number, 
      required: true 
    },
    category: { 
      type: String, 
      default: 'General' 
    },
    description: { 
      type: String, 
      required: true 
    },
    date: { 
      type: String, 
      required: true,
      index: true
    },
    timestamp: { 
      type: Date, 
      default: Date.now,
      index: true
    },
    messageId: { 
      type: String, 
      unique: true, 
      sparse: true 
    },
  },
  { timestamps: true }
);

expenseSchema.index({ user: 1, date: 1 });

export const Expense = model<IExpense>('Expense', expenseSchema);
