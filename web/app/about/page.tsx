import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Mail, MapPin, MessageCircle } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'About TallyPadi — Bookkeeping for Small Businesses',
  description: 'TallyPadi helps small businesses in Nigeria and across Africa record sales, track expenses, manage stock and send receipts through WhatsApp and the web.',
  alternates: { canonical: 'https://tallypadi.com/about' },
  openGraph: {
    title: 'About TallyPadi',
    description: 'Sales, stock, expenses and receipts, together on WhatsApp and the web. Built for Nigerian and African small businesses.',
    url: 'https://tallypadi.com/about',
    images: [{ url: '/banner.jpeg', width: 1408, height: 768, alt: 'TallyPadi business records on WhatsApp' }],
  },
};

const features = [
  { number: '01', title: 'Sales & receipts', text: 'Record cash and credit sales. Create a receipt or invoice and find past transactions when you need them.', href: '/sales-tracking-ledger' },
  { number: '02', title: 'Stock & inventory', text: 'Keep product quantities and prices up to date, check what is left and plan your next restock.', href: '/inventory-stock-management' },
  { number: '03', title: 'Expenses & customer balances', text: 'Record the money you spend on your business and keep track of customers who still owe you.', href: '/accounts-receivable-debtors-tracking' },
  { number: '04', title: 'Your shop, online', text: 'Share a storefront link with customers and publish products to TallyPadi Marketplace when your store is ready.', href: '/product-catalog-shop-link-generator' },
];

export default function AboutPage() {
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'AboutPage',
    name: 'About TallyPadi', url: 'https://tallypadi.com/about',
    about: { '@type': 'Organization', '@id': 'https://tallypadi.com/#organization', name: 'TallyPadi', url: 'https://tallypadi.com', email: 'support@tallypadi.com', areaServed: ['Nigeria', 'Africa'] },
  };
  return (
    <div className="min-h-screen bg-[#f7f0df] text-[#181816]">
      <MarketingNavbar />
      <main className="pt-[72px]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <section className="border-b border-stone-900/15">
          <div className="mx-auto max-w-7xl px-5 pt-12 pb-14 sm:px-10 sm:py-20">
            <div className="grid items-center gap-9 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">About TallyPadi</p>
                <h1 className="mt-5 text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-[54px]">We help you keep track of your business.</h1>
                <p className="mt-6 text-lg leading-8 text-stone-700">Sales, stock, expenses, receipts. The things you need to stay on top of, all in one place.</p>
                <p className="mt-4 leading-7 text-stone-600">TallyPadi gives retailers, wholesalers and service businesses a way to manage their records through WhatsApp and the web. Built for business owners in Nigeria and across Africa.</p>
                <Link href="/register" className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-lg bg-[#181816] px-5 text-sm font-bold text-white transition hover:bg-stone-700">Get started<ArrowRight size={17} /></Link>
              </div>
              <figure className="min-w-0">
                <div className="overflow-hidden rounded-xl border border-stone-900/15 bg-[#e7dfce] shadow-lg shadow-stone-900/5">
                  <Image src="/banner.jpeg" alt="TallyPadi billboard showing a shop owner using WhatsApp to keep track of sales, stock and profit" width={1408} height={768} priority sizes="(max-width: 1023px) 100vw, 660px" className="h-auto w-full" />
                </div>
                <figcaption className="mt-3 text-xs text-stone-500">Your business records, right inside WhatsApp.</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-10 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          <h2 className="max-w-sm text-3xl font-bold leading-tight tracking-tight">Less time piecing records together.</h2>
          <div className="max-w-2xl space-y-5 text-base leading-8 text-stone-700">
            <p>When you’re running a business, recording every sale and expense can be easy to put off. By the end of the week, working out what came in, what went out and who has paid takes more time than it should.</p>
            <p>With TallyPadi, you can record transactions as they happen. Send a supported message on WhatsApp or enter the details in your dashboard. Your records stay together, so you have something to work from when it’s time to review the week.</p>
            <p>AI helps interpret your WhatsApp messages. You can check and correct your entries, then use your sales history, stock records and reports to make your own decisions.</p>
            <Link href="/ai-bookkeeping-nigeria" className="inline-flex items-center gap-2 text-sm font-bold text-stone-950 underline decoration-stone-400 underline-offset-4">How bookkeeping on TallyPadi works<ArrowRight size={16} /></Link>
          </div>
        </section>

        <section className="border-y border-stone-900/15 bg-[#fffaf0]">
          <div className="mx-auto grid max-w-7xl gap-9 px-5 py-14 sm:px-10 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">What you can do</p><h2 className="mt-4 max-w-sm text-3xl font-bold leading-tight tracking-tight">The everyday side of running a business.</h2><p className="mt-5 max-w-sm leading-7 text-stone-600">Start with sales and stock. Add the other tools as you need them.</p></div>
            <div className="divide-y divide-stone-900/15 border-t border-stone-900/15">{features.map(feature => <Link key={feature.number} href={feature.href} className="group grid grid-cols-[24px_1fr_18px] items-start gap-4 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900"><span className="mt-1 text-xs text-stone-500">{feature.number}</span><div><h3 className="text-lg font-bold group-hover:underline group-hover:underline-offset-4">{feature.title}</h3><p className="mt-2 text-sm leading-7 text-stone-600">{feature.text}</p></div><ArrowRight size={17} className="mt-1 text-stone-500 transition group-hover:translate-x-1" /></Link>)}</div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-10 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
          <div><h2 className="text-3xl font-bold tracking-tight">Need a hand?</h2><p className="mt-4 max-w-sm leading-7 text-stone-600">Ask us about setting up your shop or using TallyPadi for your business.</p><Link href="/contact" className="mt-6 inline-flex min-h-12 items-center gap-3 rounded-lg bg-amber-300 px-5 text-sm font-bold text-stone-950 hover:bg-amber-200">Contact our team<ArrowRight size={17} /></Link></div>
          <address className="space-y-5 border-t border-stone-900/15 pt-6 text-sm not-italic text-stone-700"><p className="flex items-center gap-3"><MapPin size={18} />Lagos, Nigeria</p><a href="mailto:support@tallypadi.com" className="flex min-h-11 items-center gap-3 underline underline-offset-4"><Mail size={18} />support@tallypadi.com</a><a href="https://wa.me/2349035664420?text=Hello%20TallyPadi%20support" className="flex min-h-11 items-center gap-3 underline underline-offset-4"><MessageCircle size={18} />+234 903 566 4420</a><p className="max-w-lg text-xs leading-6 text-stone-500">Product promotions are reviewed before submission to advertising platforms. Read our <Link href="/privacy-policy" className="underline underline-offset-4">privacy policy</Link> for how we handle business information.</p></address>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
