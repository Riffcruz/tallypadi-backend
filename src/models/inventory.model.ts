import { Schema, model, Document, Types } from 'mongoose';

export interface IInventoryItem extends Document {
  user: Types.ObjectId;
  name: string;
  sku?: string;          // Auto-generated short code e.g. "P-4X9M" for WhatsApp
  quantity: number;
  lastUnitPrice: number; // Selling price
  costPrice: number;     // Cost price
  image?: string;
  category?: string;
  barcode?: string;
  isDeleted?: boolean;
  // ── Restock Alert Automation ──
  lowStockThreshold?: number;  // Alert owner when qty drops below this
  supplierName?: string;       // Pre-fills restock WhatsApp message
  supplierPhone?: string;      // Optional: deep-link to supplier's WhatsApp
}
  
  const inventorySchema = new Schema<IInventoryItem>(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      name: { type: String, required: true },
      sku: { type: String, trim: true, uppercase: true },
      quantity: { type: Number, required: true, default: 0 },
      // Default to 0 if unknown
      lastUnitPrice: { type: Number, default: 0 },
      costPrice: { type: Number, default: 0 },
      image: { type: String },
      category: { type: String, trim: true, lowercase: true },
      barcode: { type: String, trim: true },
      isDeleted: { type: Boolean, default: false },
      // ── Restock Alert Automation ──
      lowStockThreshold: { type: Number, default: null },
      supplierName: { type: String, trim: true },
      supplierPhone: { type: String, trim: true },
    },  { timestamps: true }
);

inventorySchema.index({ user: 1, name: 1, isDeleted: 1 }, { unique: true });
inventorySchema.index({ user: 1, sku: 1 }, { sparse: true }); // Fast SKU lookups

export const Inventory = model<IInventoryItem>('Inventory', inventorySchema);