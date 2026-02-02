import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Users, Clock, ArrowRight, DollarSign, MessageCircle } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Debtors Tracking & Accounts Receivable Software | TallyPadi',
  description: 'Track who owes you money. Simple accounts receivable manager on WhatsApp. Record debts, payments, and credit history.',
  alternates: {
    canonical: 'https://tallypadi.com/accounts-receivable-debtors-tracking',
  },
  openGraph: {
    title: 'Debtors Tracking & Accounts Receivable Software',
    description: 'Never forget a debt again. Track customer credits and payments easily on WhatsApp. The best debt manager for small business.',
    url: 'https://tallypadi.com/accounts-receivable-debtors-tracking',
    type: 'website',
  },
};

export default function DebtorsPage() {
   const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi Debt Tracker',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, WhatsApp',
    description: 'Track debtors and manage customer credit.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-emerald-500 selection:text-white">
      <Script
        id="debtors-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-950 text-white">
         <div className="absolute inset-0 bg-gradient-to-br from-red-900/40 via-slate-950 to-slate-950 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-bold mb-8">
            <Users size={16} /> Credit & Debt Management
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Recover Your Money <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-300">
              Faster & Easier.
            </span>
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-light">
            Stop losing money to forgotten debts. Track exactly who owes you, how much, and for how long—directly on WhatsApp.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Start Tracking Debts
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="grid md:grid-cols-2 gap-12 items-center">
               <div>
                   <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">A complete history of every customer.</h2>
                   <p className="text-lg text-slate-500 mb-8">
                       No more arguments about whether a payment was made. TallyPadi keeps a permanent record of every credit sale and deposit.
                   </p>
                   <div className="space-y-6">
                       <div className="flex gap-4">
                           <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0"><DollarSign size={24} /></div>
                           <div>
                               <h4 className="font-bold text-slate-900 text-lg">Record Credit Sales</h4>
                               <p className="text-slate-500">Just say "Sold 5 rice to Musa on credit". TallyPadi creates a debtor profile instantly.</p>
                           </div>
                       </div>
                       <div className="flex gap-4">
                           <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0"><Clock size={24} /></div>
                           <div>
                               <h4 className="font-bold text-slate-900 text-lg">Track Partial Payments</h4>
                               <p className="text-slate-500">Record installments easily. TallyPadi calculates the remaining balance automatically.</p>
                           </div>
                       </div>
                   </div>
               </div>
               <div className="bg-slate-50 border border-slate-100 p-8 rounded-3xl">
                   <h3 className="font-bold text-slate-900 mb-6 text-xl">Customer: Musa</h3>
                   <div className="space-y-4">
                       <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                           <div>
                               <p className="font-bold text-slate-800">Bought Rice (Credit)</p>
                               <p className="text-xs text-slate-400">Jan 12, 10:00 AM</p>
                           </div>
                           <span className="text-red-500 font-bold">-₦40,000</span>
                       </div>
                       <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                           <div>
                               <p className="font-bold text-slate-800">Paid Cash</p>
                               <p className="text-xs text-slate-400">Jan 20, 2:00 PM</p>
                           </div>
                           <span className="text-green-500 font-bold">+₦15,000</span>
                       </div>
                       <div className="border-t pt-4 flex justify-between items-center">
                           <p className="font-bold text-slate-500">Balance Due</p>
                           <span className="text-2xl font-extrabold text-red-600">₦25,000</span>
                       </div>
                   </div>
               </div>
           </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-red-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Stop bad debts today.</h2>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-red-900 hover:bg-slate-100 font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Start Tracking Debts <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
