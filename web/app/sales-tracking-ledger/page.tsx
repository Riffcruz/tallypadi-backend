import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { BarChart3, PieChart, TrendingUp, ArrowRight, CheckCircle2 } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Sales Tracking Software & Business Ledger | TallyPadi',
  description: 'The easiest sales tracking software for businesses. Replace your paper ledger with a digital tool on WhatsApp. Track daily sales and profit.',
  alternates: {
    canonical: 'https://tallypadi.com/sales-tracking-ledger',
  },
  openGraph: {
    title: 'Sales Tracking Software & Business Ledger',
    description: 'Track your daily sales, expenses, and profit automatically. No more manual calculations. Works directly on WhatsApp.',
    url: 'https://tallypadi.com/sales-tracking-ledger',
    type: 'website',
  },
};

export default function SalesTrackingPage() {
   const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi Sales Tracker',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, WhatsApp',
    description: 'Automated sales tracking and digital ledger for businesses. Track profit and cash flow.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-emerald-500 selection:text-white">
      <Script
        id="sales-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-bold mb-8">
            <BarChart3 size={16} /> Automated Business Ledger
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Know Your Numbers. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
              Grow Your Profit.
            </span>
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-light">
            Replace your paper notebook. Record sales and expenses on WhatsApp, and let TallyPadi calculate your daily profit automatically.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Start Tracking Free
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
             <div className="order-2 lg:order-1 bg-slate-100 p-8 rounded-3xl border border-slate-200">
                {/* Mockup of a chart or list */}
                <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-slate-900">Daily Summary</h4>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Today</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-lg">
                            <p className="text-xs text-slate-500 uppercase">Total Sales</p>
                            <p className="text-xl font-bold text-slate-900">₦154,000</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg">
                            <p className="text-xs text-slate-500 uppercase">Profit</p>
                            <p className="text-xl font-bold text-emerald-600">+₦32,500</p>
                        </div>
                    </div>
                </div>
                 <div className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600"><TrendingUp size={16} /></div>
                        <div>
                            <p className="font-bold text-slate-800 text-sm">Sold 3 cartons of Indomie</p>
                            <p className="text-xs text-slate-400">10:42 AM</p>
                        </div>
                        <div className="ml-auto font-bold text-slate-900">₦28,500</div>
                    </div>
                     <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600"><TrendingUp size={16} /></div>
                        <div>
                            <p className="font-bold text-slate-800 text-sm">Sold 1 Perfume Oil</p>
                            <p className="text-xs text-slate-400">09:15 AM</p>
                        </div>
                        <div className="ml-auto font-bold text-slate-900">₦5,000</div>
                    </div>
                 </div>
             </div>
             <div className="order-1 lg:order-2">
                 <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">Your business ledger, reimagined.</h2>
                 <p className="text-lg text-slate-500 mb-8">
                     Tracking sales shouldn't be a chore. With TallyPadi, you just chat. We handle the math, the organization, and the reports.
                 </p>
                 <ul className="space-y-4">
                     {[
                         "Instant daily profit calculation",
                         "Track cash vs. transfer payments",
                         "Monitor staff sales performance",
                         "Export reports to Excel anytime"
                     ].map((item, i) => (
                         <li key={i} className="flex items-center gap-3">
                             <CheckCircle2 className="text-blue-500 shrink-0" size={20} />
                             <span className="text-slate-700 font-medium">{item}</span>
                         </li>
                     ))}
                 </ul>
             </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">Common Questions</h2>
          <div className="space-y-8">
            {[
              { q: "Can I track expenses too?", a: "Yes. You can record expenses (like 'Spent 2k on fuel') and TallyPadi will deduct it from your daily profit automatically." },
              { q: "Is my data private?", a: "Absolutely. Your sales data is encrypted and only accessible to you. We do not share your business data." },
              { q: "Can I use multiple currencies?", a: "Yes. TallyPadi supports multiple currencies including NGN, USD, GHS, KES, and more." },
              { q: "What if I lose my phone?", a: "Your data is safe in the cloud. Just log in on a new device or WhatsApp account, and your records will be there." }
            ].map((faq, i) => (
              <div key={i} className="border-b border-slate-200 pb-6">
                <h4 className="font-bold text-slate-900 text-lg mb-2">{faq.q}</h4>
                <p className="text-slate-500">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-blue-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Master your cash flow.</h2>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-900 hover:bg-slate-100 font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Start Tracking Now <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
