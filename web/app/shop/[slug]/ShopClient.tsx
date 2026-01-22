'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import Image from 'next/image';
import {
  ShoppingBag,
  Phone,
  Loader2,
  PackageX,
  ExternalLink,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  X,
  Sun,
  Moon,
  Sparkles,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type Product = {
  id: string;
  name: string;
  price: number;
  image?: string;
  category?: string;
  inStock: boolean;
};

type ShopInfo = {
  name: string;
  description?: string;
  heroImageUrl?: string;
  phone: string;
  planExpired?: boolean;
  categories: string[];
};

interface ShopClientProps {
  initialShop: ShopInfo | null;
  slug: string;
}

const TALLY = {
  emerald: '#10B981',
  emeraldDark: '#059669',
};

export default function ShopClient({ initialShop, slug }: ShopClientProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  // paging
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<'newest' | 'price_asc' | 'price_desc'>('newest');

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);

  // debounce
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 450);
    return () => clearTimeout(t);
  }, [search]);

  // theme class
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [dark]);

  const formatMoney = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  }, []);

  const shopBase = useMemo(() => `https://tallypadi.com/shop/${slug}`, [slug]);

  const fetchProducts = useCallback(
    async (reset: boolean) => {
      if (!initialShop) return;

      setLoading(true);
      try {
        const p = reset ? 1 : page;
        const res = await axios.get(`${API_URL}/shop/${slug}/products`, {
          params: {
            page: p,
            q: debouncedSearch,
            category: category || undefined,
            sort,
          },
        });

        const { products: newProducts, pagination } = res.data || {};
        const safeProducts: Product[] = Array.isArray(newProducts) ? newProducts : [];
        const safeTotalPages = Number(pagination?.totalPages || 1);

        setTotalPages(safeTotalPages);

        if (reset) setProducts(safeProducts);
        else setProducts((prev) => [...prev, ...safeProducts]);
      } catch (e) {
        console.error('Shop fetchProducts failed:', e);
      } finally {
        setLoading(false);
      }
    },
    [slug, page, debouncedSearch, category, sort, initialShop]
  );

  // reset when filters change
  useEffect(() => {
    setPage(1);
    fetchProducts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, sort]);

  // load more when page increments
  useEffect(() => {
    if (page > 1) fetchProducts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setSort('newest');
  };

  const categories = useMemo(() => {
    const cats = Array.isArray(initialShop?.categories) ? initialShop!.categories : [];
    return cats.map((c) => String(c || '').trim()).filter(Boolean);
  }, [initialShop]);

  // Build WhatsApp message
  const buildWhatsappLink = useCallback(
    (product: Product) => {
      const productUrl = `${shopBase}?productId=${encodeURIComponent(product.id)}&ref=whatsapp`;
      const text = `Hi ${initialShop?.name || 'there'}, I want to buy:\n\n*${product.name}*\nPrice: ${formatMoney(
        product.price
      )}\n\nLink: ${productUrl}`;
      return `https://wa.me/${initialShop?.phone}?text=${encodeURIComponent(text)}`;
    },
    [initialShop, formatMoney, shopBase]
  );

  if (!initialShop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 text-center">
        <div className="max-w-md w-full">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-4">
            <PackageX className="w-12 h-12 text-slate-300 mx-auto" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Shop unavailable</h1>
          <p className="text-slate-500 text-sm mb-6">
            The shop you are looking for does not exist or is currently closed.
          </p>
          <a
            href="/"
            className="inline-flex items-center justify-center w-full px-6 py-3 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-black transition"
          >
            Go to Tallypadi
          </a>
        </div>
      </div>
    );
  }

  const ShopHeader = (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:bg-slate-950/60 dark:border-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-900 transition"
            aria-label="Open menu"
          >
            <SlidersHorizontal className="w-5 h-5 text-slate-700 dark:text-slate-200" />
          </button>

          <div className="flex items-center gap-2">
            <div
              className="h-10 w-10 rounded-2xl flex items-center justify-center text-white font-black shadow"
              style={{
                background: `linear-gradient(135deg, ${TALLY.emerald} 0%, ${TALLY.emeraldDark} 100%)`,
              }}
            >
              T
            </div>
            <div className="leading-tight">
              <div className="text-sm font-black text-slate-900 dark:text-slate-100">{initialShop.name}</div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Storefront by Tallypadi
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDark((v) => !v)}
            className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-900 transition"
            aria-label="Toggle theme"
          >
            {dark ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-slate-700" />
            )}
          </button>

          {initialShop.phone ? (
            <a
              href={`https://wa.me/${initialShop.phone}`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-sm text-white shadow-lg active:scale-[0.99]"
              style={{
                background:
                  'linear-gradient(135deg, #22c55e 0%, #10b981 35%, #06b6d4 100%)',
              }}
            >
              <Phone size={16} />
              Chat on WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen font-sans bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      {/* Expired plan */}
      {initialShop.planExpired && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center gap-2 text-amber-800">
            <AlertTriangle size={18} />
            <span className="text-sm font-semibold">This shop is temporarily inactive.</span>
          </div>
        </div>
      )}

      {ShopHeader}

      {/* Sidebar */}
      <div
        className={`fixed inset-0 z-[60] ${sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!sidebarOpen}
      >
        <div
          onClick={() => setSidebarOpen(false)}
          className={`absolute inset-0 bg-black/30 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[86%] max-w-sm bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 shadow-2xl transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <span className="font-black">Filters</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-900 transition"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-5">
            <div>
              <label className="text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Search
              </label>
              <div className="mt-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-transparent focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Sort
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="mt-2 w-full px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-900 text-sm font-bold border border-transparent focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 outline-none"
              >
                <option value="newest">Newest</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-extrabold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Category
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => setCategory('')}
                  className={`px-3 py-2 rounded-full text-xs font-black border transition ${
                    category === ''
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => {
                  const v = cat.toLowerCase();
                  const active = category === v;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategory(active ? '' : v)}
                      className={`px-3 py-2 rounded-full text-xs font-black border transition capitalize ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={clearFilters}
              className="w-full px-4 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm hover:opacity-90 transition"
            >
              Clear filters
            </button>

            {initialShop.phone ? (
              <a
                href={`https://wa.me/${initialShop.phone}`}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-black text-sm text-white shadow-lg"
                style={{
                  background:
                    'linear-gradient(135deg, #22c55e 0%, #10b981 35%, #06b6d4 100%)',
                }}
              >
                <Phone size={16} />
                Chat on WhatsApp
              </a>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl opacity-25"
            style={{ background: `radial-gradient(circle, ${TALLY.emerald} 0%, transparent 60%)` }}
          />
          <div
            className="absolute top-24 -right-24 h-80 w-80 rounded-full blur-3xl opacity-20"
            style={{ background: `radial-gradient(circle, #06b6d4 0%, transparent 60%)` }}
          />
        </div>

        <div className="max-w-6xl mx-auto px-4 pt-8 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_.9fr] gap-6">
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 shadow-sm">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-600">
                Verified Tallypadi Merchant
              </p>
              <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">
                {initialShop.name}
              </h1>
              <p className="mt-3 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                {initialShop.description || 'Browse products and chat on WhatsApp to buy instantly.'}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                {initialShop.phone ? (
                  <a
                    href={`https://wa.me/${initialShop.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm text-white shadow-lg active:scale-[0.99]"
                    style={{
                      background:
                        'linear-gradient(135deg, #22c55e 0%, #10b981 35%, #06b6d4 100%)',
                    }}
                  >
                    <Phone size={16} />
                    Chat on WhatsApp
                  </a>
                ) : null}

                <a
                  href="https://tallypadi.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 transition"
                >
                  <ShoppingBag size={16} />
                  Get Tallypadi
                </a>
              </div>
            </div>

            <div className="relative overflow-hidden bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-[28px] shadow-sm">
              <div className="absolute inset-0">
                {initialShop.heroImageUrl ? (
                  <>
                    <Image
                      src={initialShop.heroImageUrl}
                      alt="Shop cover"
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 40vw"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-950" />
                )}
              </div>

              <div className="relative p-6 h-full min-h-[220px] flex flex-col justify-end">
                <div className="inline-flex items-center gap-2 text-white/90 text-xs font-extrabold uppercase tracking-widest">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Fast WhatsApp ordering
                </div>
                <div className="mt-2 text-white font-black text-xl">
                  Tap a product → message seller instantly.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop filter row (sidebar is primary on mobile) */}
        <div className="max-w-6xl mx-auto px-4 pb-5 hidden md:block">
          <div className="bg-white/70 dark:bg-slate-950/60 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-[22px] p-3 shadow-sm flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-transparent focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm font-semibold"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-900 text-sm font-black border border-transparent focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/20 outline-none"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>

          {categories.length > 0 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setCategory('')}
                className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap border transition ${
                  category === ''
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                All
              </button>
              {categories.map((cat) => {
                const v = cat.toLowerCase();
                const active = category === v;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(active ? '' : v)}
                    className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap border transition capitalize ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      {/* Products */}
      <main className="max-w-6xl mx-auto px-4 pb-20">
        {products.length === 0 && !loading ? (
          <div className="text-center py-24">
            <div className="bg-slate-100 dark:bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="text-slate-400 w-8 h-8" />
            </div>
            <h3 className="text-slate-900 dark:text-white font-black text-lg">No products found</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Try adjusting your filters.</p>
            <button
              onClick={clearFilters}
              className="mt-4 inline-flex items-center gap-2 text-emerald-600 font-black text-sm hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
              {products.map((product) => {
                const whatsappLink = buildWhatsappLink(product);

                return (
                  <div
                    key={product.id}
                    className="group bg-white dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-emerald-900/10 hover:-translate-y-1 transition-all duration-300 flex flex-col"
                  >
                    {/* Image */}
                    <a href={whatsappLink} target="_blank" rel="noreferrer" className="block">
                      <div className="aspect-square bg-slate-100 dark:bg-slate-900 relative overflow-hidden">
                        {product.image ? (
                          <Image
                            src={product.image}
                            alt={product.name}
                            fill
                            className="object-cover group-hover:scale-105 transition duration-500"
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 font-black text-4xl uppercase select-none bg-slate-50 dark:bg-slate-900">
                            {product.name.slice(0, 1)}
                          </div>
                        )}

                        {!product.inStock && (
                          <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px] flex items-center justify-center z-10">
                            <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-black rounded-full">
                              SOLD OUT
                            </span>
                          </div>
                        )}
                      </div>
                    </a>

                    {/* Content */}
                    <div className="p-4 flex flex-col flex-1">
                      {product.category ? (
                        <span className="text-[10px] uppercase tracking-wider font-black text-slate-400 mb-1 block">
                          {product.category}
                        </span>
                      ) : null}

                      <h3 className="font-black text-slate-900 dark:text-white text-sm line-clamp-2 leading-snug mb-2 group-hover:text-emerald-600 transition-colors">
                        {product.name}
                      </h3>

                      <div className="mt-auto flex items-center justify-between">
                        <span className="font-black text-slate-900 dark:text-white text-base">
                          {formatMoney(product.price)}
                        </span>
                      </div>

                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-xs font-black text-white shadow-lg active:scale-[0.99]"
                        style={{
                          background:
                            'linear-gradient(135deg, #22c55e 0%, #10b981 35%, #06b6d4 100%)',
                        }}
                      >
                        <ShoppingBag size={14} />
                        Buy on WhatsApp
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {page < totalPages ? (
              <div className="mt-10 text-center">
                <button
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={loading}
                  className="px-8 py-3 rounded-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm hover:bg-slate-50 dark:hover:bg-slate-900 transition shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load More Products'}
                </button>
              </div>
            ) : null}

            {/* Initial spinner */}
            {loading && page === 1 ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="animate-spin text-emerald-500 w-8 h-8" />
              </div>
            ) : null}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="py-10 text-center text-slate-400 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
        <a
          href="https://tallypadi.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-emerald-500 transition"
        >
          <span>Storefront by</span>
          <span className="font-black text-slate-600 dark:text-slate-200">tallypadi</span>
          <ExternalLink size={10} />
        </a>
      </footer>
    </div>
  );
}
