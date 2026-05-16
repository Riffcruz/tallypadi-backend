'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  BadgeCheck,
  ShoppingBag, Loader2, PackageX, ExternalLink, AlertTriangle,
  Search, Menu, Plus, Minus, ShoppingCart, X, MessageCircle,
} from 'lucide-react';
import ShopSidebar from './ShopSidebar';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type Product = {
  id: string;
  name: string;
  price: number;
  image?: string;
  category?: string;
  description?: string;
  colors?: string[];
  sizes?: string[];
  inStock: boolean;
};

type CartItem = {
  product: Product;
  qty: number;
};

type ShopInfo = {
  name: string;
  description?: string;
  heroImageUrl?: string;
  phone: string;
  planExpired?: boolean;
  categories: string[];
  themeColor?: string;
  currencyCode?: string;
  verification?: {
    verified?: boolean;
    label?: string | null;
  };
};

interface ShopClientProps {
  initialShop: ShopInfo | null;
  slug: string;
}

export default function ShopClient({ initialShop, slug }: ShopClientProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Theme color from shop settings
  const themeColor = initialShop?.themeColor || '#10b981';
  // Dynamic currency from shop settings
  const currencyCode = initialShop?.currencyCode || 'NGN';

  // Record Visit on Mount
  useEffect(() => {
    if (!initialShop) return;
    axios.post(`${API_URL}/shop/${slug}/visit`).catch(() => {});
  }, [slug, initialShop]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProducts = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const p = reset ? 1 : page;
      const res = await axios.get(`${API_URL}/shop/${slug}/products`, {
        params: { page: p, q: debouncedSearch, category, sort },
      });
      const { products: newProducts, pagination } = res.data;
      if (reset) {
        setProducts(newProducts);
      } else {
        setProducts(prev => [...prev, ...newProducts]);
      }
      setTotalPages(pagination.totalPages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [slug, page, debouncedSearch, category, sort]);

  useEffect(() => { setPage(1); fetchProducts(true); }, [debouncedSearch, category, sort]); // eslint-disable-line
  useEffect(() => { if (page > 1) fetchProducts(false); }, [page]); // eslint-disable-line

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry.isIntersecting || loading || page >= totalPages) return;
      setPage(prev => Math.min(prev + 1, totalPages));
    }, { rootMargin: '450px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, page, totalPages]);

  // ─── Cart Helpers ───
  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const getQty = (id: string) => cart.find(c => c.product.id === id)?.qty || 0;

  const addToCart = (product: Product) => {
    // If we want to support unique variants in cart, we'd alter the ID. 
    // For now, we just add the product directly.
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) return prev.map(c => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { product, qty: 1 }];
    });
  };

  const decreaseQty = (id: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === id);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter(c => c.product.id !== id);
      return prev.map(c => c.product.id === id ? { ...c, qty: c.qty - 1 } : c);
    });
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(c => c.product.id !== id));

  const formatMoney = (amount: number) => {
    // Basic locale mapping based on currency for cleaner output
    const localeMap: Record<string, string> = {
      'NGN': 'en-NG', 'USD': 'en-US', 'GBP': 'en-GB',
      'EUR': 'de-DE', 'GHS': 'en-GH', 'KES': 'en-KE', 'ZAR': 'en-ZA'
    };
    const localeToUse = localeMap[currencyCode] || 'en-US';
    return new Intl.NumberFormat(localeToUse, { 
      style: 'currency', 
      currency: currencyCode, 
      maximumFractionDigits: 0 
    }).format(amount);
  };

  const buildWhatsAppMessage = () => {
    const lines = cart.map((item, i) =>
      `${i + 1}. ${item.product.name} x${item.qty} — ${formatMoney(item.product.price * item.qty)}`
    ).join('\n');

    return `Hi ${initialShop?.name}, I'd like to order:\n\n${lines}\n\nTotal: ${formatMoney(cartTotal)}\n\nPlease confirm availability.`;
  };

  const handleWhatsAppCheckout = () => {
    if (!initialShop?.phone || cart.length === 0) return;
    const msg = buildWhatsAppMessage();
    const link = `https://wa.me/${initialShop.phone}?text=${encodeURIComponent(msg)}`;
    window.open(link, '_blank');
  };

  if (!initialShop) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-4">
          <PackageX className="w-12 h-12 text-slate-300 mx-auto" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Shop unavailable</h1>
        <p className="text-slate-500 text-sm mb-6">The shop you are looking for does not exist or is currently closed.</p>
        <Link href="/" className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-black transition">Go to Tallypadi</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Expired Plan Banner */}
      {initialShop.planExpired && (
        <div className="bg-amber-100 border-b border-amber-200 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center gap-2 text-amber-800">
            <AlertTriangle size={18} />
            <span className="text-sm font-semibold">This shop is temporarily inactive.</span>
          </div>
        </div>
      )}

      {/* JIJI-STYLE HEADER */}
      <header className="relative w-full pb-8 md:pb-16 pt-4 md:pt-6 px-4 shadow-sm" style={{ backgroundColor: themeColor }}>
        {initialShop.heroImageUrl && (
           <img src={initialShop.heroImageUrl} alt="Cover" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-20 pointer-events-none" />
        )}
        <div className="relative z-10 max-w-7xl mx-auto flex flex-col">
           {/* Top row: Logo/Name and Contact/Cart */}
           <div className="flex items-center justify-between mb-8 md:mb-12">
              <div className="flex items-center gap-3">
                 <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition">
                    <Menu size={24} />
                 </button>
                 <div className="flex min-w-0 items-start gap-2">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm" style={{ color: themeColor }}>
                       <ShoppingBag size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h1 className="text-white text-2xl md:text-3xl font-black tracking-tight drop-shadow-sm">{initialShop.name}</h1>
                        {initialShop.verification?.verified && (
                          <span title={initialShop.verification.label || 'Verified seller'} className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-black text-sky-700 shadow-sm">
                            <BadgeCheck size={14} fill="currentColor" />
                            Verified
                          </span>
                        )}
                      </div>
                      {initialShop.description && (
                        <p className="mt-1 max-w-xl text-sm font-semibold leading-6 text-white/90 drop-shadow-sm md:text-base">
                          {initialShop.description}
                        </p>
                      )}
                    </div>
                 </div>
              </div>
              <div className="flex items-center gap-3 md:gap-4">
                 {initialShop.phone && (
                    <a
                       href={`https://wa.me/${initialShop.phone}`}
                       target="_blank"
                       rel="noreferrer"
                       className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white font-bold text-sm backdrop-blur-md transition-all border border-white/20"
                    >
                       <MessageCircle size={16} />
                       Chat on WhatsApp
                    </a>
                 )}
                 {cartCount > 0 && (
                    <button onClick={() => setIsCartOpen(true)} className="relative p-2.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md transition-all border border-white/20">
                       <ShoppingCart size={20} className="text-white" />
                       <span className="absolute -top-1.5 -right-1.5 bg-white text-xs font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md" style={{ color: themeColor }}>
                          {cartCount}
                       </span>
                    </button>
                 )}
              </div>
           </div>

           {/* Search Area */}
           <div className="max-w-2xl mx-auto w-full text-center">
              <h2 className="text-white text-2xl md:text-4xl font-bold mb-6 drop-shadow-sm">What are you looking for?</h2>
              <div className="relative flex items-center shadow-2xl rounded-full">
                 <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                 <input
                    type="text"
                    placeholder="I am looking for..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-14 pr-4 py-4 rounded-full bg-white border-none outline-none text-base md:text-lg font-medium placeholder:text-slate-400"
                 />
              </div>
           </div>
        </div>
      </header>

      {/* Mobile visible filters */}
      <section className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Filter products</p>
            <p className="truncate text-sm font-bold text-slate-800">
              {category ? `Showing ${category}` : 'All products'}
            </p>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Low price</option>
            <option value="price_desc">High price</option>
          </select>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategory('')}
            className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${
              category === '' ? 'text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
            style={category === '' ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
          >
            All
          </button>
          {initialShop.categories.map((cat) => {
            const value = cat.toLowerCase();
            const active = category === value;
            return (
              <button
                key={cat}
                onClick={() => setCategory(value)}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black capitalize transition ${
                  active ? 'text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
                style={active ? { backgroundColor: themeColor, borderColor: themeColor } : {}}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Layout Container */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <ShopSidebar
          shopName={initialShop.name}
          shopPhone={initialShop.phone}
          categories={initialShop.categories}
          activeCategory={category}
          onCategorySelect={setCategory}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          themeColor={themeColor}
        />

        {/* Main Product Area */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Sorting Header */}
          <div className="flex items-center justify-between mb-6">
             <h3 className="font-bold text-slate-800 text-lg md:text-xl">Trending ads</h3>
             <select
               value={sort}
               onChange={(e) => setSort(e.target.value)}
               className="bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition"
             >
               <option value="newest">Newest</option>
               <option value="price_asc">Price: Low to High</option>
               <option value="price_desc">Price: High to Low</option>
             </select>
          </div>

        {/* PRODUCT GRID */}
        <div className="pb-32 w-full">
          {products.length === 0 && !loading ? (
            <div className="text-center py-24">
              <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="text-slate-400 w-8 h-8" />
              </div>
              <h3 className="text-slate-900 font-bold text-lg">No products found</h3>
              <p className="text-slate-500 text-sm">Try adjusting your filters.</p>
              <button onClick={() => { setSearch(''); setCategory(''); }} className="mt-4 text-sm font-bold hover:underline" style={{ color: themeColor }}>
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                {products.map((product) => {
                  const qty = getQty(product.id);
                  const inCart = qty > 0;

                  return (
                    <div
                      key={product.id}
                      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-slate-900/5 hover:-translate-y-1 transition-all duration-300 flex flex-col"
                    >
                      {/* Image */}
                      <Link
                        href={`/shop/${slug}/product/${product.id}`}
                        className="aspect-square bg-slate-100 relative overflow-hidden cursor-pointer"
                      >
                        {product.image ? (
                          <img src={product.image} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl font-black uppercase select-none bg-slate-50" style={{ color: themeColor }}>
                            {product.name.slice(0, 1)}
                          </div>
                        )}
                        {!product.inStock && (
                          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                            <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-full">SOLD OUT</span>
                          </div>
                        )}
                      </Link>

                      {/* Card Body */}
                      <div className="p-3 flex flex-col flex-1">
                        <span className="font-black text-lg block mb-1" style={{ color: themeColor }}>{formatMoney(product.price)}</span>
                        <Link
                          href={`/shop/${slug}/product/${product.id}`}
                          className="font-medium text-slate-700 text-sm line-clamp-2 leading-snug mb-2 group-hover:transition-colors cursor-pointer hover:underline"
                          style={{ '--hover-color': themeColor } as React.CSSProperties}
                        >
                          {product.name}
                        </Link>
                        {product.category && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-2 block">{product.category}</span>
                        )}
                        <div className="mt-auto">

                          {/* Add to Cart / Qty Controls */}
                          {product.inStock ? (
                            inCart ? (
                              <div className="flex items-center justify-between rounded-xl overflow-hidden border-2" style={{ borderColor: themeColor }}>
                                <button
                                  onClick={() => decreaseQty(product.id)}
                                  className="px-3 py-2 text-white font-bold transition-opacity hover:opacity-80"
                                  style={{ backgroundColor: themeColor }}
                                >
                                  <Minus size={14} />
                                </button>
                                <span className="font-black text-sm px-2" style={{ color: themeColor }}>{qty}</span>
                                <button
                                  onClick={() => addToCart(product)}
                                  className="px-3 py-2 text-white font-bold transition-opacity hover:opacity-80"
                                  style={{ backgroundColor: themeColor }}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(product)}
                                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-bold transition-all hover:opacity-90 active:scale-95 shadow-md"
                                style={{ backgroundColor: themeColor }}
                              >
                                <Plus size={13} /> Add to Cart
                              </button>
                            )
                          ) : (
                            <div className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold text-center">Out of Stock</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div ref={loadMoreRef} className="h-14">
                {loading && page > 1 && (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm font-black" style={{ color: themeColor }}>
                    <Loader2 className="animate-spin w-5 h-5" />
                    Loading more products
                  </div>
                )}
              </div>

              {loading && page === 1 && (
                <div className="py-20 flex justify-center">
                  <Loader2 className="animate-spin w-8 h-8" style={{ color: themeColor }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="py-8 text-center text-slate-400 border-t border-slate-200 mt-auto">
          <a href="https://tallypadi.com" target="_blank" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-emerald-600 transition">
            <span>Storefront by</span><span className="font-black text-slate-600">tallypadi</span><ExternalLink size={10} />
          </a>
        </footer>
        </main>
      </div>

      {/* ════════════════════════════════════════════
          FLOATING CART BAR (shows when cart has items)
      ════════════════════════════════════════════ */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 pointer-events-none">
          <div className="max-w-4xl mx-auto pointer-events-auto">
            <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/20 border border-slate-200/80 p-4 flex items-center justify-between gap-4 backdrop-blur-md animate-in slide-in-from-bottom duration-300">
              {/* Cart Summary */}
              <button onClick={() => setIsCartOpen(true)} className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${themeColor}20` }}>
                    <ShoppingCart size={20} style={{ color: themeColor }} />
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow" style={{ backgroundColor: themeColor }}>
                    {cartCount}
                  </span>
                </div>
                <div className="text-left min-w-0">
                  <p className="text-xs text-slate-500 font-medium">{cartCount} item{cartCount !== 1 ? 's' : ''} in cart</p>
                  <p className="text-base font-black text-slate-900">{formatMoney(cartTotal)}</p>
                </div>
              </button>

              {/* Checkout Button */}
              <button
                onClick={handleWhatsAppCheckout}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-white font-bold text-sm shadow-lg transition-all hover:opacity-90 active:scale-95 flex-shrink-0"
                style={{ backgroundColor: themeColor }}
              >
                <MessageCircle size={16} />
                <span className="hidden xs:inline">Checkout via </span>WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          CART DRAWER (slides in from right)
      ════════════════════════════════════════════ */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[60] flex">
          {/* Backdrop */}
          <div className="flex-1 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsCartOpen(false)} />

          {/* Drawer */}
          <div className="w-full max-w-sm bg-white h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingCart size={20} style={{ color: themeColor }} />
                <h2 className="font-black text-lg text-slate-900">Your Cart</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: themeColor }}>{cartCount}</span>
              </div>
              <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition">
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3 bg-slate-50 rounded-2xl p-3">
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-200 flex-shrink-0">
                    {item.product.image ? (
                      <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black text-xl uppercase" style={{ color: themeColor }}>
                        {item.product.name[0]}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">{item.product.name}</p>
                    <p className="text-xs text-slate-500">{formatMoney(item.product.price)} each</p>
                    <p className="text-sm font-black mt-0.5" style={{ color: themeColor }}>{formatMoney(item.product.price * item.qty)}</p>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 rounded-xl overflow-hidden border" style={{ borderColor: themeColor }}>
                      <button onClick={() => decreaseQty(item.product.id)} className="px-2.5 py-1.5 text-white text-xs font-bold" style={{ backgroundColor: themeColor }}>
                        <Minus size={12} />
                      </button>
                      <span className="px-2 text-sm font-black" style={{ color: themeColor }}>{item.qty}</span>
                      <button onClick={() => addToCart(item.product)} className="px-2.5 py-1.5 text-white text-xs font-bold" style={{ backgroundColor: themeColor }}>
                        <Plus size={12} />
                      </button>
                    </div>
                    <button onClick={() => removeFromCart(item.product.id)} className="text-[10px] text-slate-400 hover:text-red-500 transition font-medium">remove</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Drawer Footer */}
            <div className="p-5 border-t border-slate-100 space-y-3 bg-white">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Order Total</span>
                <span className="text-xl font-black text-slate-900">{formatMoney(cartTotal)}</span>
              </div>
              <button
                onClick={() => { setIsCartOpen(false); handleWhatsAppCheckout(); }}
                className="w-full py-4 rounded-2xl text-white font-black text-base flex items-center justify-center gap-3 shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ backgroundColor: themeColor }}
              >
                <MessageCircle size={20} />
                Send Order on WhatsApp
              </button>
              <p className="text-center text-[10px] text-slate-400 font-medium">
                Your order details will be sent directly to {initialShop.name}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
