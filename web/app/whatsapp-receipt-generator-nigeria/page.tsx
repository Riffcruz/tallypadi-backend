import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { CheckCircle, FileText, Send, Smartphone, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Free WhatsApp Receipt Generator Nigeria | TallyPadi',
  description: 'Generate professional receipts on WhatsApp for free in Nigeria. Send PDF receipts instantly and connect receipts with sales, inventory, and business management.',
  keywords: [
    'free WhatsApp receipt generator Nigeria',
    'receipt generator Nigeria',
    'PDF receipt maker Nigeria',
    'WhatsApp POS Nigeria',
    'business management software Nigeria',
    'small business receipts Nigeria',
  ],
  alternates: {
    canonical: 'https://tallypadi.com/whatsapp-receipt-generator-nigeria',
  },
  openGraph: {
    title: 'Free WhatsApp Receipt Generator for Nigeria',
    description: 'Create and send professional receipts directly on WhatsApp. Built for Nigerian business owners.',
    url: 'https://tallypadi.com/whatsapp-receipt-generator-nigeria',
    type: 'website',
  },
};

export default function WhatsAppReceiptGeneratorPage() {
   const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'TallyPadi Receipt Generator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, WhatsApp',
    description: 'Free tool to generate professional receipts via WhatsApp for Nigerian businesses.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NGN',
    },
  };

  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-green-500 selection:text-white">
      <Script
        id="receipt-gen-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-900 text-white">
         <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-green-900/40 via-slate-900 to-slate-900 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 text-green-300 text-sm font-bold mb-8">
            <FileText size={16} /> #1 Receipt Generator in Nigeria
          </div>
          <h1 className="text-4xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Generate Professional <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
              Receipts on WhatsApp
            </span>
          </h1>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto font-light">
            Stop writing receipts by hand. Create beautiful, professional PDF receipts instantly and send them to your customers on WhatsApp.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Generate Receipt Now
            </a>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
             <div className="text-center mb-16">
                <h2 className="text-3xl font-bold text-slate-900">How to generate a receipt</h2>
                <p className="text-slate-500 mt-4 text-lg">It takes less than 10 seconds.</p>
             </div>

             <div className="grid md:grid-cols-3 gap-12 text-center">
                 <div className="relative p-6">
                     <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">1</div>
                     <h3 className="text-xl font-bold text-slate-900 mb-3">Chat with TallyPadi</h3>
                     <p className="text-slate-500">Open WhatsApp and say "Hello" to our automated bot.</p>
                 </div>
                 <div className="relative p-6">
                     <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">2</div>
                     <h3 className="text-xl font-bold text-slate-900 mb-3">Enter Details</h3>
                     <p className="text-slate-500">Type the items sold and the price. That's it.</p>
                 </div>
                 <div className="relative p-6">
                     <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">3</div>
                     <h3 className="text-xl font-bold text-slate-900 mb-3">Get Receipt</h3>
                     <p className="text-slate-500">Instant PDF receipt is generated for you to share.</p>
                 </div>
             </div>
        </div>
      </section>

      {/* Features List */}
      <section className="py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-slate-100">
                  <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">Why use this generator?</h2>
                  <div className="grid md:grid-cols-2 gap-6">
                      <div className="flex gap-4">
                          <CheckCircle className="text-green-500 shrink-0" />
                          <div>
                              <h4 className="font-bold text-slate-900">100% Free</h4>
                              <p className="text-slate-500 text-sm">No hidden charges for basic receipt generation.</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <Zap className="text-green-500 shrink-0" />
                          <div>
                              <h4 className="font-bold text-slate-900">Instant Delivery</h4>
                              <p className="text-slate-500 text-sm">No waiting. Receipts are ready in seconds.</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <ShieldCheck className="text-green-500 shrink-0" />
                          <div>
                              <h4 className="font-bold text-slate-900">Professional Look</h4>
                              <p className="text-slate-500 text-sm">Clean, branded receipts that make you look professional.</p>
                          </div>
                      </div>
                      <div className="flex gap-4">
                          <Smartphone className="text-green-500 shrink-0" />
                          <div>
                              <h4 className="font-bold text-slate-900">No App Needed</h4>
                              <p className="text-slate-500 text-sm">Works directly inside WhatsApp. Save space on your phone.</p>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </section>

      {/* FAQ / SEO Content */}
      <section className="py-24 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-3xl font-bold text-slate-900 mb-8">Frequently Asked Questions</h2>
              <div className="space-y-8">
                  <div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">Is this receipt generator really free?</h3>
                      <p className="text-slate-500">Yes! You can generate standard receipts for free. We also offer premium features for businesses that need inventory tracking and detailed analytics.</p>
                  </div>
                  <div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">Can I add my logo?</h3>
                      <p className="text-slate-500">Absolutely. You can customize your business profile with your logo, address, and contact details, which will appear on every receipt.</p>
                  </div>
                  <div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">Does it work in Nigeria?</h3>
                      <p className="text-slate-500">Yes, TallyPadi is proudly built for Nigerian businesses, supporting Naira currency and local business needs.</p>
                  </div>
              </div>
          </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-green-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Start sending professional receipts.</h2>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-green-900 font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Create Receipt <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
