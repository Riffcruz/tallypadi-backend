import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Package, Bell, ArrowRight, Layers, BarChart } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Inventory Management System & Stock Tracking | TallyPadi',
  description: 'Simple inventory management software for retail and wholesale. Track stock levels, get low stock alerts, and manage inventory on WhatsApp.',
  alternates: {
    canonical: 'https://tallypadi.com/inventory-stock-management',
  },
  openGraph: {
    title: 'Inventory Management System & Stock Tracking',
    description: 'Never run out of stock again. Track inventory, receive low stock alerts, and manage multiple products directly from WhatsApp.',
    url: 'https://tallypadi.com/inventory-stock-management',
    type: 'website',
  },
};

export default function InventoryPage() {
   const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi Inventory Manager',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, WhatsApp',
    description: 'Inventory management and stock tracking system for businesses.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  
  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-emerald-500 selection:text-white">
      <Script
        id="inventory-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-950 text-white">
         <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-orange-900/20 via-slate-950 to-slate-950 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 text-sm font-bold mb-8">
            <Package size={16} /> Smart Stock Management
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Never Run Out of <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">
              Best Sellers Again.
            </span>
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-light">
            Track your inventory in real-time. TallyPadi alerts you when stock is low, so you can restock on time and keep selling.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Organize My Stock
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="grid md:grid-cols-3 gap-8">
               <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 hover:shadow-lg transition">
                   <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-6"><Bell size={28} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Low Stock Alerts</h3>
                   <p className="text-slate-500">Set a minimum quantity for each item. When sales drop stock below that level, you get an instant WhatsApp alert.</p>
               </div>
               <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 hover:shadow-lg transition">
                   <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6"><Layers size={28} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Auto-Deduction</h3>
                   <p className="text-slate-500">No manual subtractions. When you record a sale, stock is removed instantly. Your count is always 100% accurate.</p>
               </div>
               <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 hover:shadow-lg transition">
                   <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6"><BarChart size={28} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Stock Value Reports</h3>
                   <p className="text-slate-500">Know exactly how much cash is tied up in your shop. See the total cost price and selling price value of your inventory.</p>
               </div>
           </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-3xl md:text-5xl font-bold text-slate-900 text-center mb-16">Built for your business size</h2>
              <div className="grid md:grid-cols-2 gap-12">
                  <div className="flex gap-6">
                      <div className="shrink-0 w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">1</div>
                      <div>
                          <h3 className="text-xl font-bold text-slate-900 mb-2">Small Retailers</h3>
                          <p className="text-slate-500 leading-relaxed">Stop guessing what's on your shelf. Use TallyPadi to know exactly what you have, even when you aren't at the shop.</p>
                      </div>
                  </div>
                  <div className="flex gap-6">
                      <div className="shrink-0 w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">2</div>
                      <div>
                          <h3 className="text-xl font-bold text-slate-900 mb-2">Wholesalers & Distributors</h3>
                          <p className="text-slate-500 leading-relaxed">Manage high-volume stock movement. Track cartons, dozens, and pieces with ease.</p>
                      </div>
                  </div>
                   <div className="flex gap-6">
                      <div className="shrink-0 w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">3</div>
                      <div>
                          <h3 className="text-xl font-bold text-slate-900 mb-2">Multi-Branch Operations</h3>
                          <p className="text-slate-500 leading-relaxed">Have multiple shops? Create separate accounts or manage them together to see total company stock.</p>
                      </div>
                  </div>
                   <div className="flex gap-6">
                      <div className="shrink-0 w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold">4</div>
                      <div>
                          <h3 className="text-xl font-bold text-slate-900 mb-2">Online Vendors</h3>
                          <p className="text-slate-500 leading-relaxed">Sync your physical stock with your online sales. Avoid selling items you don't have.</p>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Take control of your inventory.</h2>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Start for Free <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
