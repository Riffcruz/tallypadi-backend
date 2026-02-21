'use client';

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  ShoppingBag, Phone, Loader2, PackageX, ExternalLink, AlertTriangle,
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

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Theme color from shop settings
  const themeColor = initialShop?.themeColor || '#10b981';

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

  // ─── Cart Helpers ───
  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const getQty = (id: string) => cart.find(c => c.product.id === id)?.qty || 0;

  const addToCart = (product: Product) => {
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

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);

  if (!initialShop) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-4">
          <PackageX className="w-12 h-12 text-slate-300 mx-auto" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Shop unavailable</h1>
        <p className="text-slate-500 text-sm mb-6">The shop you are looking for does not exist or is currently closed.</p>
        <a href="/" className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-black transition">Go to Tallypadi</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex">
      {/* Sidebar */}
      <ShopSidebar
        shopName={initialShop.name}
        shopPhone={initialShop.phone}
        categories={initialShop.categories}
        activeCategory={category}
        onCategorySelect={setCategory}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        {/* Mobile Navbar */}
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between gap-4 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">
              <Menu size={24} />
            </button>
            <span className="font-bold text-lg text-slate-900 truncate">{initialShop.name}</span>
          </div>
          {/* Cart icon for mobile */}
          {cartCount > 0 && (
            <button onClick={() => setIsCartOpen(true)} className="relative p-2 rounded-xl" style={{ backgroundColor: themeColor }}>
              <ShoppingCart size={20} className="text-white" />
              <span className="absolute -top-1 -right-1 bg-white text-xs font-black w-5 h-5 rounded-full flex items-center justify-center shadow" style={{ color: themeColor }}>
                {cartCount}
              </span>
            </button>
          )}
        </header>

        {/* Expired Plan Banner */}
        {initialShop.planExpired && (
          <div className="bg-amber-100 border-b border-amber-200 px-4 py-3">
            <div className="max-w-4xl mx-auto flex items-center gap-2 text-amber-800">
              <AlertTriangle size={18} />
              <span className="text-sm font-semibold">This shop is temporarily inactive.</span>
            </div>
          </div>
        )}

        {/* HERO SECTION */}
        <div className="relative bg-white border-b border-slate-200">
          <div className="h-48 md:h-64 w-full bg-slate-200 overflow-hidden relative">
            {initialShop.heroImageUrl ? (
              <>
                <img src={initialShop.heroImageUrl} alt="Cover" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${themeColor}33, ${themeColor}88)` }}>
                <ShoppingBag className="text-white/30 w-32 h-32" />
              </div>
            )}
          </div>

          <div className="max-w-4xl mx-auto px-4 relative -mt-16 mb-6">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">{initialShop.name}</h1>
                {initialShop.description ? (
                  <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xl">{initialShop.description}</p>
                ) : (
                  <p className="text-slate-400 text-sm italic">Verified Tallypadi Merchant</p>
                )}
              </div>

              {initialShop.phone && (
                <a
                  href={`https://wa.me/${initialShop.phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl text-white font-bold text-sm shadow-lg whitespace-nowrap transition-all hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: themeColor }}
                >
                  <Phone size={16} />
                  Chat on WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Search & Sort Bar */}
        <div className="bg-white border-b border-slate-100 sticky top-[57px] md:top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-100 border-none outline-none text-sm font-medium placeholder:text-slate-400 focus:ring-2 transition-all"
                style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 border-none outline-none cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* PRODUCT GRID */}
        <main className="flex-1 max-w-4xl mx-auto w-full p-4 pb-32">
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
                      <div className="aspect-square bg-slate-100 relative overflow-hidden">
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
                      </div>

                      {/* Card Body */}
                      <div className="p-3 flex flex-col flex-1">
                        {product.category && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 block">{product.category}</span>
                        )}
                        <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug mb-2 group-hover:transition-colors" style={{ '--hover-color': themeColor } as React.CSSProperties}>
                          {product.name}
                        </h3>
                        <div className="mt-auto">
                          <span className="font-black text-slate-900 text-base block mb-2">{formatMoney(product.price)}</span>

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

              {/* Load More */}
              {page < totalPages && (
                <div className="mt-10 text-center">
                  <button
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={loading}
                    className="px-8 py-3 rounded-full bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Load More Products'}
                  </button>
                </div>
              )}

              {loading && page === 1 && (
                <div className="py-20 flex justify-center">
                  <Loader2 className="animate-spin w-8 h-8" style={{ color: themeColor }} />
                </div>
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="py-8 text-center text-slate-400 bg-slate-50 border-t border-slate-200">
          <a href="https://tallypadi.com" target="_blank" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-emerald-600 transition">
            <span>Storefront by</span><span className="font-black text-slate-600">tallypadi</span><ExternalLink size={10} />
          </a>
        </footer>
      </div>

      {/* ════════════════════════════════════════════
          FLOATING CART BAR (shows when cart has items)
      ════════════════════════════════════════════ */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 md:left-64 pointer-events-none">
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
