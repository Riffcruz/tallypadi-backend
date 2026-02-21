import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { FileText, CheckCircle2, Zap, Smartphone, ArrowRight, ShieldCheck } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'WhatsApp Receipt Generator & Invoice Maker | TallyPadi',
  description: 'Generate professional, branded receipts and invoices directly on WhatsApp. Send instant PDF receipts to customers immediately after a sale.',
  alternates: {
    canonical: 'https://tallypadi.com/whatsapp-receipt-generator',
  },
  openGraph: {
    title: 'WhatsApp Receipt Generator & POS System',
    description: 'Generate professional receipts on WhatsApp. Track your sales and impress your customers with instant digital invoices.',
    url: 'https://tallypadi.com/whatsapp-receipt-generator',
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
    description: 'Generate professional receipts and invoices directly on WhatsApp. Send digital PDFs to customers instantly.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <div className="bg-slate-50 text-slate-600 font-sans selection:bg-emerald-500 selection:text-white">
      <Script
        id="receipt-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNavbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-950 z-0" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-bold mb-8">
            <FileText size={16} /> #1 Receipt Maker for WhatsApp
          </div>
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Generate Receipts <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
              Directly on WhatsApp.
            </span>
          </h1>
          <p className="text-xl text-emerald-100 mb-10 max-w-2xl mx-auto font-medium">
             Turn your WhatsApp into a mobile POS. Generate instant, professional PDF receipts and send them to your customers exactly where they chat.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
            >
              Create Free Receipt
            </a>
          </div>
        </div>
      </section>

      {/* Features / How it works */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900">How to send a receipt</h2>
            <p className="text-slate-500 mt-4 text-lg">It takes less than 10 seconds to issue a professional invoice.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-6">1</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Record the Sale</h3>
              <p className="text-slate-500">Chat with TallyPadi on WhatsApp: "Sold 2 shoes for 50k". The bot records it instantly.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-6">2</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Generate Receipt</h3>
              <p className="text-slate-500">Tap "Generate Receipt" or ask for it. The bot creates a professional PDF invoice immediately.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-6">3</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Send to Customer</h3>
              <p className="text-slate-500">Forward the PDF to your customer right there in WhatsApp. No printing, no paper.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Why switch to digital receipts?</h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Zap size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Look Professional</h4>
                    <p className="text-slate-500">Impress customers with branded, digital invoices instead of messy handwritten notes.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><Smartphone size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Never Lose Records</h4>
                    <p className="text-slate-500">Every receipt is saved in your digital ledger automatically. Search for old sales anytime.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0"><ShieldCheck size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">Save Money</h4>
                    <p className="text-slate-500">Stop buying receipt booklets and paper rolls. Digital is free and unlimited on paid plans.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
               <h3 className="text-xl font-bold text-slate-900 mb-6 border-b pb-4">Invoice #1024</h3>
               <div className="space-y-3 text-sm text-slate-600">
                 <div className="flex justify-between"><span>Item</span><span>Price</span></div>
                 <div className="flex justify-between font-medium text-slate-900"><span>2x Nike Sneakers</span><span>₦50,000</span></div>
                 <div className="flex justify-between font-medium text-slate-900"><span>1x Delivery</span><span>₦2,000</span></div>
                 <div className="border-t pt-3 flex justify-between font-bold text-lg text-emerald-600"><span>Total</span><span>₦52,000</span></div>
               </div>
               <div className="mt-8 text-center text-xs text-slate-400">Generated by TallyPadi on WhatsApp</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-8">
            {[
              { q: "Is this receipt generator free?", a: "TallyPadi offers a free 7-day trial where you can generate unlimited receipts. After that, you can choose a plan starting at just ₦3,000/month." },
              { q: "Can I add my business name?", a: "Yes. Your business name and details appear on every receipt automatically." },
              { q: "Does it work for services too?", a: "Yes. You can use it for services, consulting, freelance work, products, or anything you sell." },
              { q: "Can I send the receipt to email?", a: "The receipt is generated as a PDF file. You can share it via WhatsApp, Email, or print it directly from your phone." }
            ].map((faq, i) => (
              <div key={i} className="border-b border-slate-100 pb-6">
                <h4 className="font-bold text-slate-900 text-lg mb-2">{faq.q}</h4>
                <p className="text-slate-500">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-900 text-center text-white">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Start sending professional receipts today.</h2>
          <a
            href="https://wa.me/2349035664420?text=Hello%20Tallypadi"
            className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-full transition shadow-lg hover:scale-105"
          >
            Get Started on WhatsApp <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
