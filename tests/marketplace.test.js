const assert = require('node:assert/strict');
const test = require('node:test');
const { Types } = require('mongoose');

const {
  buildMarketplaceListCacheKey,
  buildMarketplaceListingFilter,
  getMarketplaceSortOptions,
  inferMarketplaceCategory,
  parseMarketplaceListQuery,
} = require('../dist/services/marketplaceQuery.service');
const {
  createMemoryMarketplaceCacheAdapter,
  withJsonCache,
} = require('../dist/services/marketplaceCache.service');
const {
  buildMarketplaceListingDocument,
  diversifyDiscoveryListings,
} = require('../dist/services/marketplaceIndex.service');

test('normalizes marketplace query params and cache keys', () => {
  const a = parseMarketplaceListQuery({
    page: '2',
    limit: '999',
    q: ' Phone ',
    category: 'Phones & Tablets',
    state: ' Lagos ',
    city: ' Ikeja ',
    sort: 'price_asc',
  });
  const b = parseMarketplaceListQuery({
    page: 2,
    limit: 48,
    q: 'phone',
    category: 'phones-tablets',
    state: 'lagos',
    city: 'ikeja',
    sort: 'price_asc',
  });

  assert.equal(a.limit, 48);
  assert.equal(a.categoryKey, 'phones-tablets');
  assert.equal(a.stateKey, 'lagos');
  assert.equal(a.cityKey, 'ikeja');
  assert.equal(buildMarketplaceListCacheKey(a, '7'), buildMarketplaceListCacheKey(b, '7'));
});

test('builds indexed read-model filters for search, category, and location', () => {
  const query = parseMarketplaceListQuery({
    q: 'iphone',
    category: 'Phones & Tablets',
    state: 'Lagos',
    city: 'Ikeja',
  });

  assert.deepEqual(buildMarketplaceListingFilter(query), {
    isPublic: true,
    stateKey: 'lagos',
    cityKey: 'ikeja',
    'smartCategory.id': 'phones-tablets',
    $text: { $search: 'iphone' },
  });
});

test('keeps user-entered specifications out of public marketplace categories', () => {
  assert.deepEqual(inferMarketplaceCategory('500w', 'Cola 2000'), { id: 'other', label: 'Other' });
  assert.deepEqual(inferMarketplaceCategory('3 Inches', 'Standing fan'), { id: 'electronics', label: 'Electronics' });
  assert.deepEqual(inferMarketplaceCategory('Home & Appliances', 'New product'), { id: 'home-appliances', label: 'Home & Appliances' });

  const otherQuery = parseMarketplaceListQuery({ category: '500w' });
  assert.equal(otherQuery.categoryKey, 'other');
  assert.deepEqual(buildMarketplaceListingFilter(otherQuery), {
    isPublic: true,
    'smartCategory.id': {
      $nin: [
        'phones-tablets',
        'electronics',
        'home-appliances',
        'fashion',
        'beauty-care',
        'food-farming',
        'tools-equipment',
        'babies-kids',
        'services',
      ],
    },
  });
});

test('uses read-model sort shapes without computed aggregation sort work', () => {
  assert.deepEqual(getMarketplaceSortOptions('price_asc'), {
    boostScore: -1,
    price: 1,
    productCreatedAt: -1,
    _id: -1,
  });

  assert.deepEqual(getMarketplaceSortOptions('recommended'), {
    boostScore: -1,
    productCreatedAt: -1,
    _id: -1,
  });
});

test('marketplace JSON cache returns miss then hit', async () => {
  const adapter = createMemoryMarketplaceCacheAdapter();
  let loads = 0;

  const first = await withJsonCache({
    key: 'marketplace:test:hit',
    ttlSeconds: 30,
    staleSeconds: 60,
    adapter,
    loader: async () => ({ loads: ++loads }),
  });
  const second = await withJsonCache({
    key: 'marketplace:test:hit',
    ttlSeconds: 30,
    staleSeconds: 60,
    adapter,
    loader: async () => ({ loads: ++loads }),
  });

  assert.equal(first.status, 'miss');
  assert.equal(second.status, 'hit');
  assert.deepEqual(second.value, { loads: 1 });
});

test('marketplace JSON cache serves stale data while another refresh lock exists', async () => {
  const adapter = createMemoryMarketplaceCacheAdapter();
  const key = 'marketplace:test:stale';

  await withJsonCache({
    key,
    ttlSeconds: 1,
    staleSeconds: 60,
    adapter,
    loader: async () => ({ version: 1 }),
  });

  await new Promise((resolve) => setTimeout(resolve, 1100));
  await adapter.set(`${key}:lock`, '1', 30);

  const result = await withJsonCache({
    key,
    ttlSeconds: 1,
    staleSeconds: 60,
    adapter,
    loader: async () => ({ version: 2 }),
  });

  assert.equal(result.status, 'stale');
  assert.deepEqual(result.value, { version: 1 });
});

test('builds public marketplace listing documents from product and owner source data', () => {
  const ownerId = new Types.ObjectId();
  const productId = new Types.ObjectId();
  const future = new Date(Date.now() + 60_000);

  const owner = {
    _id: ownerId,
    businessName: 'Ada Phones',
    phoneNumber: '2348000000000',
    shopSlug: 'ada-phones',
    shopDescription: 'Reliable phones and accessories',
    themeColor: '#10b981',
    countryCode: 'NG',
    planType: 'TYCOON',
    subscriptionStatus: 'active',
    marketplaceVerificationStatus: 'VERIFIED',
    marketplaceVerifiedAt: new Date(),
    settings: {
      currencyCode: 'NGN',
      location: {
        country: 'NG',
        state: 'Lagos',
        city: 'Ikeja',
        address: 'Computer Village',
      },
    },
  };

  const product = {
    _id: productId,
    user: ownerId,
    name: 'iPhone 15',
    category: 'phones',
    description: 'Clean UK-used iPhone',
    quantity: 3,
    lastUnitPrice: 900000,
    isPublished: true,
    isDeleted: false,
    boosts: [{ platform: 'TALLYPADI_MARKETPLACE_BOOST', planId: '7_days', expiresAt: future }],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const listing = buildMarketplaceListingDocument(product, owner);

  assert.equal(listing.isPublic, true);
  assert.equal(listing.boostScore, 1);
  assert.equal(listing.smartCategory.id, 'phones-tablets');
  assert.equal(listing.stateKey, 'lagos');
  assert.equal(listing.shop.verification.verified, true);
});

test('does not index unpublished, out-of-stock, or incomplete storefront products', () => {
  const owner = {
    _id: new Types.ObjectId(),
    businessName: 'Ada Phones',
    phoneNumber: '2348000000000',
    shopSlug: 'ada-phones',
    shopDescription: 'Reliable phones and accessories',
    planType: 'TYCOON',
    subscriptionStatus: 'active',
    settings: { location: { country: 'NG', state: 'Lagos', city: 'Ikeja', address: 'Computer Village' } },
  };
  const product = {
    _id: new Types.ObjectId(),
    user: owner._id,
    name: 'iPhone 15',
    quantity: 0,
    isPublished: true,
    isDeleted: false,
  };

  assert.equal(buildMarketplaceListingDocument(product, owner), null);
  assert.equal(buildMarketplaceListingDocument({ ...product, quantity: 2, isPublished: false }, owner), null);
  assert.equal(buildMarketplaceListingDocument({ ...product, quantity: 2 }, { ...owner, shopDescription: '' }), null);
});

test('discovery feed is deterministic and alternates shops before repeating one seller', () => {
  const future = new Date(Date.now() + 60_000);
  const listing = (owner, product, boosted = false) => ({
    owner,
    product,
    productName: `Product ${product}`,
    price: 1000,
    smartCategory: { id: 'other', label: 'Other' },
    activeBoosts: boosted
      ? [{ platform: 'TALLYPADI_MARKETPLACE_BOOST', planId: '7_days', expiresAt: future }]
      : [],
    shop: { name: `Shop ${owner}` },
    productCreatedAt: new Date(),
  });
  const listings = [
    listing('shop-a', 'a1'),
    listing('shop-a', 'a2'),
    listing('shop-b', 'b1'),
    listing('shop-c', 'c1', true),
  ];

  const first = diversifyDiscoveryListings(listings, 'visitor-one');
  const second = diversifyDiscoveryListings(listings, 'visitor-one');

  assert.deepEqual(first.map((product) => product.id), second.map((product) => product.id));
  assert.equal(first[0].shop.id, 'shop-c');
  assert.equal(new Set(first.slice(0, 3).map((product) => product.shop.id)).size, 3);
});

test('expired boosts lose sponsored priority when marketplace listings are serialized', () => {
  const expired = new Date(Date.now() - 60_000);
  const [product] = diversifyDiscoveryListings([{
    owner: 'shop-a',
    product: 'a1',
    productName: 'Expired boost product',
    price: 1000,
    smartCategory: { id: 'other', label: 'Other' },
    activeBoosts: [{ platform: 'TALLYPADI_MARKETPLACE_BOOST', planId: '7_days', expiresAt: expired }],
    shop: { name: 'Shop A' },
    productCreatedAt: new Date(),
  }], 'visitor-one');

  assert.equal(product.isBoosted, false);
  assert.deepEqual(product.boosts, []);
});
