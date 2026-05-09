import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, TrendingUp } from 'lucide-react';

export default function MarketingFooter() {
  return (
    <footer className="relative bg-slate-950 text-slate-300 py-16 overflow-hidden">
      {/* Background Image & Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/photo-1451187580459-43490279c0fa.avif"
          alt="Footer Background"
          fill
          className="object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/90" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand Column */}
          <div className="space-y-4">
            <div className="cursor-pointer group inline-block">
              <a href="/" className="relative block w-[160px] h-[40px] transition-transform duration-300 group-hover:scale-105">
                <Image
                  src="/tallypadi-logo.png"
                  alt="TallyPadi logo"
                  fill
                  className="object-contain"
                />
              </a>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              Empowering global businesses with AI-driven inventory and sales management tools. Built for growth, designed for simplicity.
            </p>
            <div className="flex gap-4 pt-2">
              {/* Social Placeholders */}
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-slate-800/50 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all cursor-pointer border border-white/5">
                   <span className="w-2 h-2 bg-current rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Features (SEO Links) */}
          <div>
            <h4 className="text-white font-bold mb-6 text-lg">Solutions</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="/whatsapp-receipt-generator" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Receipt Generator</a></li>
              <li><a href="/sales-tracking-ledger" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Sales Tracking</a></li>
              <li><a href="/inventory-stock-management" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Inventory Management</a></li>
              <li><a href="/product-catalog-shop-link-generator" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Online Catalog</a></li>
              <li><a href="/accounts-receivable-debtors-tracking" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Debtor Tracking</a></li>
            </ul>
          </div>

          {/* Growth & Platform */}
          <div>
            <h4 className="text-white font-bold mb-6 text-lg">Growth</h4>
            <ul className="space-y-3 text-sm">
               <li>
                   <a href="/best-way-to-grow-business" className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors flex items-center gap-2">
                       <TrendingUp size={14} /> Scale in 2026
                   </a>
               </li>
               <li><Link href="/marketplace" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Marketplace</Link></li>
               <li><a href="/#pricing" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Pricing</a></li>
               <li><a href="/login" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Login</a></li>
               <li><a href="/help" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Help Center</a></li>
               <li><a href="/policy" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><ArrowRight size={12} className="opacity-0 hover:opacity-100 transition-opacity" />Privacy Policy</a></li>
            </ul>
          </div>

          {/* Newsletter / CTA */}
          <div className="bg-slate-800/30 backdrop-blur-sm p-6 rounded-2xl border border-white/5">
            <h4 className="text-white font-bold mb-2 text-lg">Stay Updated</h4>
            <p className="text-xs text-slate-400 mb-4">Get the latest business tips and feature updates.</p>
            <div className="flex gap-2">
              <input 
                type="email" 
                placeholder="Enter email" 
                className="bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg px-3 py-2 transition-colors">
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800/50 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>&copy; {new Date().getFullYear()} Tallypadi. All rights reserved.</p>
          <div className="flex gap-6">
            <span>Built For Growing Businesses</span>
            <span className="w-px h-4 bg-slate-800" />
            <span>Global</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
