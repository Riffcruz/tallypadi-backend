import { Schema, model, Document, Types } from 'mongoose';

export interface IDebtor extends Document {
  user: Types.ObjectId;        // shop owner (NOT staff)
  displayName: string;         // "Emeka Okafor"
  debtorKey: string;           // normalized "emeka okafor"
  aliases: string[];           // optional extra normalized keys
  createdAt: Date;
  updatedAt: Date;
}

const debtorSchema = new Schema<IDebtor>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    displayName: { type: String, required: true, trim: true },
    debtorKey: { type: String, required: true, trim: true, lowercase: true, index: true },
    aliases: { type: [String], default: [] },
  },
  { timestamps: true }
);

// ✅ one debtorKey per shop user
debtorSchema.index({ user: 1, debtorKey: 1 }, { unique: true });

export const Debtor = model<IDebtor>('Debtor', debtorSchema);
