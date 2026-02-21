import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { CheckCircle, XCircle, ArrowRight, Zap, Shield, Smartphone } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Best ReceiptBuddy Alternative for WhatsApp Receipts | TallyPadi',
  description: 'Looking for a ReceiptBuddy alternative? TallyPadi offers superior WhatsApp receipts, barcode scanning, real-time inventory tracking, and deep team analytics.',
  alternates: {
    canonical: 'https://tallypadi.com/receiptbuddy-alternative',
  },
  openGraph: {
    title: 'The Smarter Alternative to ReceiptBuddy - TallyPadi',
    description: 'Switch to the business tool that does more than just invoices. TallyPadi gives you instant WhatsApp receipts alongside a powerful POS and stock tracker.',
    url: 'https://tallypadi.com/receiptbuddy-alternative',
    type: 'website',
  },
};

export default function ReceiptBuddyAlternativePage() {
   const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, WhatsApp',
    description: 'The best alternative to ReceiptBuddy for business management.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-emerald-500 selection:text-white">
      <Script
        id="receiptbuddy-alt-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-bold mb-8">
            <Zap size={16} /> The Smarter Choice
          </div>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6">
            The <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-300">ReceiptBuddy Alternative</span> <br />
            You've Been Waiting For.
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-light">
            Don't settle for just receipts. Get full inventory tracking, sales analytics, and automated WhatsApp messaging with TallyPadi.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Try TallyPadi Free
            </a>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">Why businesses are switching</h2>
            <div className="overflow-hidden rounded-3xl border border-slate-200 shadow-xl">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-6 text-slate-500 font-medium">Feature</th>
                            <th className="p-6 text-slate-900 font-bold bg-indigo-50/50">TallyPadi</th>
                            <th className="p-6 text-slate-400 font-medium">ReceiptBuddy</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                         <tr>
                            <td className="p-6 font-medium text-slate-700">WhatsApp Receipt Generation</td>
                            <td className="p-6 bg-indigo-50/30 text-emerald-600 font-bold"><CheckCircle size={20} className="inline mr-2"/> Yes, Instant</td>
                            <td className="p-6 text-slate-500"><CheckCircle size={20} className="inline mr-2"/> Yes</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">Real-time Stock Tracking</td>
                            <td className="p-6 bg-indigo-50/30 text-emerald-600 font-bold"><CheckCircle size={20} className="inline mr-2"/> Advanced</td>
                            <td className="p-6 text-slate-400"><XCircle size={20} className="inline mr-2"/> Limited/None</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">Profit & Loss Reports</td>
                            <td className="p-6 bg-indigo-50/30 text-emerald-600 font-bold"><CheckCircle size={20} className="inline mr-2"/> Detailed</td>
                            <td className="p-6 text-slate-400"><XCircle size={20} className="inline mr-2"/> Basic</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">Debt & Customer Management</td>
                            <td className="p-6 bg-indigo-50/30 text-emerald-600 font-bold"><CheckCircle size={20} className="inline mr-2"/> Included</td>
                            <td className="p-6 text-slate-400">Basic</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <h2 className="text-3xl font-bold text-center text-slate-900 mb-16">More than just receipts</h2>
           <div className="grid md:grid-cols-3 gap-8">
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-6"><Smartphone size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Mobile First</h3>
                   <p className="text-slate-500">Manage your entire business from your phone. No laptop required.</p>
               </div>
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-6"><Shield size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Secure & Private</h3>
                   <p className="text-slate-500">Your business data is yours. We use bank-grade security to keep your records safe.</p>
               </div>
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mb-6"><Zap size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Lightning Fast</h3>
                   <p className="text-slate-500">Generate invoices and check stock in seconds, even with poor internet connection.</p>
               </div>
           </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Upgrade your business today.</h2>
          <p className="text-xl text-slate-400 mb-8">Join thousands of business owners who moved to TallyPadi.</p>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Get Started Now <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
