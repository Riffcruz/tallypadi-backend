'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { State } from 'country-state-city';
import {
  ChevronDown,
  BadgeCheck,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type SmartCategory = {
  id: string;
  label: string;
  count?: number;
};

type MarketplaceLocation = {
  state: string;
  count: number;
  cities: { city: string; count: number }[];
};

type MarketplaceProduct = {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  category?: string;
  smartCategory: SmartCategory;
  description?: string;
  seo?: {
    adDescription?: string;
  };
  inStock: boolean;
  isBoosted: boolean;
  shop: {
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

type MarketplaceResponse = {
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
};

const FALLBACK_CATEGORIES: SmartCategory[] = [
  { id: 'phones-tablets', label: 'Phones & Tablets' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'home-appliances', label: 'Home & Appliances' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'beauty-care', label: 'Beauty & Care' },
  { id: 'food-farming', label: 'Food & Farming' },
  { id: 'tools-equipment', label: 'Tools & Equipment' },
  { id: 'babies-kids', label: 'Babies & Kids' },
  { id: 'services', label: 'Jobs & Services' },
];

const formatMoney = (amount: number, currencyCode = 'NGN') => {
  const localeMap: Record<string, string> = {
    NGN: 'en-NG',
    USD: 'en-US',
    GBP: 'en-GB',
    EUR: 'de-DE',
    GHS: 'en-GH',
    KES: 'en-KE',
    ZAR: 'en-ZA',
  };

  return new Intl.NumberFormat(localeMap[currencyCode] || 'en-NG', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

const titleCase = (value?: string) =>
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const getStateLabel = (stateCode?: string, countryCode = 'NG') => {
  if (!stateCode) return '';
  return State.getStateByCodeAndCountry(stateCode, countryCode)?.name || stateCode;
};

const buildWhatsAppLink = (product: MarketplaceProduct) => {
  const phone = String(product.shop.phone || '').replace(/[^\d]/g, '');
  if (!phone) return null;

  const shopUrl = product.shop.slug
    ? `https://tallypadi.com/marketplace/product/${product.id}`
    : 'https://tallypadi.com/marketplace';
  const message = `Hello ${product.shop.name}, I saw ${product.name} on TallyPadi Marketplace. Is it available?\n\n${shopUrl}`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

function FilterPanel({
  categories,
  locations,
  selectedCategory,
  selectedState,
  selectedCity,
  onCategoryChange,
  onStateChange,
  onCityChange,
  onClear,
}: {
  categories: SmartCategory[];
  locations: MarketplaceLocation[];
  selectedCategory: string;
  selectedState: string;
  selectedCity: string;
  onCategoryChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onClear: () => void;
}) {
  const activeState = locations.find((location) => location.state === selectedState);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Browse</p>
          <h2 className="text-lg font-black text-stone-950">Smart filters</h2>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-bold text-stone-500 hover:text-emerald-700"
        >
          Clear
        </button>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onCategoryChange('')}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-bold transition ${
            !selectedCategory
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-stone-200 bg-white text-stone-700 hover:border-emerald-200 hover:bg-emerald-50/60'
          }`}
        >
          <span>All categories</span>
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-bold transition ${
              selectedCategory === category.id
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-stone-200 bg-white text-stone-700 hover:border-emerald-200 hover:bg-emerald-50/60'
            }`}
          >
            <span>{category.label}</span>
            {category.count !== undefined && (
              <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">
                {category.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-amber-900">
          <MapPin size={16} />
          <span className="text-sm font-black">Shop location</span>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">State</span>
            <select
              value={selectedState}
              onChange={(event) => onStateChange(event.target.value)}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 outline-none focus:border-emerald-400"
            >
              <option value="">All states</option>
              {locations.map((location) => (
                <option key={location.state} value={location.state}>
                  {getStateLabel(location.state)} ({location.count})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">City</span>
            <select
              value={selectedCity}
              onChange={(event) => onCityChange(event.target.value)}
              disabled={!selectedState || !activeState?.cities.length}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
            >
              <option value="">All cities</option>
              {activeState?.cities.map((city) => (
                <option key={city.city} value={city.city}>
                  {city.city} ({city.count})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: MarketplaceProduct }) {
  const productUrl = `/marketplace/product/${product.id}`;
  const locationText = [product.shop.location?.city, getStateLabel(product.shop.location?.state, product.shop.location?.country || 'NG')]
    .filter(Boolean)
    .join(', ');
  const whatsappLink = buildWhatsAppLink(product);
  const previewDescription = product.seo?.adDescription || product.description;

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
        product.isBoosted ? 'border-amber-300 shadow-amber-100' : 'border-stone-200'
      }`}
    >
      <Link href={productUrl} className="relative block aspect-[4/3] overflow-hidden bg-emerald-50">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-emerald-50 text-5xl font-black uppercase text-emerald-700">
            {product.name.slice(0, 1)}
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {product.isBoosted && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-1 text-[11px] font-black text-stone-950 shadow">
              <TrendingUp size={12} />
              Boosted
            </span>
          )}
          <span className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-black text-emerald-800 shadow">
            {product.smartCategory.label}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-black text-emerald-700">
              {formatMoney(product.price, product.shop.currencyCode)}
            </p>
            <Link href={productUrl} className="mt-1 block text-sm font-black leading-snug text-stone-950 line-clamp-2 hover:text-emerald-700">
              {titleCase(product.name)}
            </Link>
          </div>
        </div>

        {previewDescription && (
          <p className="mb-3 text-xs leading-relaxed text-stone-500 line-clamp-2">
            {previewDescription}
          </p>
        )}

        <div className="mt-auto space-y-3 border-t border-stone-100 pt-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
              <Store size={14} className="text-emerald-700" />
              <span className="truncate">{product.shop.name}</span>
              {product.shop.verification?.verified && (
                <span title={product.shop.verification.label || 'Verified seller'} className="inline-flex shrink-0 text-sky-600">
                  <BadgeCheck size={15} fill="currentColor" className="text-sky-600" />Verified seller
                </span>
              )}
            </div>
            {locationText && (
              <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-stone-500">
                <MapPin size={13} className="text-amber-600" />
                <span className="truncate">{locationText}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              href={productUrl}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
            >
              Details
              <ExternalLink size={13} />
            </Link>
            {whatsappLink ? (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
              >
                <MessageCircle size={13} />
                Chat
              </a>
            ) : (
              <Link
                href={productUrl}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
              >
                <MessageCircle size={13} />
                Ask
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function MarketplaceClient() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [categories, setCategories] = useState<SmartCategory[]>(FALLBACK_CATEGORIES);
  const [locations, setLocations] = useState<MarketplaceLocation[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [sort, setSort] = useState('recommended');
  const [hasMore, setHasMore] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 450);
    return () => window.clearTimeout(timer);
  }, [search]);

  const selectedStateCities = useMemo(
    () => locations.find((location) => location.state === selectedState)?.cities || [],
    [locations, selectedState]
  );

  const displayCategories = categories.length > 0 ? categories : FALLBACK_CATEGORIES;
  const activeCategoryLabel = displayCategories.find((category) => category.id === selectedCategory)?.label;
  const activeLocationLabel = selectedCity
    ? selectedCity
    : selectedState
      ? getStateLabel(selectedState)
      : 'All Nigeria';

  const fetchListings = useCallback(async (targetPage: number, reset: boolean) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', '24');
      params.set('sort', sort);
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedState) params.set('state', selectedState);
      if (selectedCity) params.set('city', selectedCity);

      const response = await fetch(`${API_URL}/marketplace?${params.toString()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Marketplace could not load right now.');
      }

      const data = (await response.json()) as MarketplaceResponse;
      setProducts((current) => (reset ? data.products : [...current, ...data.products]));
      setCategories(data.categories.length ? data.categories : FALLBACK_CATEGORIES);
      setLocations(data.locations || []);
      setHasMore(Boolean(data.pagination?.hasMore));
      setTotalItems(data.pagination?.totalItems || 0);
    } catch {
      setError('Marketplace could not load right now.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, selectedCategory, selectedCity, selectedState, sort]);

  useEffect(() => {
    pageRef.current = 1;
    fetchListings(1, true);
  }, [fetchListings]);

  useEffect(() => {
    if (selectedCity && !selectedStateCities.some((entry) => entry.city === selectedCity)) {
      setSelectedCity('');
    }
  }, [selectedCity, selectedStateCities]);

  const clearFilters = () => {
    setSearch('');
    setSelectedCategory('');
    setSelectedState('');
    setSelectedCity('');
    setSort('recommended');
  };

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry.isIntersecting || !hasMore || loading || loadingMore) return;
      const nextPage = pageRef.current + 1;
      pageRef.current = nextPage;
      fetchListings(nextPage, false);
    }, { rootMargin: '500px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchListings, hasMore, loading, loadingMore]);


  return (
    <div className="min-h-screen bg-[#f7fbf8] text-stone-950">
      <header className="sticky top-0 z-40 border-b border-emerald-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Store size={18} />
            </span>
            <span className="text-lg font-black tracking-tight text-emerald-900">TallyPadi</span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            <Link href="/" className="text-sm font-bold text-stone-600 hover:text-emerald-700">Home</Link>
            <Link href="/marketplace" className="text-sm font-black text-emerald-700">Marketplace</Link>
            <Link href="/#pricing" className="text-sm font-bold text-stone-600 hover:text-emerald-700">Pricing</Link>
            <Link href="/help" className="text-sm font-bold text-stone-600 hover:text-emerald-700">Help</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/online-store"
              className="hidden rounded-lg border border-emerald-200 px-4 py-2 text-sm font-black text-emerald-800 transition hover:bg-emerald-50 sm:inline-flex"
            >
              Sell here
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              Start
            </Link>
          </div>
        </div>
      </header>

      <section className="border-b border-emerald-100 bg-emerald-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="flex flex-col justify-center">
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-800/70 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
              <Sparkles size={14} />
              Smart sorted marketplace
            </div>
            <h1 className="max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Find products from active TallyPadi shop fronts.
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-emerald-50 sm:text-base">
              Search by product, category, state, or city. Boosted listings rise first, then fresh and relevant stock from nearby sellers.
            </p>

            <form
              className="mt-6 grid gap-3 rounded-lg bg-white p-3 text-stone-950 shadow-xl lg:grid-cols-[1.2fr_180px_180px_120px]"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products, shops, or categories"
                  className="h-12 w-full rounded-lg border border-stone-200 bg-stone-50 pl-10 pr-3 text-base font-semibold outline-none transition focus:border-emerald-400 focus:bg-white"
                />
              </label>

              <label className="relative block">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600" />
                <select
                  value={selectedState}
                  onChange={(event) => {
                    setSelectedState(event.target.value);
                    setSelectedCity('');
                  }}
                  className="h-12 w-full appearance-none rounded-lg border border-stone-200 bg-stone-50 pl-9 pr-8 text-sm font-black outline-none transition focus:border-emerald-400 focus:bg-white"
                >
                  <option value="">All Nigeria</option>
                  {locations.map((location) => (
                    <option key={location.state} value={location.state}>
                      {getStateLabel(location.state)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              </label>

              <label className="relative block">
                <select
                  value={selectedCity}
                  onChange={(event) => setSelectedCity(event.target.value)}
                  disabled={!selectedState}
                  className="h-12 w-full appearance-none rounded-lg border border-stone-200 bg-stone-50 px-3 pr-8 text-sm font-black outline-none transition focus:border-emerald-400 focus:bg-white disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  <option value="">All cities</option>
                  {selectedStateCities.map((city) => (
                    <option key={city.city} value={city.city}>
                      {city.city}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              </label>

              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-stone-950 transition hover:bg-amber-300 lg:hidden"
              >
                <Filter size={16} />
                Filter
              </button>
              <a
                href="#listings"
                className="hidden h-12 items-center justify-center rounded-lg bg-amber-400 px-4 text-sm font-black text-stone-950 transition hover:bg-amber-300 lg:inline-flex"
              >
                Search
              </a>
            </form>
          </div>
        </div>
      </section>

      <main id="listings" className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[270px_1fr] lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <FilterPanel
              categories={displayCategories}
              locations={locations}
              selectedCategory={selectedCategory}
              selectedState={selectedState}
              selectedCity={selectedCity}
              onCategoryChange={setSelectedCategory}
              onStateChange={(value) => {
                setSelectedState(value);
                setSelectedCity('');
              }}
              onCityChange={setSelectedCity}
              onClear={clearFilters}
            />
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                <span>{activeCategoryLabel || 'All products'}</span>
                <span className="text-stone-300">/</span>
                <span>{activeLocationLabel}</span>
              </div>
              <h2 className="mt-1 text-xl font-black text-stone-950">
                {loading ? 'Finding products' : `${totalItems.toLocaleString()} product${totalItems === 1 ? '' : 's'}`}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-black text-stone-700 lg:hidden"
              >
                <SlidersHorizontal size={16} />
                Filters
              </button>
              <label className="relative block">
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="h-10 appearance-none rounded-lg border border-stone-200 bg-stone-50 pl-3 pr-9 text-sm font-black text-stone-700 outline-none focus:border-emerald-400"
                >
                  <option value="recommended">Recommended</option>
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              </label>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                  <div className="aspect-[4/3] animate-pulse bg-stone-100" />
                  <div className="space-y-3 p-4">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-stone-100" />
                    <div className="h-3 w-full animate-pulse rounded bg-stone-100" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-stone-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              <div ref={loadMoreRef} className="h-12">
                {loadingMore && (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm font-black text-emerald-800">
                    <Loader2 size={18} className="animate-spin" />
                    Loading more products
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-stone-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Search size={26} />
              </div>
              <h3 className="text-lg font-black text-stone-950">No products found</h3>
              <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-stone-500">
                Try a wider location, another category, or a simpler search phrase.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
              >
                Clear search
              </button>
            </div>
          )}
        </section>
      </main>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-stone-950/50" onClick={() => setFiltersOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[86vh] overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-emerald-700" />
                <h2 className="text-lg font-black text-stone-950">Filters</h2>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-lg border border-stone-200 p-2 text-stone-500"
                aria-label="Close filters"
              >
                <X size={18} />
              </button>
            </div>
            <FilterPanel
              categories={displayCategories}
              locations={locations}
              selectedCategory={selectedCategory}
              selectedState={selectedState}
              selectedCity={selectedCity}
              onCategoryChange={(value) => {
                setSelectedCategory(value);
                setFiltersOpen(false);
              }}
              onStateChange={(value) => {
                setSelectedState(value);
                setSelectedCity('');
              }}
              onCityChange={(value) => {
                setSelectedCity(value);
                setFiltersOpen(false);
              }}
              onClear={() => {
                clearFilters();
                setFiltersOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
