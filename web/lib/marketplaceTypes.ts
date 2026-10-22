import type { SmartCategory } from './marketplaceCatalog';

export type MarketplaceLocation = {
  state: string;
  count: number;
  cities: { city: string; count: number }[];
};

export type MarketplaceProduct = {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  category?: string;
  smartCategory: SmartCategory;
  description?: string;
  inStock: boolean;
  isBoosted: boolean;
  boosts?: { platform?: string; planId?: string; expiresAt?: string }[];
  seo?: { adDescription?: string };
  shop: {
    id?: string;
    name: string;
    slug?: string;
    phone?: string;
    currencyCode?: string;
    location?: {
      country?: string;
      state?: string;
      city?: string;
      address?: string;
    };
    verification?: {
      verified?: boolean;
      label?: string | null;
    };
  };
};

export type MarketplaceResponse = {
  products: MarketplaceProduct[];
  categories: SmartCategory[];
  locations: MarketplaceLocation[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasMore: boolean;
  };
  rotationSeed?: string;
};
