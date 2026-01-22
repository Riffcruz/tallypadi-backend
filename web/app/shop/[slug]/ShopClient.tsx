'use client';

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { ShoppingBag, Phone, Loader2, PackageX, ExternalLink, AlertTriangle, Search, Filter, ArrowDownWideNarrow, ArrowUpWideNarrow } from 'lucide-react';

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

export default function ShopClient({ initialShop, slug }: ShopClientProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest'); // newest, price_asc, price_desc

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProducts = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const p = reset ? 1 : page;
      const res = await axios.get(`${API_URL}/shop/${slug}/products`, {
        params: {
          page: p,
          q: debouncedSearch,
          category,
          sort
        }
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

  // Reset and fetch when filters change
  useEffect(() => {
    setPage(1);
    fetchProducts(true);
  }, [debouncedSearch, category, sort]); // eslint-disable-line

  // Fetch more when page increments
  useEffect(() => {
    if (page > 1) {
      fetchProducts(false);
    }
  }, [page]); // eslint-disable-line

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (!initialShop) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-4">
            <PackageX className="w-12 h-12 text-slate-300 mx-auto" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Shop unavailable</h1>
        <p className="text-slate-500 text-sm mb-6">The shop you are looking for does not exist or is currently closed.</p>
        <a href="/" className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-black transition">
            Go to Tallypadi
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
       {/* Expired Plan Banner */}
       {initialShop.planExpired && (
         <div className="bg-amber-100 border-b border-amber-200 px-4 py-3 sticky top-0 z-50">
           <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
             <div className="flex items-center gap-2 text-amber-800">
               <AlertTriangle size={18} />
               <span className="text-sm font-semibold">This shop is temporarily inactive.</span>
             </div>
           </div>
         </div>
       )}

       {/* HERO SECTION */}
       <div className="relative bg-white border-b border-slate-200">
          {/* Cover Image */}
          <div className="h-48 md:h-64 w-full bg-slate-200 overflow-hidden relative">
             {initialShop.heroImageUrl ? (
                <>
                  <img src={initialShop.heroImageUrl} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                </>
             ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                   <ShoppingBag className="text-white/10 w-32 h-32" />
                </div>
             )}
          </div>
          
          {/* Shop Info Card - Floating overlap */}
          <div className="max-w-4xl mx-auto px-4 relative -mt-16 mb-6">
             <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                   <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">{initialShop.name}</h1>
                   {initialShop.description && (
                      <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xl">
                         {initialShop.description}
                      </p>
                   )}
                   {!initialShop.description && <p className="text-slate-400 text-sm italic">Verified Tallypadi Merchant</p>}
                </div>
                
                {initialShop.phone && (
                  <a href={`https://wa.me/${initialShop.phone}`} target="_blank" rel="noreferrer" className="shrink-0 flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 active:scale-95">
                      <Phone size={18} />
                      <span>Chat on WhatsApp</span>
                  </a>
                )}
             </div>
          </div>
       </div>

       {/* STICKY FILTER BAR */}
       <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 space-y-3">
             {/* Top Row: Search + Sort */}
             <div className="flex gap-3">
                <div className="relative flex-1">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                   <input 
                      type="text" 
                      placeholder="Search products..." 
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500/20 outline-none"
                   />
                </div>
                
                <select 
                   value={sort} 
                   onChange={(e) => setSort(e.target.value)}
                   className="bg-slate-100 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 border-none outline-none cursor-pointer focus:ring-2 focus:ring-emerald-500/20"
                >
                   <option value="newest">Newest</option>
                   <option value="price_asc">Price: Low to High</option>
                   <option value="price_desc">Price: High to Low</option>
                </select>
             </div>

             {/* Bottom Row: Categories Chips */}
             {initialShop.categories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                   <button 
                      onClick={() => setCategory('')}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${ 
                         category === '' 
                         ? 'bg-slate-900 text-white' 
                         : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                   >
                      All
                   </button>
                   {initialShop.categories.map(cat => (
                      <button 
                         key={cat}
                         onClick={() => setCategory(cat.toLowerCase())}
                         className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition capitalize ${ 
                            category === cat.toLowerCase() 
                            ? 'bg-slate-900 text-white' 
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                         }`}
                      >
                         {cat}
                      </button>
                   ))}
                </div>
             )}
          </div>
       </div>

       {/* MAIN PRODUCT GRID */}
       <main className="flex-1 max-w-4xl mx-auto w-full p-4 pb-20">
           {products.length === 0 && !loading ? (
               <div className="text-center py-24">
                   <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="text-slate-400 w-8 h-8" />
                   </div>
                   <h3 className="text-slate-900 font-bold text-lg">No products found</h3>
                   <p className="text-slate-500 text-sm">Try adjusting your filters.</p>
                   <button 
                      onClick={() => { setSearch(''); setCategory(''); }}
                      className="mt-4 text-emerald-600 font-bold text-sm hover:underline"
                   >
                      Clear all filters
                   </button>
               </div>
           ) : (
               <>
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-6">
                     {products.map((product) => {
                         const productUrl = typeof window !== 'undefined' 
                              ? `${window.location.origin}/shop/${slug}?productId=${product.id}&ref=whatsapp` 
                              : `https://tallypadi.com/shop/${slug}?productId=${product.id}&ref=whatsapp`;

                         const whatsappText = `Hi ${initialShop.name}, I want to buy:\n\n*${product.name}*\nPrice: ${formatMoney(product.price)}\n\nLink: ${productUrl}`;
                         const encodedText = encodeURIComponent(whatsappText);
                         const whatsappLink = `https://wa.me/${initialShop.phone}?text=${encodedText}`;

                         return (
                             <a 
                                key={product.id} 
                                href={whatsappLink}
                                target="_blank"
                                rel="noreferrer"
                                className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 transition-all duration-300 flex flex-col"
                             >
                                 {/* Image */}
                                 <div className="aspect-square bg-slate-100 relative overflow-hidden">
                                      {product.image ? (
                                          <img 
                                              src={product.image}
                                              alt={product.name} 
                                              loading="lazy"
                                              className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                                          />
                                      ) : (
                                          <div className="w-full h-full flex items-center justify-center text-slate-300 font-black text-4xl uppercase select-none bg-slate-50">
                                              {product.name.slice(0, 1)}
                                          </div>
                                      )}
                                      {!product.inStock && (
                                          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center z-10">
                                              <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-full">
                                                  SOLD OUT
                                              </span>
                                          </div>
                                      )}
                                 </div>

                                 {/* Content */}
                                 <div className="p-4 flex flex-col flex-1">
                                     {product.category && (
                                       <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1 block">
                                          {product.category}
                                       </span>
                                     )}
                                     <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug mb-2 group-hover:text-emerald-700 transition-colors">
                                         {product.name}
                                     </h3>
                                     <div className="mt-auto flex items-center justify-between">
                                         <span className="font-black text-slate-900 text-base">
                                             {formatMoney(product.price)}
                                         </span>
                                         <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                            <ShoppingBag size={14} />
                                         </div>
                                     </div>
                                 </div>
                             </a>
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
                       <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
                    </div>
                 )}
               </>
           )}
       </main>

       {/* Footer */}
       <footer className="py-8 text-center text-slate-400 bg-slate-50 border-t border-slate-200">
           <a href="https://tallypadi.com" target="_blank" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-emerald-600 transition">
               <span>Storefront by</span>
               <span className="font-black text-slate-600">tallypadi</span>
               <ExternalLink size={10} />
           </a>
       </footer>
    </div>
  );
}