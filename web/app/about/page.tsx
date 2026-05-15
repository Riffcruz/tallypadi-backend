import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, Megaphone, ReceiptText, ShieldCheck, Store, Warehouse } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'About TallyPadi - Business Management Software for African SMEs',
  description: 'Learn about TallyPadi, an Africa-based WhatsApp POS and business management platform for inventory, receipts, storefronts, marketplace listings, and managed promotions.',
  keywords: [
    'about TallyPadi',
    'business management software Nigeria',
    'business management software Africa',
    'WhatsApp POS Nigeria',
    'inventory and receipt software',
    'SME business tools Africa',
    'send ads to facebook',
    'send ads to instagram',
    'send ads to tiktok',
    'send ads to google',
    'send receipts via whatsapp',
    'manage inventory and stock',
    'record sales and track cash flow',
    'publish products to a public shop link',
    'publish products to TallyPadi Marketplace',
  ],
  alternates: {
    canonical: 'https://tallypadi.com/about',
  },
  openGraph: {
    title: 'About TallyPadi',
    description: 'TallyPadi helps Nigerian and African SMEs manage sales, stock, receipts, storefronts, debtors, and product promotions from WhatsApp and web.',
    url: 'https://tallypadi.com/about',
  },
};

const details = [
  { label: 'Business name', value: 'TallyPadi' },
  { label: 'Service location', value: 'Lagos, Nigeria' },
  { label: 'Support email', value: 'support@tallypadi.com' },
  { label: 'Privacy email', value: 'privacy@tallypadi.com' },
  { label: 'WhatsApp support', value: '+234 903 566 4420' },
  { label: 'Website', value: 'https://tallypadi.com' },
];

const products = [
  { icon: ReceiptText, title: 'Sales and receipts', text: 'Record sales, generate professional receipts, track cash flow, and keep a searchable sales history.' },
  { icon: Warehouse, title: 'Inventory control', text: 'Manage stock, prices, low-stock alerts, barcode-friendly checkout, and product records.' },
  { icon: Store, title: 'Storefront and marketplace', text: 'Publish products to a public shop link and TallyPadi Marketplace when store setup is complete.' },
  { icon: Megaphone, title: 'Managed product promotion', text: 'Merchants can request product boosts across TallyPadi Marketplace and external ad platforms such as TikTok, Meta, and Google.' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#f7f0df] text-stone-900">
      <MarketingNavbar />
      <main className="pt-24">
        <section className="border-b border-stone-200 bg-[#f7f0df]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700">
                <BadgeCheck size={14} />
                Real business tools for growing sellers
              </div>
              <h1 className="mt-6 text-4xl sm:text-5xl font-black text-stone-950">
                TallyPadi helps small businesses sell, track, and promote products with more confidence.
              </h1>
              <p className="mt-5 max-w-2xl text-base sm:text-lg leading-8 text-stone-700">
                TallyPadi is a web and WhatsApp-connected business management platform for retailers, wholesalers, and service businesses. The product combines inventory tracking, checkout, receipts, customer records, storefront publishing, marketplace visibility, and managed product promotion in one account.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/contact" className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition">
                  Contact TallyPadi
                </Link>
                <Link href="/privacy-policy" className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-white transition">
                  Privacy Policy
                </Link>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-950 shadow-xl">
              <Image
                src="/banner.jpeg"
                alt="TallyPadi product and marketplace management dashboard"
                width={1200}
                height={800}
                className="h-full min-h-[340px] w-full object-cover opacity-90"
                priority
              />
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
          <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-8">
            <div className="bg-white rounded-lg border border-stone-200 p-6 h-fit">
              <h2 className="text-xl font-black text-stone-950">Business Identity</h2>
              <div className="mt-5 divide-y divide-stone-100">
                {details.map((item) => (
                  <div key={item.label} className="py-3">
                    <p className="text-xs font-bold uppercase text-stone-500">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-stone-800">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-stone-950">What TallyPadi Does</h2>
              <p className="mt-3 text-stone-700 leading-7">
                Our goal is to give small businesses the same operating discipline larger businesses have: clear records, controlled stock, clean receipts, customer follow-up, and product promotion that can be reviewed and measured.
              </p>
              <div className="mt-6 grid sm:grid-cols-2 gap-4">
                {products.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="bg-white rounded-lg border border-stone-200 p-5">
                      <Icon className="text-emerald-600" size={24} />
                      <h3 className="mt-4 font-black text-stone-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-stone-700">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-bold uppercase text-stone-600">
                <ShieldCheck size={14} />
                Advertising API use
              </div>
              <h2 className="mt-5 text-2xl font-black text-stone-950">How TallyPadi Uses Ads Platforms</h2>
              <p className="mt-4 leading-7 text-stone-700">
                TallyPadi is building managed advertising workflows for merchants who request product boosts inside TallyPadi. For TikTok, Meta, and Google, TallyPadi may use approved business API access to create, submit, pause, update, and report on campaigns for products that merchants have selected and funded in TallyPadi.
              </p>
              <p className="mt-4 leading-7 text-stone-700">
                Merchants do not connect their own ad manager accounts in the current version. TallyPadi reviews product details, creative copy, budgets, and policy risks before any provider submission.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
