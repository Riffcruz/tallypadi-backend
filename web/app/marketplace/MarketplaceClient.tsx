'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { State } from 'country-state-city';
import {
  ChevronDown,
  Filter,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import MarketplaceCategoryGrid from '../../components/marketplace/MarketplaceCategoryGrid';
import MarketplaceFooter from '../../components/marketplace/MarketplaceFooter';
import MarketplaceHeader from '../../components/marketplace/MarketplaceHeader';
import {
  MarketplaceProductCard,
  MarketplaceSponsoredProductCard,
} from '../../components/marketplace/MarketplaceProductCards';
import {
  cleanMarketplaceCategories,
  MARKETPLACE_CATEGORIES,
  type SmartCategory,
} from '../../lib/marketplaceCatalog';
import type { MarketplaceLocation, MarketplaceProduct, MarketplaceResponse } from '../../lib/marketplaceTypes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

const getStateLabel = (stateCode?: string, countryCode = 'NG') => {
  if (!stateCode) return '';
  return State.getStateByCodeAndCountry(stateCode, countryCode)?.name || stateCode;
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

export default function MarketplaceClient() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [categories, setCategories] = useState<SmartCategory[]>(MARKETPLACE_CATEGORIES);
  const [locations, setLocations] = useState<MarketplaceLocation[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [sort, setSort] = useState('recommended');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(1);
  const discoverySeedRef = useRef('');

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
  const sponsoredProductIds = useMemo(
    () => new Set(sponsoredProducts.map((product) => product.id)),
    [sponsoredProducts]
  );
  const regularProducts = useMemo(
    () => products.filter((product) => !sponsoredProductIds.has(product.id)),
    [products, sponsoredProductIds]
  );

  const displayCategories = categories.length > 0 ? categories : MARKETPLACE_CATEGORIES;
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

      let endpoint = `${API_URL}/marketplace`;
      if (sort === 'recommended') {
        if (!discoverySeedRef.current) {
          discoverySeedRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        }
        params.set('seed', discoverySeedRef.current);
        endpoint = `${API_URL}/marketplace/discovery`;
      }

      const response = await fetch(`${endpoint}?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Marketplace could not load right now.');
      }

      const data = (await response.json()) as MarketplaceResponse;
      setProducts((current) => (reset ? data.products : [...current, ...data.products]));
      setCategories(cleanMarketplaceCategories(data.categories || []));
      setLocations(data.locations || []);
      setHasMore(Boolean(data.pagination?.hasMore));
    } catch {
      setError('Marketplace could not load right now.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, selectedCategory, selectedCity, selectedState, sort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      pageRef.current = 1;
      fetchListings(1, true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchListings]);

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
              Find products near you and chat directly with independent sellers.
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
                aria-label="Open marketplace filters"
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
          <MarketplaceCategoryGrid
            categories={displayCategories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
          />

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
                  <MarketplaceSponsoredProductCard key={`sponsored-${product.id}`} product={product} />
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
                {loading ? 'Finding products' : activeCategoryLabel || 'Products for you'}
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
              {regularProducts.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
                  {regularProducts.map((product) => (
                    <MarketplaceProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}

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
