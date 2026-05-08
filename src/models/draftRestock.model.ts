import { Schema, model, Document, Types } from 'mongoose';

export interface IDraftRestockItem {
  rawName: string;         // What the user typed (e.g. "7p black")
  qty: number;
  cost_price?: number;
  unit_price?: number;
  options: string[];       // Fuzzy-matched existing product names
  resolvedInventoryId?: Types.ObjectId | null;  // Set when user resolves
  createNew?: boolean;     // User chose to create a brand new item
}

export interface IDraftRestock extends Document {
  user: Types.ObjectId;
  messageId: string;        // Original WhatsApp message ID
  status: 'PENDING' | 'RESOLVED' | 'EXPIRED';
  items: IDraftRestockItem[];
  successCount: number;     // How many items were already saved before draft
  createdAt: Date;
  updatedAt: Date;
}

const draftRestockItemSchema = new Schema<IDraftRestockItem>(
  {
    rawName: { type: String, required: true },
    qty: { type: Number, required: true },
    cost_price: { type: Number, default: 0 },
    unit_price: { type: Number, default: 0 },
    options: [{ type: String }],
    resolvedInventoryId: { type: Schema.Types.ObjectId, ref: 'Inventory', default: null },
    createNew: { type: Boolean, default: false },
  },
  { _id: false }
);

const draftRestockSchema = new Schema<IDraftRestock>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    messageId: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'RESOLVED', 'EXPIRED'], default: 'PENDING' },
    items: [draftRestockItemSchema],
    successCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Auto-expire drafts after 24 hours via MongoDB TTL index
draftRestockSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
draftRestockSchema.index({ user: 1, status: 1 });

export const DraftRestock = model<IDraftRestock>('DraftRestock', draftRestockSchema);
