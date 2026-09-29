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
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import MarketplaceFooter from '../../components/marketplace/MarketplaceFooter';
import MarketplaceHeader from '../../components/marketplace/MarketplaceHeader';

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

const CATEGORY_ICONS: Record<string, string> = {
  'phones-tablets': '📱',
  electronics: '💻',
  'home-appliances': '🛋️',
  fashion: '👗',
  'beauty-care': '🧴',
  'food-farming': '🌾',
  'tools-equipment': '🛠️',
  'babies-kids': '🧸',
  services: '🧰',
  other: '📦',
};

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

      <details open className="group overflow-hidden rounded-lg border border-stone-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-black text-stone-900 marker:content-none">
          Categories
          <ChevronDown size={16} className="transition group-open:rotate-180" />
        </summary>
        <div className="space-y-1 border-t border-stone-100 p-2">
          <button
            type="button"
            onClick={() => onCategoryChange('')}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-bold transition ${!selectedCategory
              ? 'bg-emerald-700 text-white'
              : 'text-stone-700 hover:bg-emerald-50 hover:text-emerald-900'
              }`}
          >
            <span>All products</span>
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategoryChange(category.id)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-bold transition ${selectedCategory === category.id
                ? 'bg-emerald-700 text-white'
                : 'text-stone-700 hover:bg-emerald-50 hover:text-emerald-900'
                }`}
            >
              <span>{category.label}</span>
              {category.count !== undefined && <span className="text-[11px] opacity-70">{category.count}</span>}
            </button>
          ))}
        </div>
      </details>

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
  const previewDescription = product.description;

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${product.isBoosted ? 'border-amber-300 shadow-amber-100' : 'border-stone-200'
        }`}
    >
      <Link href={productUrl} className="relative block aspect-square overflow-hidden bg-stone-100 sm:aspect-[4/3]">
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
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5 sm:left-3 sm:top-3 sm:gap-2">
          {product.isBoosted && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-1 text-[11px] font-black text-stone-950 shadow">
              <TrendingUp size={12} />
              Boosted
            </span>
          )}
          <span className="hidden rounded-md bg-white/90 px-2 py-1 text-[11px] font-black text-emerald-800 shadow sm:inline-flex">
            {product.smartCategory.label}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-black text-emerald-700 sm:text-lg">
              {formatMoney(product.price, product.shop.currencyCode)}
            </p>
            <Link href={productUrl} className="mt-1 block text-sm font-black leading-snug text-stone-950 line-clamp-2 hover:text-emerald-700">
              {titleCase(product.name)}
            </Link>
          </div>
        </div>

        {previewDescription && (
          <p className="mb-3 hidden text-xs leading-relaxed text-stone-500 line-clamp-2 sm:block">
            {previewDescription}
          </p>
        )}

        <div className="mt-auto space-y-2 border-t border-stone-100 pt-2.5 sm:space-y-3 sm:pt-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-sm font-bold text-stone-800">
              <Store size={14} className="shrink-0 text-emerald-700" />
              <span className="truncate">{product.shop.name}</span>
              {product.shop.verification?.verified && (
                <span title={product.shop.verification.label || 'Verified'} className="inline-flex shrink-0 text-blue-500">
                  <BadgeCheck size={16} fill="currentColor" stroke="white" />
                </span>
              )}
            </div>
            {locationText && (
              <div className="mt-1 hidden items-center gap-1.5 text-xs font-semibold text-stone-500 sm:flex">
                <MapPin size={13} className="text-amber-600" />
                <span className="truncate">{locationText}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href={productUrl}
              className="hidden items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 sm:inline-flex"
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

function SponsoredProductCard({ product }: { product: MarketplaceProduct }) {
  const productUrl = `/marketplace/product/${product.id}`;

  return (
    <Link
      href={productUrl}
      className="group grid min-w-[260px] grid-cols-[88px_1fr] overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md sm:min-w-0"
    >
      <div className="aspect-square overflow-hidden bg-emerald-50">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-black uppercase text-emerald-700">
            {product.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="min-w-0 p-3">
        <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-900">
          Sponsored
        </span>
        <h3 className="mt-1.5 line-clamp-1 text-sm font-black text-stone-950 group-hover:text-emerald-700">
          {titleCase(product.name)}
        </h3>
        <p className="mt-1 text-sm font-black text-emerald-700">
          {formatMoney(product.price, product.shop.currencyCode)}
        </p>
        <p className="mt-1 truncate text-xs font-semibold text-stone-500">{product.shop.name}</p>
      </div>
    </Link>
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
  const sponsoredProducts = useMemo(
    () => products.filter((product) => product.isBoosted).slice(0, 4),
    [products]
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

      const response = await fetch(`${API_URL}/marketplace?${params.toString()}`);

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
      <MarketplaceHeader />
      <section className="border-b border-emerald-900 bg-emerald-950 text-white">
        <div className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="flex flex-col justify-center">
            <div className="mb-4 hidden w-fit items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-800/70 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-100 sm:inline-flex">
              Shop local businesses
            </div>
            <h1 className="max-w-3xl text-2xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              <span className="sm:hidden">Find products near you.</span>
              <span className="hidden sm:inline">Shop products from trusted local businesses.</span>
            </h1>
            <p className="mt-3 hidden max-w-2xl text-sm font-medium leading-6 text-emerald-50 sm:block sm:text-base">
              Find products near you and chat directly with verified independent sellers.
            </p>

            <form
              className="mt-4 grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-white p-2 text-stone-950 shadow-lg sm:mt-6 sm:gap-3 sm:p-3 lg:grid-cols-[1.2fr_180px_180px_120px]"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products, shops, or categories"
                  className="h-11 w-full rounded-lg border-0 bg-stone-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:bg-white focus:ring-2 focus:ring-emerald-400 sm:h-12 sm:border sm:text-base"
                />
              </label>

              <label className="relative hidden lg:block">
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

              <label className="relative hidden lg:block">
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
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-400 text-stone-950 transition hover:bg-amber-300 sm:h-12 sm:w-auto sm:gap-2 sm:px-4 lg:hidden"
              >
                <Filter size={16} />
                <span className="hidden sm:inline">Filter</span>
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

      <main id="listings" className="mx-auto grid max-w-7xl gap-5 px-3 py-4 sm:px-6 sm:py-6 lg:grid-cols-[270px_1fr] lg:px-8">
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
          <section className="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:hidden">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-stone-950">Browse categories</h2>
              {selectedCategory && (
                <button type="button" onClick={() => setSelectedCategory('')} className="text-xs font-black text-emerald-700">Clear</button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-5">
              <button type="button" onClick={() => setSelectedCategory('')} className="flex min-w-0 flex-col items-center gap-2 text-center">
                <span className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl ${!selectedCategory ? 'bg-emerald-600 text-white ring-2 ring-emerald-200' : 'bg-stone-100'}`}>🛍️</span>
                <span className="text-[11px] font-bold leading-4 text-stone-700">All products</span>
              </button>
              {displayCategories.map((item) => (
                <button key={`mobile-${item.id}`} type="button" onClick={() => setSelectedCategory(item.id)} className="flex min-w-0 flex-col items-center gap-2 text-center">
                  <span className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl ${selectedCategory === item.id ? 'bg-emerald-600 ring-2 ring-emerald-200' : 'bg-slate-100'}`}>
                    {CATEGORY_ICONS[item.id] || '📦'}
                  </span>
                  <span className="line-clamp-2 text-[11px] font-bold leading-4 text-stone-700">{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          {!loading && sponsoredProducts.length > 0 && (
            <section aria-labelledby="sponsored-products" className="mb-4 rounded-lg bg-amber-50 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="sponsored-products" className="text-sm font-black text-stone-950 sm:text-base">
                  Sponsored products
                </h2>
                <span className="text-[11px] font-bold text-stone-500">Promoted listings</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4">
                {sponsoredProducts.map((product) => (
                  <SponsoredProductCard key={`sponsored-${product.id}`} product={product} />
                ))}
              </div>
            </section>
          )}

          <div className="mb-3 flex items-end justify-between gap-3 border-b border-stone-200 pb-3 sm:mb-4 sm:rounded-lg sm:border sm:bg-white sm:p-4 sm:shadow-sm">
            <div>
              <div className="hidden flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700 sm:flex">
                <span>{activeCategoryLabel || 'All products'}</span>
                <span className="text-stone-300">/</span>
                <span>{activeLocationLabel}</span>
              </div>
              <h2 className="text-lg font-black text-stone-950 sm:mt-1 sm:text-xl">
                {loading ? 'Finding products' : `${totalItems.toLocaleString()} product${totalItems === 1 ? '' : 's'}`}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="hidden items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-black text-stone-700"
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
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
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
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
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

      <MarketplaceFooter />

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
