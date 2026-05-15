import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Megaphone, MessageCircle, Store } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Partnerships - TallyPadi',
  description:
    'Partner with TallyPadi on SME business management, storefronts, marketplace growth, WhatsApp POS workflows, and managed product promotion for African merchants.',
  keywords: [
    'TallyPadi partnership',
    'SME partnership Nigeria',
    'business management software Africa partnership',
    'WhatsApp POS partnership',
    'marketplace partnership Nigeria',
    'ads partnership Africa',
  ],
  alternates: {
    canonical: 'https://tallypadi.com/partners',
  },
  openGraph: {
    title: 'Partner with TallyPadi',
    description: 'Partnership opportunities for SME tools, storefronts, marketplace growth, and managed ads workflows.',
    url: 'https://tallypadi.com/partners',
  },
};

const partnerAreas = [
  {
    title: 'Merchant growth partners',
    text: 'Work with TallyPadi to help retailers and service businesses set up sales, inventory, receipts, and storefront workflows.',
    icon: Store,
  },
  {
    title: 'Advertising and media partners',
    text: 'Support product boosts that send buyers to merchant storefronts, marketplace listings, or product pages.',
    icon: Megaphone,
  },
  {
    title: 'Technology and integration partners',
    text: 'Explore POS machine, payment, fulfillment, reporting, or business management integrations for African SMEs.',
    icon: BadgeCheck,
  },
];

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-[#f7f0df] text-stone-900">
      <MarketingNavbar />
      <main className="pt-24">
        <section className="border-b border-stone-200">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">Partnership</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black text-stone-950 sm:text-5xl">
              Help African SMEs sell, track, and grow with TallyPadi.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-stone-700 sm:text-lg">
              We work with partners who can help merchants adopt WhatsApp POS, inventory management, storefront publishing, marketplace visibility, and managed product promotion.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="mailto:support@tallypadi.com?subject=TallyPadi%20Partnership" className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800">
                <MessageCircle size={17} />
                Talk Partnership
              </a>
              <Link href="/about" className="rounded-lg border border-stone-300 bg-white px-5 py-3 text-sm font-black text-stone-800 hover:border-emerald-400">
                About TallyPadi
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {partnerAreas.map((area) => {
              const Icon = area.icon;
              return (
                <article key={area.title} className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
                  <Icon size={28} className="text-emerald-700" />
                  <h2 className="mt-5 text-xl font-black text-stone-950">{area.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-stone-700">{area.text}</p>
                </article>
              );
            })}
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
