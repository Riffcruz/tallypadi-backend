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

  // ── Marketplace/Shop Front ──
  isPublished?: boolean;
  description?: string;
  colors?: string[];
  sizes?: string[];
  marketplaceSeo?: {
    title?: string;
    metaDescription?: string;
    adDescription?: string;
    keywords?: string[];
    generatedAt?: Date;
    source?: 'SYSTEM' | 'BOOST' | 'AI' | 'FALLBACK';
  };

  // ── Paid Ads & Boosts ──
  boosts?: {
    platform: string; // e.g. 'TALLYPADI_MARKETPLACE_BOOST', 'META_ADS', 'TIKTOK_ADS', 'GOOGLE_ADS'
    expiresAt: Date;
    planId: string;
    campaignId?: Types.ObjectId;
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string[];
    adDescription?: string;
  }[];
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

      // ── Marketplace/Shop Front ──
      isPublished: { type: Boolean, default: true },
      description: { type: String, trim: true, maxlength: 1000 },
      colors: [{ type: String, trim: true }],
      sizes: [{ type: String, trim: true }],
      marketplaceSeo: {
        title: { type: String, trim: true, maxlength: 120, default: '' },
        metaDescription: { type: String, trim: true, maxlength: 220, default: '' },
        adDescription: { type: String, trim: true, maxlength: 1000, default: '' },
        keywords: [{ type: String, trim: true, maxlength: 70 }],
        generatedAt: { type: Date, default: null },
        source: { type: String, enum: ['SYSTEM', 'BOOST', 'AI', 'FALLBACK', null], default: null },
      },

      // ── Paid Ads & Boosts ──
      boosts: [{
        platform: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        planId: { type: String, required: true },
        campaignId: { type: Schema.Types.ObjectId, ref: 'AdCampaign' },
        seoTitle: { type: String, trim: true, maxlength: 120 },
        seoDescription: { type: String, trim: true, maxlength: 220 },
        seoKeywords: [{ type: String, trim: true }],
        adDescription: { type: String, trim: true, maxlength: 1000 },
      }]
    },  { timestamps: true }
);

inventorySchema.index({ user: 1, name: 1, isDeleted: 1 }, { unique: true });
inventorySchema.index({ user: 1, sku: 1 }, { sparse: true }); // Fast SKU lookups
inventorySchema.index({ user: 1, isPublished: 1, quantity: 1, createdAt: -1 });
inventorySchema.index({ isPublished: 1, quantity: 1, category: 1, createdAt: -1 });
inventorySchema.index({ 'boosts.expiresAt': 1 });
inventorySchema.index({ 'marketplaceSeo.keywords': 1 });

export const Inventory = model<IInventoryItem>('Inventory', inventorySchema);
