import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';
import InvoiceGeneratorClient from './InvoiceGeneratorClient';

export const metadata: Metadata = {
  title: 'Free Invoice Generator & Receipt Maker | TallyPadi',
  description: 'Create professional invoices and receipts for free. No login required. Customize your template, add your logo, and download PDF instantly.',
  alternates: {
    canonical: 'https://tallypadi.com/free-invoice-generator',
  },
  openGraph: {
    title: 'Free Invoice Generator & Receipt Maker',
    description: 'Create professional invoices and receipts for free. No login required. Customize your template, add your logo, and download PDF instantly.',
    url: 'https://tallypadi.com/free-invoice-generator',
    type: 'website',
  },
};

export default function FreeInvoiceGeneratorPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi Free Invoice Generator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'Create professional invoices and receipts for free. No login required. Download PDF instantly.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div className="bg-slate-50 min-h-screen font-sans selection:bg-emerald-500 selection:text-white flex flex-col">
      <Script
        id="invoice-generator-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />
      
      <main className="flex-grow pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4">
            Free Invoice Generator
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Create beautiful, professional invoices in seconds. <br/>
            <span className="text-emerald-600 font-medium">No login required. 100% Free.</span>
          </p>
        </div>

        <InvoiceGeneratorClient />

        {/* SEO Content */}
        <div className="mt-24 grid md:grid-cols-3 gap-8 text-left">
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Professional Templates</h3>
                <p className="text-slate-500">Generate polished invoices that make your business look good. Add your logo and brand colors.</p>
             </div>
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Instant PDF Download</h3>
                <p className="text-slate-500">Download your invoice as a PDF file instantly. Send it to your clients via WhatsApp or Email.</p>
             </div>
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Secure & Private</h3>
                <p className="text-slate-500">We don't store your invoice data. Everything is generated in your browser for maximum privacy.</p>
             </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
