import { Schema, model, Document, Types } from 'mongoose';

export interface IDailyStats extends Document {
  user: Types.ObjectId;
  date: string; // "2025-12-09"
  totalRevenue: number;
  totalTransactions: number;
  totalVisits: number;
}

const dailyStatsSchema = new Schema<IDailyStats>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  totalRevenue: { type: Number, default: 0 },
  totalTransactions: { type: Number, default: 0 },
  totalVisits: { type: Number, default: 0 }
});

// Index for fast lookup
dailyStatsSchema.index({ user: 1, date: 1 }, { unique: true });

export const DailyStats = model<IDailyStats>('DailyStats', dailyStatsSchema);