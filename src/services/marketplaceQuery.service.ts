export const DEFAULT_MARKETPLACE_LIMIT = 24;
export const MAX_MARKETPLACE_LIMIT = 48;
export const PUBLIC_MARKETPLACE_CACHE = 'public, max-age=60, s-maxage=180, stale-while-revalidate=300';

export type MarketplaceSort = 'recommended' | 'newest' | 'price_asc' | 'price_desc';

export type MarketplaceListQuery = {
  page: number;
  limit: number;
  skip: number;
  q: string;
  category: string;
  categoryKey: string;
  state: string;
  stateKey: string;
  city: string;
  cityKey: string;
  sort: MarketplaceSort;
};

export const MARKETPLACE_CATEGORY_GROUPS = [
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

export const normalizeMarketplaceText = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const slugifyMarketplaceValue = (value: unknown) =>
  normalizeMarketplaceText(value).replace(/\s+/g, '-').slice(0, 60) || 'other';

export const titleCaseMarketplaceValue = (value: unknown) =>
  normalizeMarketplaceText(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const inferMarketplaceCategory = (category?: unknown, name?: unknown) => {
  const text = normalizeMarketplaceText(`${category || ''} ${name || ''}`);
  const group = MARKETPLACE_CATEGORY_GROUPS.find((candidate) =>
    candidate.terms.some((term) => text.includes(normalizeMarketplaceText(term)))
  );

  if (group) return { id: group.id, label: group.label };

  const cleanCategory = normalizeMarketplaceText(category);
  if (cleanCategory) {
    return {
      id: slugifyMarketplaceValue(cleanCategory),
      label: titleCaseMarketplaceValue(cleanCategory),
    };
  }

  return { id: 'other', label: 'Other' };
};

export const normalizeMarketplaceCategoryFilter = (rawCategory: unknown) => {
  const normalized = normalizeMarketplaceText(rawCategory);
  if (!normalized || normalized === 'all') return null;

  const group = MARKETPLACE_CATEGORY_GROUPS.find((candidate) => {
    return candidate.id === normalized || normalizeMarketplaceText(candidate.label) === normalized;
  });

  return {
    id: group?.id || slugifyMarketplaceValue(normalized),
    label: group?.label || titleCaseMarketplaceValue(normalized),
    isKnownGroup: Boolean(group),
  };
};

export const parseMarketplaceListQuery = (raw: Record<string, unknown>): MarketplaceListQuery => {
  const page = Math.max(1, Number(raw.page) || 1);
  const limit = Math.min(MAX_MARKETPLACE_LIMIT, Math.max(1, Number(raw.limit) || DEFAULT_MARKETPLACE_LIMIT));
  const rawSort = String(raw.sort || 'recommended');
  const sort: MarketplaceSort = rawSort === 'newest' || rawSort === 'price_asc' || rawSort === 'price_desc'
    ? rawSort
    : 'recommended';
  const q = String(raw.q || '').trim().slice(0, 80);
  const category = String(raw.category || '').trim().slice(0, 80);
  const state = String(raw.state || '').trim().slice(0, 80);
  const city = String(raw.city || '').trim().slice(0, 80);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    q,
    category,
    categoryKey: normalizeMarketplaceCategoryFilter(category)?.id || '',
    state,
    stateKey: normalizeMarketplaceText(state),
    city,
    cityKey: normalizeMarketplaceText(city),
    sort,
  };
};

const cachePart = (value: unknown) => encodeURIComponent(String(value || '').trim().toLowerCase());

export const buildMarketplaceListCacheKey = (query: MarketplaceListQuery, version = '1') =>
  [
    'marketplace',
    'v2',
    version,
    'list',
    `p=${query.page}`,
    `l=${query.limit}`,
    `q=${cachePart(query.q)}`,
    `c=${cachePart(query.categoryKey || query.category)}`,
    `s=${cachePart(query.stateKey || query.state)}`,
    `city=${cachePart(query.cityKey || query.city)}`,
    `sort=${query.sort}`,
  ].join(':');

export const buildMarketplaceProductCacheKey = (productId: string, version = '1') =>
  ['marketplace', 'v2', version, 'product', cachePart(productId)].join(':');

export const getMarketplaceSortOptions = (sort: MarketplaceSort) => {
  if (sort === 'price_asc') return { boostScore: -1, price: 1, productCreatedAt: -1, _id: -1 } as const;
  if (sort === 'price_desc') return { boostScore: -1, price: -1, productCreatedAt: -1, _id: -1 } as const;
  return { boostScore: -1, productCreatedAt: -1, _id: -1 } as const;
};

export const buildMarketplaceListingFilter = (query: MarketplaceListQuery) => {
  const filter: Record<string, unknown> = { isPublic: true };

  if (query.stateKey) filter.stateKey = query.stateKey;
  if (query.cityKey) filter.cityKey = query.cityKey;

  const category = normalizeMarketplaceCategoryFilter(query.category);
  if (category) filter['smartCategory.id'] = category.id;

  if (query.q) {
    filter.$text = { $search: query.q };
  }

  return filter;
};
