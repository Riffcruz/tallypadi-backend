import { Document, Schema, Types, model } from 'mongoose';

export interface IMarketplaceListing extends Document {
  product: Types.ObjectId;
  owner: Types.ObjectId;
  isPublic: boolean;
  productName: string;
  price: number;
  image?: string;
  category?: string;
  categoryKey?: string;
  smartCategory: {
    id: string;
    label: string;
  };
  description?: string;
  colors: string[];
  sizes: string[];
  quantity: number;
  inStock: boolean;
  productCreatedAt?: Date;
  productUpdatedAt?: Date;
  activeBoosts: {
    platform: string;
    expiresAt: Date;
    planId: string;
    campaignId?: Types.ObjectId;
  }[];
  boostScore: number;
  boostExpiresAt?: Date | null;
  seo: {
    title?: string;
    metaDescription?: string;
    adDescription?: string;
    keywords?: string[];
    generatedAt?: Date;
    source?: string;
  };
  searchText: string;
  searchKeywords: string[];
  stateKey: string;
  cityKey: string;
  shop: {
    name: string;
    slug?: string;
    phone?: string;
    themeColor?: string;
    currencyCode?: string;
    location?: {
      country?: string;
      state?: string;
      city?: string;
      address?: string;
    };
    verification?: Record<string, unknown>;
  };
  indexedAt: Date;
}

const marketplaceListingSchema = new Schema<IMarketplaceListing>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true, unique: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isPublic: { type: Boolean, default: false, index: true },
    productName: { type: String, required: true, trim: true },
    price: { type: Number, default: 0, index: true },
    image: { type: String, default: '' },
    category: { type: String, default: '' },
    categoryKey: { type: String, default: '', index: true },
    smartCategory: {
      id: { type: String, required: true, index: true },
      label: { type: String, required: true },
    },
    description: { type: String, default: '' },
    colors: [{ type: String, trim: true }],
    sizes: [{ type: String, trim: true }],
    quantity: { type: Number, default: 0 },
    inStock: { type: Boolean, default: false },
    productCreatedAt: { type: Date, index: true },
    productUpdatedAt: { type: Date },
    activeBoosts: [{
      platform: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      planId: { type: String, required: true },
      campaignId: { type: Schema.Types.ObjectId, ref: 'AdCampaign' },
    }],
    boostScore: { type: Number, default: 0, index: true },
    boostExpiresAt: { type: Date, default: null, index: true },
    seo: {
      title: { type: String, default: '' },
      metaDescription: { type: String, default: '' },
      adDescription: { type: String, default: '' },
      keywords: [{ type: String, trim: true }],
      generatedAt: { type: Date, default: null },
      source: { type: String, default: '' },
    },
    searchText: { type: String, default: '' },
    searchKeywords: [{ type: String, trim: true }],
    stateKey: { type: String, default: '', index: true },
    cityKey: { type: String, default: '', index: true },
    shop: {
      name: { type: String, default: 'TallyPadi Shop' },
      slug: { type: String, default: '' },
      phone: { type: String, default: '' },
      themeColor: { type: String, default: '#10b981' },
      currencyCode: { type: String, default: 'NGN' },
      location: {
        country: { type: String, default: 'NG' },
        state: { type: String, default: '' },
        city: { type: String, default: '' },
        address: { type: String, default: '' },
      },
      verification: { type: Schema.Types.Mixed, default: {} },
    },
    indexedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

marketplaceListingSchema.index({ isPublic: 1, boostScore: -1, productCreatedAt: -1, _id: -1 });
marketplaceListingSchema.index({ isPublic: 1, 'smartCategory.id': 1, boostScore: -1, productCreatedAt: -1, _id: -1 });
marketplaceListingSchema.index({ isPublic: 1, stateKey: 1, cityKey: 1, boostScore: -1, productCreatedAt: -1, _id: -1 });
marketplaceListingSchema.index({ isPublic: 1, boostScore: -1, price: 1, productCreatedAt: -1, _id: -1 });
marketplaceListingSchema.index({ isPublic: 1, boostScore: -1, price: -1, productCreatedAt: -1, _id: -1 });
marketplaceListingSchema.index({
  productName: 'text',
  description: 'text',
  category: 'text',
  searchText: 'text',
  searchKeywords: 'text',
  'shop.name': 'text',
});

export const MarketplaceListing = model<IMarketplaceListing>('MarketplaceListing', marketplaceListingSchema);
