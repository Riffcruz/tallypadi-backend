import { Types } from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { MarketplaceListing } from '../models/marketplaceListing.model';
import { User } from '../models/user.model';
import { isSubActive } from '../utils/permissions';
import {
  getPublicProductImage,
  getVerificationBadge,
  isStorefrontPublicReady,
} from './marketplaceTrust.service';
import { getMarketplaceProductSeo } from './marketplaceSeo.service';
import {
  buildMarketplaceListCacheKey,
  buildMarketplaceListingFilter,
  buildMarketplaceProductCacheKey,
  getMarketplaceSortOptions,
  inferMarketplaceCategory,
  MARKETPLACE_CATEGORY_GROUPS,
  normalizeMarketplaceText,
  parseMarketplaceListQuery,
} from './marketplaceQuery.service';
import {
  getMarketplaceCacheVersion,
  getMarketplaceJson,
  invalidateMarketplaceCache,
  setMarketplaceJson,
  withJsonCache,
} from './marketplaceCache.service';

const MARKETPLACE_CACHE_TTL_SECONDS = 180;
const MARKETPLACE_STALE_TTL_SECONDS = 300;
const FACET_CACHE_KEY = 'marketplace:v2:facets';

const OWNER_SELECT = [
  'businessName',
  'phoneNumber',
  'shopSlug',
  'shopDescription',
  'themeColor',
  'heroImageUrl',
  'countryCode',
  'planType',
  'subscriptionStatus',
  'trialEndsAt',
  'settings.location',
  'settings.currencyCode',
  'marketplaceVerificationStatus',
  'marketplaceVerifiedAt',
  'suspendedAt',
].join(' ');

const PRODUCT_SELECT = [
  'user',
  'name',
  'lastUnitPrice',
  'image',
  'category',
  'description',
  'colors',
  'sizes',
  'quantity',
  'isPublished',
  'isDeleted',
  'marketplaceSeo',
  'boosts',
  'createdAt',
  'updatedAt',
].join(' ');

type OwnerLike = Record<string, any>;
type ProductLike = Record<string, any>;

export type MarketplaceFacetSnapshot = {
  categories: { id: string; label: string; count: number }[];
  locations: { state: string; count: number; cities: { city: string; count: number }[] }[];
  totalListings: number;
  generatedAt: string;
};

const getCurrencyCode = (owner: OwnerLike) => {
  if (owner.settings?.currencyCode) return String(owner.settings.currencyCode).toUpperCase();

  const map: Record<string, string> = {
    NG: 'NGN',
    US: 'USD',
    GB: 'GBP',
    GH: 'GHS',
    KE: 'KES',
    ZA: 'ZAR',
    EU: 'EUR',
  };

  return map[String(owner.countryCode || 'NG').toUpperCase()] || 'NGN';
};

const isOwnerPublicForMarketplace = (owner?: OwnerLike | null) => {
  if (!owner) return false;
  if (owner.suspendedAt) return false;
  if (!owner.shopSlug) return false;
  if (String(owner.planType || '').toUpperCase() !== 'TYCOON') return false;
  if (!isSubActive(owner as any)) return false;
  return isStorefrontPublicReady(owner);
};

const isProductPublicForMarketplace = (product?: ProductLike | null) => {
  if (!product) return false;
  if (product.isDeleted === true) return false;
  if (product.isPublished === false) return false;
  return Number(product.quantity || 0) > 0;
};

const activeBoostsForProduct = (product: ProductLike, now = new Date()) => {
  return (product.boosts || [])
    .filter((boost: any) => new Date(boost.expiresAt).getTime() > now.getTime())
    .map((boost: any) => ({
      platform: String(boost.platform || ''),
      planId: String(boost.planId || ''),
      expiresAt: new Date(boost.expiresAt),
      campaignId: boost.campaignId,
      seoTitle: boost.seoTitle,
      seoDescription: boost.seoDescription,
      seoKeywords: boost.seoKeywords || [],
      adDescription: boost.adDescription,
    }))
    .filter((boost: any) => boost.platform && boost.planId);
};

const normalizeKeywords = (values: unknown[]) => {
  const tokens = values
    .flatMap((value) => Array.isArray(value) ? value : String(value || '').split(/[,\s]+/))
    .map((value) => normalizeMarketplaceText(value))
    .filter(Boolean);

  return Array.from(new Set(tokens)).slice(0, 40);
};

export const buildMarketplaceListingDocument = (
  product: ProductLike,
  owner: OwnerLike,
  now = new Date()
) => {
  if (!isProductPublicForMarketplace(product) || !isOwnerPublicForMarketplace(owner)) return null;

  const activeBoosts = activeBoostsForProduct(product, now);
  const primaryBoost = activeBoosts[0];
  const seo = getMarketplaceProductSeo(product, owner, primaryBoost);
  const smartCategory = inferMarketplaceCategory(product.category, product.name);
  const location = owner.settings?.location || {};
  const category = String(product.category || smartCategory.label || '').trim();
  const searchKeywords = normalizeKeywords([
    product.name,
    product.category,
    product.description,
    owner.businessName,
    location.city,
    location.state,
    seo.keywords || [],
    activeBoosts.flatMap((boost: any) => boost.seoKeywords || []),
  ]);
  const boostExpiresAt = activeBoosts.reduce((latest: Date | null, boost: any) => {
    const expiresAt = new Date(boost.expiresAt);
    if (!latest || expiresAt.getTime() > latest.getTime()) return expiresAt;
    return latest;
  }, null);

  return {
    product: product._id,
    owner: product.user || owner._id,
    isPublic: true,
    productName: String(product.name || '').trim(),
    price: Number(product.lastUnitPrice || 0),
    image: getPublicProductImage(product.image),
    category: category || smartCategory.label,
    categoryKey: normalizeMarketplaceText(category || smartCategory.label),
    smartCategory,
    description: String(product.description || ''),
    colors: Array.isArray(product.colors) ? product.colors.map(String).filter(Boolean).slice(0, 30) : [],
    sizes: Array.isArray(product.sizes) ? product.sizes.map(String).filter(Boolean).slice(0, 30) : [],
    quantity: Number(product.quantity || 0),
    inStock: Number(product.quantity || 0) > 0,
    productCreatedAt: product.createdAt || now,
    productUpdatedAt: product.updatedAt || now,
    activeBoosts: activeBoosts.map((boost: any) => ({
      platform: boost.platform,
      planId: boost.planId,
      expiresAt: boost.expiresAt,
      campaignId: boost.campaignId,
    })),
    boostScore: activeBoosts.length,
    boostExpiresAt,
    seo: {
      title: seo.title,
      metaDescription: seo.metaDescription,
      adDescription: seo.adDescription,
      keywords: seo.keywords,
      generatedAt: seo.generatedAt,
      source: seo.source,
    },
    searchText: [
      product.name,
      product.category,
      product.description,
      owner.businessName,
      location.city,
      location.state,
      seo.title,
      seo.metaDescription,
      seo.adDescription,
      ...(seo.keywords || []),
      ...searchKeywords,
    ].map((value) => normalizeMarketplaceText(value)).filter(Boolean).join(' '),
    searchKeywords,
    stateKey: normalizeMarketplaceText(location.state),
    cityKey: normalizeMarketplaceText(location.city),
    shop: {
      name: owner.businessName || 'TallyPadi Shop',
      slug: owner.shopSlug || '',
      phone: owner.phoneNumber || '',
      themeColor: owner.themeColor || '#10b981',
      currencyCode: getCurrencyCode(owner),
      location: {
        country: location.country || owner.countryCode || 'NG',
        state: location.state || '',
        city: location.city || '',
        address: location.address || '',
      },
      verification: getVerificationBadge(owner),
    },
    indexedAt: now,
  };
};

const serializeListing = (listing: any) => ({
  id: String(listing.product),
  name: listing.productName,
  price: listing.price || 0,
  image: listing.image,
  category: listing.category || listing.smartCategory?.label,
  smartCategory: listing.smartCategory || { id: 'other', label: 'Other' },
  description: listing.description || '',
  colors: listing.colors || [],
  sizes: listing.sizes || [],
  inStock: listing.inStock !== false,
  isBoosted: Number(listing.boostScore || 0) > 0,
  boosts: (listing.activeBoosts || []).map((boost: any) => ({
    platform: boost.platform,
    planId: boost.planId,
    expiresAt: boost.expiresAt,
  })),
  seo: listing.seo || {},
  createdAt: listing.productCreatedAt,
  shop: {
    id: String(listing.owner),
    name: listing.shop?.name || 'TallyPadi Shop',
    slug: listing.shop?.slug || '',
    phone: listing.shop?.phone || '',
    themeColor: listing.shop?.themeColor || '#10b981',
    currencyCode: listing.shop?.currencyCode || 'NGN',
    location: listing.shop?.location || { country: 'NG', state: '', city: '', address: '' },
    verification: listing.shop?.verification || {},
  },
});

const estimateTotalItems = (
  facets: MarketplaceFacetSnapshot,
  query: ReturnType<typeof parseMarketplaceListQuery>,
  returnedCount: number,
  hasMore: boolean
) => {
  if (query.q) return query.skip + returnedCount + (hasMore ? 1 : 0);

  if (query.categoryKey && !query.stateKey && !query.cityKey) {
    return facets.categories.find((category) => category.id === query.categoryKey)?.count || 0;
  }

  if (query.stateKey && !query.categoryKey) {
    const location = facets.locations.find((entry) => normalizeMarketplaceText(entry.state) === query.stateKey);
    if (!location) return 0;
    if (!query.cityKey) return location.count;
    return location.cities.find((entry) => normalizeMarketplaceText(entry.city) === query.cityKey)?.count || 0;
  }

  if (!query.categoryKey && !query.stateKey && !query.cityKey) return facets.totalListings;

  return query.skip + returnedCount + (hasMore ? 1 : 0);
};

export const refreshMarketplaceFacets = async (): Promise<MarketplaceFacetSnapshot> => {
  const [categoryRows, stateRows, totalListings] = await Promise.all([
    MarketplaceListing.aggregate<{ _id: { id: string; label: string }; count: number }>([
      { $match: { isPublic: true } },
      { $group: { _id: { id: '$smartCategory.id', label: '$smartCategory.label' }, count: { $sum: 1 } } },
      { $sort: { count: -1, '_id.label': 1 } },
    ]),
    MarketplaceListing.aggregate<{ _id: { state: string; city: string }; count: number }>([
      { $match: { isPublic: true, stateKey: { $ne: '' } } },
      { $group: { _id: { state: '$shop.location.state', city: '$shop.location.city' }, count: { $sum: 1 } } },
      { $sort: { '_id.state': 1, '_id.city': 1 } },
    ]),
    MarketplaceListing.countDocuments({ isPublic: true }),
  ]);

  const categoryMap = new Map<string, { id: string; label: string; count: number }>();
  MARKETPLACE_CATEGORY_GROUPS.forEach(({ id, label }) => categoryMap.set(id, { id, label, count: 0 }));
  categoryRows.forEach((row) => {
    const id = row._id?.id || 'other';
    const existing = categoryMap.get(id) || { id, label: row._id?.label || 'Other', count: 0 };
    existing.count += row.count;
    categoryMap.set(id, existing);
  });

  const stateMap = new Map<string, { state: string; count: number; cities: Map<string, number> }>();
  stateRows.forEach((row) => {
    const state = String(row._id?.state || '').trim();
    const city = String(row._id?.city || '').trim();
    if (!state) return;
    const existing = stateMap.get(state) || { state, count: 0, cities: new Map<string, number>() };
    existing.count += row.count;
    if (city) existing.cities.set(city, (existing.cities.get(city) || 0) + row.count);
    stateMap.set(state, existing);
  });

  const snapshot: MarketplaceFacetSnapshot = {
    categories: Array.from(categoryMap.values())
      .filter((category) => category.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    locations: Array.from(stateMap.values())
      .map((entry) => ({
        state: entry.state,
        count: entry.count,
        cities: Array.from(entry.cities.entries())
          .map(([city, count]) => ({ city, count }))
          .sort((a, b) => a.city.localeCompare(b.city)),
      }))
      .sort((a, b) => a.state.localeCompare(b.state)),
    totalListings,
    generatedAt: new Date().toISOString(),
  };

  await setMarketplaceJson(FACET_CACHE_KEY, snapshot, 300);
  return snapshot;
};

export const getMarketplaceFacetsSnapshot = async () => {
  return (await getMarketplaceJson<MarketplaceFacetSnapshot>(FACET_CACHE_KEY)) || refreshMarketplaceFacets();
};

export const refreshMarketplaceListing = async (
  productId: Types.ObjectId | string,
  options: { invalidate?: boolean } = {}
) => {
  if (!Types.ObjectId.isValid(String(productId))) return { status: 'invalid' as const };

  const product = await Inventory.findById(productId).select(PRODUCT_SELECT).lean<ProductLike | null>();
  if (!product) {
    await MarketplaceListing.deleteOne({ product: new Types.ObjectId(String(productId)) });
    if (options.invalidate !== false) await invalidateMarketplaceCache();
    return { status: 'deleted' as const };
  }

  const owner = await User.findById(product.user).select(OWNER_SELECT).lean<OwnerLike | null>();
  const listing = owner ? buildMarketplaceListingDocument(product, owner) : null;

  if (!listing) {
    await MarketplaceListing.deleteOne({ product: product._id });
    if (options.invalidate !== false) await invalidateMarketplaceCache();
    return { status: 'hidden' as const };
  }

  await MarketplaceListing.updateOne(
    { product: product._id },
    { $set: listing },
    { upsert: true, runValidators: true }
  );

  if (options.invalidate !== false) {
    await Promise.all([invalidateMarketplaceCache(), refreshMarketplaceFacets().catch(() => undefined)]);
  }

  return { status: 'indexed' as const };
};

export const refreshMarketplaceOwnerListings = async (ownerId: Types.ObjectId | string) => {
  if (!Types.ObjectId.isValid(String(ownerId))) return { refreshed: 0 };

  const owner = await User.findById(ownerId).select(OWNER_SELECT).lean<OwnerLike | null>();
  if (!isOwnerPublicForMarketplace(owner)) {
    await MarketplaceListing.deleteMany({ owner: new Types.ObjectId(String(ownerId)) });
    await Promise.all([invalidateMarketplaceCache(), refreshMarketplaceFacets().catch(() => undefined)]);
    return { refreshed: 0 };
  }

  const products = await Inventory.find({ user: ownerId }).select('_id').lean<{ _id: Types.ObjectId }[]>();
  for (const product of products) {
    await refreshMarketplaceListing(product._id, { invalidate: false });
  }

  await Promise.all([invalidateMarketplaceCache(), refreshMarketplaceFacets().catch(() => undefined)]);
  return { refreshed: products.length };
};

export const reconcileMarketplaceListings = async (limit = 500) => {
  const now = new Date();
  const products = await Inventory.find({
    isDeleted: { $ne: true },
    isPublished: { $ne: false },
    quantity: { $gt: 0 },
  })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit)
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();

  const expiredBoostListings = await MarketplaceListing.find({
    boostExpiresAt: { $ne: null, $lte: now },
  })
    .limit(Math.min(limit, 250))
    .select('product')
    .lean<{ product: Types.ObjectId }[]>();

  const ids = Array.from(new Set([...products.map((p) => String(p._id)), ...expiredBoostListings.map((p) => String(p.product))]));
  for (const id of ids) {
    await refreshMarketplaceListing(id, { invalidate: false });
  }

  await Promise.all([invalidateMarketplaceCache(), refreshMarketplaceFacets().catch(() => undefined)]);
  return { refreshed: ids.length };
};

export const getMarketplaceListingsFromReadModel = async (rawQuery: Record<string, unknown>) => {
  const query = parseMarketplaceListQuery(rawQuery);
  const version = await getMarketplaceCacheVersion();
  const cacheKey = buildMarketplaceListCacheKey(query, version);

  const result = await withJsonCache({
    key: cacheKey,
    ttlSeconds: MARKETPLACE_CACHE_TTL_SECONDS,
    staleSeconds: MARKETPLACE_STALE_TTL_SECONDS,
    loader: async () => {
      const [facets, listings] = await Promise.all([
        getMarketplaceFacetsSnapshot(),
        MarketplaceListing.find(buildMarketplaceListingFilter(query))
          .sort(getMarketplaceSortOptions(query.sort) as any)
          .skip(query.skip)
          .limit(query.limit + 1)
          .lean(),
      ]);

      const hasMore = listings.length > query.limit;
      const pageListings = hasMore ? listings.slice(0, query.limit) : listings;
      const products = pageListings.map(serializeListing);
      const totalItems = estimateTotalItems(facets, query, products.length, hasMore);

      return {
        products,
        categories: facets.categories,
        locations: facets.locations,
        pagination: {
          page: query.page,
          limit: query.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / query.limit),
          hasMore,
        },
        appliedFilters: {
          q: query.q,
          category: query.category,
          state: query.state,
          city: query.city,
          sort: query.sort,
        },
      };
    },
  });

  return result.value;
};

export const getMarketplaceProductFromReadModel = async (productId: string) => {
  if (!Types.ObjectId.isValid(productId)) return null;

  const version = await getMarketplaceCacheVersion();
  const cacheKey = buildMarketplaceProductCacheKey(productId, version);
  const result = await withJsonCache({
    key: cacheKey,
    ttlSeconds: MARKETPLACE_CACHE_TTL_SECONDS,
    staleSeconds: MARKETPLACE_STALE_TTL_SECONDS,
    loader: async () => {
      let listing = await MarketplaceListing.findOne({
        product: new Types.ObjectId(productId),
        isPublic: true,
      }).lean();

      if (!listing) {
        await refreshMarketplaceListing(productId, { invalidate: false });
        listing = await MarketplaceListing.findOne({
          product: new Types.ObjectId(productId),
          isPublic: true,
        }).lean();
      }

      return listing ? { product: serializeListing(listing) } : { product: null };
    },
  });

  return result.value.product;
};
