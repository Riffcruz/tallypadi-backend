import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { CheckCircle, XCircle, ArrowRight, Cloud, Smartphone, Globe } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'TallyPrime Alternative for WhatsApp & Mobile | TallyPadi',
  description: 'Looking for a simpler TallyPrime alternative? TallyPadi is the mobile-first accounting, POS, and inventory solution built for modern business owners.',
  alternates: {
    canonical: 'https://tallypadi.com/tallyprime-whatsapp-alternative',
  },
  openGraph: {
    title: 'TallyPrime vs TallyPadi - The Simple Mobile Alternative',
    description: 'Move your business accounting to the cloud. TallyPadi offers the power of stock management and invoicing directly on your smartphone via WhatsApp.',
    url: 'https://tallypadi.com/tallyprime-whatsapp-alternative',
    type: 'website',
  },
};

export default function TallyPrimeAlternativePage() {
   const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, WhatsApp',
    description: 'A modern, mobile-friendly alternative to TallyPrime.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-blue-500 selection:text-white">
      <Script
        id="tallyprime-alt-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/30 via-slate-900 to-slate-900 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-bold mb-8">
            <Cloud size={16} /> Cloud Native
          </div>
          <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6">
            The <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">TallyPrime WhatsApp</span> <br />
            Alternative.
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-light">
            Leave the complex desktop software behind. Manage your inventory, PDF invoices, and daily accounting directly from WhatsApp and our simple Web POS.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Try for Free
            </a>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">Modern vs Legacy</h2>
            <div className="overflow-hidden rounded-3xl border border-slate-200 shadow-xl">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-6 text-slate-500 font-medium">Feature</th>
                            <th className="p-6 text-slate-900 font-bold bg-blue-50/50">TallyPadi</th>
                            <th className="p-6 text-slate-400 font-medium">TallyPrime</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                         <tr>
                            <td className="p-6 font-medium text-slate-700">Mobile Access</td>
                            <td className="p-6 bg-blue-50/30 text-blue-700 font-bold"><CheckCircle size={20} className="inline mr-2"/> Native Mobile & WhatsApp</td>
                            <td className="p-6 text-slate-500">Limited / Desktop Focus</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">Setup Time</td>
                            <td className="p-6 bg-blue-50/30 text-blue-700 font-bold"><CheckCircle size={20} className="inline mr-2"/> Instant (Cloud)</td>
                            <td className="p-6 text-slate-400">Installation Required</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">WhatsApp Invoicing</td>
                            <td className="p-6 bg-blue-50/30 text-blue-700 font-bold"><CheckCircle size={20} className="inline mr-2"/> Built-in</td>
                            <td className="p-6 text-slate-400">Requires Add-ons</td>
                        </tr>
                        <tr>
                            <td className="p-6 font-medium text-slate-700">User Interface</td>
                            <td className="p-6 bg-blue-50/30 text-blue-700 font-bold">Simple & Modern</td>
                            <td className="p-6 text-slate-400">Complex / Technical</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <h2 className="text-3xl font-bold text-center text-slate-900 mb-16">Why switch to Cloud?</h2>
           <div className="grid md:grid-cols-3 gap-8">
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-6"><Globe size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Access Anywhere</h3>
                   <p className="text-slate-500">Check your business health from home, on the road, or on vacation. All you need is internet.</p>
               </div>
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-xl flex items-center justify-center mb-6"><Smartphone size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">No Hardware Costs</h3>
                   <p className="text-slate-500">Forget expensive servers or dedicated PCs. TallyPadi runs on the devices you already own.</p>
               </div>
               <div className="bg-white p-8 rounded-3xl shadow-sm hover:shadow-md transition">
                   <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-6"><CheckCircle size={24} /></div>
                   <h3 className="text-xl font-bold text-slate-900 mb-3">Easy to Use</h3>
                   <p className="text-slate-500">You don't need an accounting degree to use TallyPadi. It's designed for business owners, not just accountants.</p>
               </div>
           </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-blue-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Modernize your business.</h2>
          <p className="text-xl text-blue-200 mb-8">Join the cloud revolution with TallyPadi.</p>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-900 font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Start for Free <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
