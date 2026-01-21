'use client';

import React from 'react';
import { ShoppingBag, Phone, Loader2, PackageX, ExternalLink, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type Product = {
  _id: string;
  name: string;
  quantity: number;
  lastUnitPrice: number;
  image?: string;
};

type ShopData = {
  shop: {
    name: string;
    phone: string;
    planExpired?: boolean;
  };
  products: Product[];
};

interface ShopClientProps {
  data: ShopData | null;
  slug: string;
  error?: string;
}

export default function ShopClient({ data, slug, error }: ShopClientProps) {

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getImageUrl = (path?: string) => {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    const baseUrl = API_URL.replace(///api\/?$/, '');
    return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  if (error || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-4">
            <PackageX className="w-12 h-12 text-slate-300 mx-auto" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">{error || 'Shop unavailable'}</h1>
        <p className="text-slate-500 text-sm mb-6">The shop you are looking for does not exist or is currently closed.</p>
        <a href="/" className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-black transition">
            Go to Tallypadi
        </a>
      </div>
    );
  }

  const { shop, products } = data;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
       {/* Expired Plan Banner */}
       {shop.planExpired && (
         <div className="bg-amber-100 border-b border-amber-200 px-4 py-3">
           <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
             <div className="flex items-center gap-2 text-amber-800">
               <AlertTriangle size={18} />
               <span className="text-sm font-semibold">This shop's plan has expired.</span>
             </div>
             <a 
               href="https://tallypadi.com/login" 
               className="text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition whitespace-nowrap"
             >
               Renew Plan
             </a>
           </div>
         </div>
       )}

       {/* Banner / Header */}
       <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700">
                      <ShoppingBag size={20} />
                  </div>
                  <div>
                      <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">
                          {shop.name}
                      </h1>
                      <p className="text-xs font-semibold text-emerald-600">Verified Shop</p>
                  </div>
              </div>
              
              {shop.phone && (
                  <a href={`https://wa.me/${shop.phone}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200">
                      <Phone size={14} />
                      <span className="hidden sm:inline">WhatsApp</span>
                  </a>
              )}
          </div>
       </header>

       {/* Product Grid */}
       <main className="flex-1 max-w-3xl mx-auto w-full p-4">
           {products.length === 0 ? (
               <div className="text-center py-20">
                   <p className="text-slate-400 font-semibold">No products available.</p>
               </div>
           ) : (
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
                   {products.map((product) => {
                       const productUrl = typeof window !== 'undefined' 
                            ? `${window.location.origin}/shop/${slug}?productId=${product._id}&ref=whatsapp` 
                            : `https://tallypadi.com/shop/${slug}?productId=${product._id}&ref=whatsapp`;

                       const whatsappText = `Hi ${shop.name}, can I get more details of this product?\n\nProduct: ${product.name}.\nLink: ${productUrl}`;
                       const encodedText = encodeURIComponent(whatsappText);
                       const whatsappLink = `https://wa.me/${shop.phone}?text=${encodedText}`;

                       return (
                           <div key={product._id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                               {/* Image */}
                               <div className="aspect-square bg-slate-100 relative">
                                    {product.image ? (
                                        <img 
                                            src={getImageUrl(product.image)}
                                            alt={product.name} 
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300 font-black text-4xl uppercase select-none">
                                            {product.name.slice(0, 1)}
                                        </div>
                                    )}
                                    {product.quantity <= 0 && (
                                        <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                                            <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-full">
                                                OUT OF STOCK
                                            </span>
                                        </div>
                                    )}
                               </div>

                               {/* Content */}
                               <div className="p-3 flex flex-col flex-1">
                                   <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-tight mb-1">
                                       {product.name}
                                   </h3>
                                   <div className="mt-auto pt-2 flex items-center justify-between">
                                       <span className="font-black text-slate-900">
                                           {formatMoney(product.lastUnitPrice)}
                                       </span>
                                   </div>
                                   
                                   <a 
                                     href={whatsappLink}
                                     target="_blank"
                                     rel="noreferrer"
                                     className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition"
                                   >
                                       <ShoppingBag size={14} />
                                       Buy Now
                                   </a>
                               </div>
                           </div>
                       );
                   })}
               </div>
           )}
       </main>

       {/* Footer */}
       <footer className="py-8 text-center text-slate-400">
           <a href="https://tallypadi.com" target="_blank" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:text-emerald-600 transition">
               <span>Powered by</span>
               <span className="font-black text-slate-600">tallypadi</span>
               <ExternalLink size={10} />
           </a>
       </footer>
    </div>
  );
}
