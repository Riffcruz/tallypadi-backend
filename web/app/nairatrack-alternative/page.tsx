import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { CheckCircle, XCircle, ArrowRight, TrendingUp, Clock, Users } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Best NairaTrack Alternative for Nigerian SMEs | TallyPadi',
  description: 'TallyPadi is a NairaTrack alternative for Nigerian and African SMEs. Track sales, manage inventory, send receipts, manage debtors, and run business reports on WhatsApp.',
  keywords: [
    'NairaTrack alternative',
    'NairaTrack alternative Nigeria',
    'business management software Nigeria',
    'sales tracking app Africa',
    'WhatsApp POS Nigeria',
    'send ads to facebook',
    'best business management software',
    'business management software for small business',
    'inventory and receipt software',
    'manage inventory and stock',
    'record sales and track cash flow',
    'publish products to a public shop link',
    'publish products to TallyPadi Marketplace',
    'run business reports on WhatsApp',
    'manage staff access control',
    'inventory and POS app for small business',
    'best NairaTrack alternative',
    'NairaTrack alternative Africa',
    'business management software Ghana',
    'business management software Kenya',
    'business management software South Africa',
    'business management software Uganda',
    'business management software Tanzania',
    'manage expenses and income',
    'send receipts via whatsapp',
  ],
  alternates: {
    canonical: 'https://tallypadi.com/nairatrack-alternative',
  },
  openGraph: {
    title: 'Switch from NairaTrack to TallyPadi Today',
    description: 'Use WhatsApp sales tracking, receipts, inventory management, debtors, and business reports in one TallyPadi account.',
    url: 'https://tallypadi.com/nairatrack-alternative',
    type: 'website',
  },
};

export default function NairaTrackAlternativePage() {
   const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, WhatsApp',
    description: 'An alternative to NairaTrack for inventory, sales tracking, receipts, debtors, and business management.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NGN',
    },
  };

  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-green-500 selection:text-white">
      <Script
        id="nairatrack-alt-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-emerald-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-green-800/30 via-emerald-950 to-emerald-950 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-300 text-sm font-bold mb-8">
            <TrendingUp size={16} /> Grow Faster
          </div>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6">
            The Ultimate <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">NairaTrack Alternative</span>
          </h1>
          <p className="text-xl text-emerald-100/80 mb-10 max-w-2xl mx-auto font-light">
            Simplify your retail operations. TallyPadi combines expense tracking, multi-branch inventory management, and customer messaging into one powerful WhatsApp tool.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Start Using TallyPadi
            </a>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">Head-to-Head Comparison</h2>
            <div className="overflow-hidden rounded-3xl border border-slate-200 shadow-xl">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-6 text-slate-500 font-medium">Feature</th>
                            <th className="p-6 text-slate-900 font-bold bg-green-50/50">TallyPadi</th>
                            <th className="p-6 text-slate-400 font-medium">NairaTrack</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                         <tr>
                            <td className="p-6 font-medium text-slate-700">Platform</td>
                            <td className="p-6 bg-green-50/30 text-green-700 font-bold">WhatsApp & Web</td>
                            <td className="p-6 text-slate-500">App Based</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">Ease of Receipt Sharing</td>
                            <td className="p-6 bg-green-50/30 text-green-700 font-bold"><CheckCircle size={20} className="inline mr-2"/> Instant via WhatsApp</td>
                            <td className="p-6 text-slate-500">Manual Share</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">Inventory Sync</td>
                            <td className="p-6 bg-green-50/30 text-green-700 font-bold"><CheckCircle size={20} className="inline mr-2"/> Real-time</td>
                            <td className="p-6 text-slate-400">Standard</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">Staff Access Control</td>
                            <td className="p-6 bg-green-50/30 text-green-700 font-bold"><CheckCircle size={20} className="inline mr-2"/> Granular Permissions</td>
                            <td className="p-6 text-slate-400">Basic</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <h2 className="text-3xl font-bold text-center text-slate-900 mb-16">Why TallyPadi wins</h2>
           <div className="grid md:grid-cols-3 gap-8">
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mb-6"><Users size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Customer Relationship</h3>
                   <p className="text-slate-500">Since it works on WhatsApp, you're already where your customers are. Chat and sell in the same place.</p>
               </div>
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-6"><Clock size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Save Time</h3>
                   <p className="text-slate-500">Faster data entry means more time to focus on growing your business, not recording it.</p>
               </div>
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-6"><TrendingUp size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Better Insights</h3>
                   <p className="text-slate-500">Our dashboard gives you a clearer picture of your daily profit, top products, and debtors.</p>
               </div>
           </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-emerald-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Make the switch today.</h2>
          <p className="text-xl text-emerald-100/70 mb-8">It's time for a better way to track your naira.</p>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-green-500 hover:bg-green-400 text-emerald-950 font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Get Started Free <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
