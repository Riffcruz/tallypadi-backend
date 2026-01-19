import { Schema, model, Document, Types } from 'mongoose';

export interface IInventoryItem extends Document {
  user: Types.ObjectId;
    name: string;
    quantity: number;
    lastUnitPrice: number; // <--- Selling Price
    costPrice: number;     // <--- NEW: Cost Price
  }
  
  const inventorySchema = new Schema<IInventoryItem>(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true, default: 0 },
      // Default to 0 if unknown
      lastUnitPrice: { type: Number, default: 0 },
      costPrice: { type: Number, default: 0 }
    },  { timestamps: true }
);

inventorySchema.index({ user: 1, name: 1 }, { unique: true });

export const Inventory = model<IInventoryItem>('Inventory', inventorySchema);