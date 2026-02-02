import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Store, Share2, Globe, ArrowRight, ShoppingBag } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Product Catalog & Online Shop Link Generator | TallyPadi',
  description: 'Create a free online product catalog for your business. Generate a shop link to share on WhatsApp, Instagram, and Facebook.',
  alternates: {
    canonical: 'https://tallypadi.com/product-catalog-shop-link-generator',
  },
  openGraph: {
    title: 'Product Catalog & Online Shop Link Generator',
    description: 'Turn your inventory into an online store instantly. Share your shop link and let customers browse your products online.',
    url: 'https://tallypadi.com/product-catalog-shop-link-generator',
    type: 'website',
  },
};

export default function CatalogPage() {
   const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi Shop Generator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, WhatsApp',
    description: 'Instant online product catalog and shop link generator.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-emerald-500 selection:text-white">
      <Script
        id="catalog-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-950 text-white">
         <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/40 via-slate-950 to-slate-950 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-bold mb-8">
            <Store size={16} /> Instant Online Store
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Get Your Own <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300">
              Online Shop Link.
            </span>
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-light">
            Turn your inventory list into a beautiful online catalog in one click. Share your link on WhatsApp, Instagram, or TikTok and let customers browse your products.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Create My Shop Link
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold text-slate-900">Your store, online in seconds.</h2>
            </div>
           <div className="grid md:grid-cols-3 gap-12">
               <div className="text-center p-6">
                   <div className="w-20 h-20 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-6"><ShoppingBag size={32} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-2">1. Add Products</h3>
                   <p className="text-slate-500">Add your items to TallyPadi via WhatsApp. Photos, prices, and descriptions are synced automatically.</p>
               </div>
               <div className="text-center p-6">
                   <div className="w-20 h-20 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center mx-auto mb-6"><Globe size={32} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-2">2. Get Your Link</h3>
                   <p className="text-slate-500">Your unique shop link (e.g., tallypadi.com/shop/yourname) is generated instantly.</p>
               </div>
               <div className="text-center p-6">
                   <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6"><Share2 size={32} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-2">3. Share & Sell</h3>
                   <p className="text-slate-500">Post the link on your status or bio. Customers can view your catalog without asking "How much?".</p>
               </div>
           </div>
        </div>
      </section>

      {/* Preview Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-200">
                <div className="grid lg:grid-cols-2">
                    <div className="p-12 lg:p-20 flex flex-col justify-center">
                        <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">Professional Look. Zero Design Skills Needed.</h2>
                        <p className="text-lg text-slate-500 mb-8">
                            Your shop page comes with search, categories, and item details built-in. It's mobile-optimized and loads fast.
                        </p>
                        <ul className="space-y-4">
                            <li className="flex items-center gap-3 font-medium text-slate-700"><div className="w-2 h-2 rounded-full bg-purple-500" /> Automatic updates when stock changes</li>
                            <li className="flex items-center gap-3 font-medium text-slate-700"><div className="w-2 h-2 rounded-full bg-purple-500" /> Customers can browse but not edit</li>
                            <li className="flex items-center gap-3 font-medium text-slate-700"><div className="w-2 h-2 rounded-full bg-purple-500" /> Works on any phone or browser</li>
                        </ul>
                    </div>
                    <div className="bg-purple-50 min-h-[400px] relative">
                         {/* Abstract representation of shop */}
                         <div className="absolute inset-0 flex items-center justify-center">
                             <div className="w-64 bg-white rounded-xl shadow-xl p-4 transform rotate-3 transition hover:rotate-0 duration-500">
                                 <div className="h-32 bg-slate-200 rounded-lg mb-4 animate-pulse"></div>
                                 <div className="h-4 w-3/4 bg-slate-200 rounded mb-2"></div>
                                 <div className="h-4 w-1/2 bg-slate-200 rounded"></div>
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>
      </section>


      {/* CTA */}
      <section className="py-20 bg-purple-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Launch your online store today.</h2>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-purple-900 hover:bg-slate-100 font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Get My Shop Link <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
