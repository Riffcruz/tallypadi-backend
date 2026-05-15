import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { User } from '../models/user.model';
import { isSubActive } from '../utils/permissions';
import {
  getPublicProductImage,
  getVerificationBadge,
  isStorefrontPublicReady,
} from '../services/marketplaceTrust.service';
import { getMarketplaceProductSeo, MarketplaceProductSeo } from '../services/marketplaceSeo.service';

type MarketplaceOwner = {
  _id: Types.ObjectId;
  businessName?: string;
  phoneNumber?: string;
  shopSlug?: string;
  themeColor?: string;
  heroImageUrl?: string;
  countryCode?: string;
  planType?: string;
  subscriptionStatus?: string;
  trialEndsAt?: Date;
  marketplaceVerificationStatus?: string;
  marketplaceVerifiedAt?: Date | null;
  settings?: {
    currencyCode?: string;
    location?: {
      country?: string;
      state?: string;
      city?: string;
      address?: string;
    };
  };
};

type Boost = {
  platform: string;
  expiresAt: Date;
  planId: string;
  campaignId?: Types.ObjectId;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  adDescription?: string;
};

type MarketplaceProduct = {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  name: string;
  lastUnitPrice?: number;
  image?: string;
  category?: string;
  description?: string;
  colors?: string[];
  sizes?: string[];
  quantity?: number;
  createdAt?: Date;
  activeBoosts?: Boost[];
  boostScore?: number;
  marketplaceSeo?: Partial<MarketplaceProductSeo>;
};

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;
const PUBLIC_MARKETPLACE_CACHE = 'public, max-age=30, s-maxage=120, stale-while-revalidate=300';

const MARKETPLACE_CATEGORY_GROUPS = [
  {
    id: 'phones-tablets',
    label: 'Phones & Tablets',
    terms: ['phone', 'iphone', 'android', 'samsung', 'tecno', 'infinix', 'redmi', 'tablet', 'ipad', 'charger', 'earbuds', 'power bank'],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    terms: ['laptop', 'computer', 'tv', 'television', 'speaker', 'camera', 'console', 'playstation', 'generator', 'fan', 'monitor'],
  },
  {
    id: 'home-appliances',
    label: 'Home & Appliances',
    terms: ['chair', 'table', 'sofa', 'bed', 'mattress', 'fridge', 'freezer', 'cooker', 'blender', 'kettle', 'wardrobe', 'furniture'],
  },
  {
    id: 'fashion',
    label: 'Fashion',
    terms: ['shoe', 'shirt', 'dress', 'bag', 'watch', 'jeans', 'wear', 'clothing', 'sneaker', 'fabric', 'lace', 'gown'],
  },
  {
    id: 'beauty-care',
    label: 'Beauty & Care',
    terms: ['cream', 'lotion', 'perfume', 'makeup', 'wig', 'hair', 'skincare', 'soap', 'shampoo', 'cosmetic'],
  },
  {
    id: 'food-farming',
    label: 'Food & Farming',
    terms: ['rice', 'beans', 'garri', 'yam', 'oil', 'flour', 'feed', 'fish', 'chicken', 'farm', 'tomato', 'pepper'],
  },
  {
    id: 'tools-equipment',
    label: 'Tools & Equipment',
    terms: ['tool', 'machine', 'equipment', 'drill', 'spare', 'parts', 'engine', 'industrial', 'construction', 'pump'],
  },
  {
    id: 'babies-kids',
    label: 'Babies & Kids',
    terms: ['baby', 'kids', 'toy', 'stroller', 'diaper', 'school bag', 'children', 'child'],
  },
  {
    id: 'services',
    label: 'Jobs & Services',
    terms: ['service', 'repair', 'installation', 'training', 'design', 'consulting', 'cleaning', 'delivery', 'job', 'jobs', 'hiring', 'vacancy'],
  },
];

const normalizeText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const slugify = (value: string) =>
  normalizeText(value)
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'other';

const titleCase = (value: string) =>
  normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getCurrencyCode = (owner: MarketplaceOwner) => {
  if (owner.settings?.currencyCode) return owner.settings.currencyCode;

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

const inferMarketplaceCategory = (category?: string, name?: string) => {
  const text = normalizeText(`${category || ''} ${name || ''}`);
  const group = MARKETPLACE_CATEGORY_GROUPS.find((candidate) =>
    candidate.terms.some((term) => text.includes(normalizeText(term)))
  );

  if (group) return { id: group.id, label: group.label };

  const cleanCategory = normalizeText(category);
  if (cleanCategory) {
    return {
      id: slugify(cleanCategory),
      label: titleCase(cleanCategory),
    };
  }

  return { id: 'other', label: 'Other' };
};

const getCategoryFilter = (rawCategory: unknown) => {
  const normalizedCategory = normalizeText(rawCategory);
  if (!normalizedCategory || normalizedCategory === 'all') return null;

  const group = MARKETPLACE_CATEGORY_GROUPS.find((candidate) => {
    return candidate.id === normalizedCategory || normalizeText(candidate.label) === normalizedCategory;
  });

  if (group) {
    const pattern = [group.id, group.label, ...group.terms].map((term) => escapeRegex(term)).join('|');
    return new RegExp(pattern, 'i');
  }

  return new RegExp(escapeRegex(normalizedCategory), 'i');
};

const ownerMatchesLocation = (owner: MarketplaceOwner, state: string, city: string) => {
  const location = owner.settings?.location;

  if (state && normalizeText(location?.state) !== normalizeText(state)) return false;
  if (city && normalizeText(location?.city) !== normalizeText(city)) return false;

  return true;
};

const buildLocationFacets = (owners: MarketplaceOwner[]) => {
  const stateMap = new Map<string, { state: string; count: number; cities: Map<string, number> }>();

  owners.forEach((owner) => {
    const location = owner.settings?.location;
    const state = String(location?.state || '').trim();
    const city = String(location?.city || '').trim();
    if (!state) return;

    const existing = stateMap.get(state) || { state, count: 0, cities: new Map<string, number>() };
    existing.count += 1;
    if (city) existing.cities.set(city, (existing.cities.get(city) || 0) + 1);
    stateMap.set(state, existing);
  });

  return Array.from(stateMap.values())
    .map((entry) => ({
      state: entry.state,
      count: entry.count,
      cities: Array.from(entry.cities.entries())
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => a.city.localeCompare(b.city)),
    }))
    .sort((a, b) => a.state.localeCompare(b.state));
};

const buildCategoryFacets = async (ownerIds: Types.ObjectId[]) => {
  if (ownerIds.length === 0) return MARKETPLACE_CATEGORY_GROUPS.map(({ id, label }) => ({ id, label, count: 0 }));

  const categoryDocs = await Inventory.aggregate<{ _id: string | null; count: number }>([
    {
      $match: {
        user: { $in: ownerIds },
        quantity: { $gt: 0 },
        isPublished: { $ne: false },
        isDeleted: { $ne: true },
      },
    },
    { $group: { _id: { $ifNull: ['$category', ''] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 80 },
  ]);

  const categoryMap = new Map<string, { id: string; label: string; count: number }>();
  MARKETPLACE_CATEGORY_GROUPS.forEach(({ id, label }) => categoryMap.set(id, { id, label, count: 0 }));

  categoryDocs.forEach((doc) => {
    const inferred = inferMarketplaceCategory(doc._id || '');
    const existing = categoryMap.get(inferred.id) || { ...inferred, count: 0 };
    existing.count += doc.count;
    categoryMap.set(inferred.id, existing);
  });

  return Array.from(categoryMap.values())
    .filter((category) => category.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const serializeProduct = (product: MarketplaceProduct, owner: MarketplaceOwner) => {
  const smartCategory = inferMarketplaceCategory(product.category, product.name);
  const location = owner.settings?.location || {};
  const activeBoosts = product.activeBoosts || [];
  const primaryBoost = activeBoosts[0];
  const seo = getMarketplaceProductSeo(product, owner, primaryBoost);

  return {
    id: String(product._id),
    name: product.name,
    price: product.lastUnitPrice || 0,
    image: getPublicProductImage(product.image),
    category: product.category || smartCategory.label,
    smartCategory,
    description: product.description || '',
    colors: product.colors || [],
    sizes: product.sizes || [],
    inStock: (product.quantity || 0) > 0,
    isBoosted: activeBoosts.length > 0,
    boosts: activeBoosts.map((boost) => ({
      platform: boost.platform,
      planId: boost.planId,
      expiresAt: boost.expiresAt,
    })),
    seo: {
      title: seo.title,
      metaDescription: seo.metaDescription,
      adDescription: seo.adDescription,
      keywords: seo.keywords,
      source: seo.source,
      generatedAt: seo.generatedAt,
    },
    createdAt: product.createdAt,
    shop: {
      id: String(owner._id),
      name: owner.businessName || 'TallyPadi Shop',
      slug: owner.shopSlug,
      phone: owner.phoneNumber,
      themeColor: owner.themeColor || '#10b981',
      currencyCode: getCurrencyCode(owner),
      location: {
        country: location.country || 'NG',
        state: location.state || '',
        city: location.city || '',
        address: location.address || '',
      },
      verification: getVerificationBadge(owner),
    },
  };
};

export const getMarketplaceListings = async (req: Request, res: Response): Promise<any> => {
  try {
    res.set('Cache-Control', PUBLIC_MARKETPLACE_CACHE);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;
    const q = String(req.query.q || '').trim().slice(0, 80);
    const state = String(req.query.state || '').trim().slice(0, 80);
    const city = String(req.query.city || '').trim().slice(0, 80);
    const sort = String(req.query.sort || 'recommended');

    const owners = await User.find({
      shopSlug: { $exists: true, $nin: ['', null] },
      planType: 'TYCOON',
      subscriptionStatus: { $in: ['active', 'trial'] },
    })
      .select('businessName phoneNumber shopSlug shopDescription themeColor heroImageUrl countryCode planType subscriptionStatus trialEndsAt settings.location settings.currencyCode marketplaceVerificationStatus marketplaceVerifiedAt')
      .lean<MarketplaceOwner[]>();

    const activeOwners = owners.filter((owner) => isSubActive(owner as any) && isStorefrontPublicReady(owner));
    const filteredOwners = activeOwners.filter((owner) => ownerMatchesLocation(owner, state, city));
    const ownerIds = filteredOwners.map((owner) => owner._id);
    const ownerMap = new Map(filteredOwners.map((owner) => [String(owner._id), owner]));

    const baseProductFilter: Record<string, unknown> = {
      user: { $in: ownerIds },
      quantity: { $gt: 0 },
      isPublished: { $ne: false },
      isDeleted: { $ne: true },
    };

    const andFilters: Record<string, unknown>[] = [baseProductFilter];

    if (q) {
      const qRegex = new RegExp(escapeRegex(q), 'i');
      const matchingOwnerIds = filteredOwners
        .filter((owner) => normalizeText(owner.businessName).includes(normalizeText(q)))
        .map((owner) => owner._id);

      andFilters.push({
        $or: [
          { name: qRegex },
          { description: qRegex },
          { category: qRegex },
          { 'marketplaceSeo.title': qRegex },
          { 'marketplaceSeo.metaDescription': qRegex },
          { 'marketplaceSeo.keywords': qRegex },
          { 'boosts.seoTitle': qRegex },
          { 'boosts.seoDescription': qRegex },
          { 'boosts.seoKeywords': qRegex },
          { user: { $in: matchingOwnerIds } },
        ],
      });
    }

    const categoryRegex = getCategoryFilter(req.query.category);
    if (categoryRegex) {
      andFilters.push({
        $or: [
          { category: categoryRegex },
          { name: categoryRegex },
          { description: categoryRegex },
          { 'marketplaceSeo.keywords': categoryRegex },
        ],
      });
    }

    const productFilter = andFilters.length === 1 ? andFilters[0] : { $and: andFilters };
    const now = new Date();

    const sortOptions: Record<string, 1 | -1> =
      sort === 'price_asc'
        ? { boostScore: -1, lastUnitPrice: 1, createdAt: -1, _id: -1 }
        : sort === 'price_desc'
          ? { boostScore: -1, lastUnitPrice: -1, createdAt: -1, _id: -1 }
          : sort === 'newest'
            ? { boostScore: -1, createdAt: -1, _id: -1 }
            : { boostScore: -1, createdAt: -1, _id: -1 };

    const [products, total, categories] = await Promise.all([
      Inventory.aggregate<MarketplaceProduct>([
        { $match: productFilter },
        {
          $addFields: {
            activeBoosts: {
              $filter: {
                input: { $ifNull: ['$boosts', []] },
                as: 'boost',
                cond: { $gt: ['$$boost.expiresAt', now] },
              },
            },
          },
        },
        { $addFields: { boostScore: { $size: '$activeBoosts' } } },
        { $sort: sortOptions },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            name: 1,
            user: 1,
            lastUnitPrice: 1,
            image: 1,
            category: 1,
            description: 1,
            colors: 1,
            sizes: 1,
            quantity: 1,
            createdAt: 1,
            activeBoosts: 1,
            boostScore: 1,
            marketplaceSeo: 1,
          },
        },
      ]),
      Inventory.countDocuments(productFilter),
      buildCategoryFacets(ownerIds),
    ]);

    const serializedProducts = products
      .map((product) => {
        const owner = ownerMap.get(String(product.user));
        if (!owner) return null;
        return serializeProduct(product, owner);
      })
      .filter(Boolean);

    return res.json({
      products: serializedProducts,
      categories,
      locations: buildLocationFacets(activeOwners),
      pagination: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + products.length < total,
      },
      appliedFilters: {
        q,
        category: String(req.query.category || ''),
        state,
        city,
        sort,
      },
    });
  } catch (error) {
    console.error('Marketplace listings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMarketplaceProductById = async (req: Request, res: Response): Promise<any> => {
  try {
    res.set('Cache-Control', PUBLIC_MARKETPLACE_CACHE);

    const productId = String(req.params.productId || '');
    if (!Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const now = new Date();
    const product = await Inventory.aggregate<MarketplaceProduct>([
      {
        $match: {
          _id: new Types.ObjectId(productId),
          quantity: { $gt: 0 },
          isPublished: { $ne: false },
          isDeleted: { $ne: true },
        },
      },
      {
        $addFields: {
          activeBoosts: {
            $filter: {
              input: { $ifNull: ['$boosts', []] },
              as: 'boost',
              cond: { $gt: ['$$boost.expiresAt', now] },
            },
          },
        },
      },
      { $addFields: { boostScore: { $size: '$activeBoosts' } } },
      {
        $project: {
          name: 1,
          user: 1,
          lastUnitPrice: 1,
          image: 1,
          category: 1,
          description: 1,
          colors: 1,
          sizes: 1,
          quantity: 1,
          createdAt: 1,
          activeBoosts: 1,
          boostScore: 1,
          marketplaceSeo: 1,
        },
      },
    ]);

    if (!product[0]) return res.status(404).json({ error: 'Product not found' });

    const owner = await User.findById(product[0].user)
      .select('businessName phoneNumber shopSlug shopDescription themeColor heroImageUrl countryCode planType subscriptionStatus trialEndsAt settings.location settings.currencyCode marketplaceVerificationStatus marketplaceVerifiedAt')
      .lean<MarketplaceOwner | null>();

    if (!owner || !owner.shopSlug || String(owner.planType).toUpperCase() !== 'TYCOON' || !isSubActive(owner as any) || !isStorefrontPublicReady(owner)) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({ product: serializeProduct(product[0], owner) });
  } catch (error) {
    console.error('Marketplace product error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
