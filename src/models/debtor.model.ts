import { Schema, model, Document, Types } from 'mongoose';

export interface IDebtor extends Document {
  user: Types.ObjectId;              // ✅ the shop owner (OWNER) id
  displayName: string;               // "Emeka"
  debtorKey: string;                 // normalized "emeka"
  aliases: string[];                 // ["emeka uche", "emmy"]
  createdAt: Date;
  updatedAt: Date;
}

const debtorSchema = new Schema<IDebtor>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    displayName: { type: String, required: true, trim: true },
    debtorKey: { type: String, required: true, trim: true, lowercase: true, index: true },
    aliases: { type: [String], default: [], index: true },
  },
  { timestamps: true }
);

// ✅ prevent duplicates per shop: (user + debtorKey) must be unique
debtorSchema.index({ user: 1, debtorKey: 1 }, { unique: true });

export const Debtor = model<IDebtor>('Debtor', debtorSchema);
