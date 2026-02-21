import { Schema, model, Document, Types } from 'mongoose';

export interface IDebtor extends Document {
  user: Types.ObjectId;        // shop owner (NOT staff)
  displayName: string;         // "Emeka Okafor"
  debtorKey: string;           // normalized "emeka okafor"
  aliases: string[];           // optional extra normalized keys
  totalDebt: number;           // ✅ Cached balance for frontend speed
  lastProductStr?: string;     // ✅ Cached last purchase string
  // ── Debt Reminder Automation ──
  phone?: string;              // Debtor's WhatsApp number (e.g. 2348012345678)
  dueDate?: Date;              // When the debt is due
  dueDateReminderSent?: boolean; // True after reminder has been sent
  createdAt: Date;
  updatedAt: Date;
}

const debtorSchema = new Schema<IDebtor>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    displayName: { type: String, required: true, trim: true },
    debtorKey: { type: String, required: true, trim: true, lowercase: true, index: true },
    aliases: { type: [String], default: [] },
    // ✅ Added to support real-time dashboard updates
    totalDebt: { type: Number, default: 0 },
    lastProductStr: { type: String, default: '' },
    // ── Debt Reminder Automation ──
    phone: { type: String, trim: true },
    dueDate: { type: Date },
    dueDateReminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ✅ one debtorKey per shop user
debtorSchema.index({ user: 1, debtorKey: 1 }, { unique: true });

export const Debtor = model<IDebtor>('Debtor', debtorSchema);
