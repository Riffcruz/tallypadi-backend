import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Megaphone, PauseCircle, ShieldCheck } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'TallyPadi Terms of Service for inventory, receipts, storefronts, marketplace listings, seller verification, and managed ads workflows.',
  alternates: {
    canonical: 'https://tallypadi.com/terms-of-service',
  },
  openGraph: {
    title: 'Terms of Service | TallyPadi',
    description: 'Terms governing use of TallyPadi business management and managed promotion services.',
    url: 'https://tallypadi.com/terms-of-service',
  },
};

const terms = [
  {
    title: '1. Acceptance of these Terms',
    body: 'By creating an account, using the dashboard, interacting with TallyPadi on WhatsApp, publishing a storefront, submitting seller verification, or requesting a product promotion, you agree to these Terms of Service.',
  },
  {
    title: '2. What TallyPadi provides',
    body: 'TallyPadi provides business tools for inventory records, sales recording, receipts, customers, debtors, staff workflows, public storefronts, marketplace listings, and merchant-requested managed product promotions.',
  },
  {
    title: '3. Merchant responsibilities',
    body: 'You are responsible for the accuracy of product records, prices, stock quantities, customer details, tax/accounting decisions, seller verification information, uploaded assets, and advertising claims submitted through TallyPadi.',
  },
  {
    title: '4. Prohibited use',
    body: 'You may not use TallyPadi to sell illegal goods, submit misleading ads, infringe intellectual property, impersonate another person or business, upload harmful content, violate platform policies, or interfere with TallyPadi systems.',
  },
  {
    title: '5. Payments, wallet, and campaign budgets',
    body: 'Ads wallet balances and campaign budgets are used for merchant-requested promotions and related TallyPadi service fees. Campaign funds may be reserved, released, topped up, refunded, or reallocated based on campaign status, provider acceptance, admin review, and applicable platform rules.',
  },
  {
    title: '6. Limitation of liability',
    body: 'TallyPadi provides business software and managed workflows. We are not responsible for inaccurate records caused by incorrect user input, provider policy decisions, third-party downtime, lost profits, indirect damages, or outcomes outside our reasonable control.',
  },
  {
    title: '7. Changes and termination',
    body: 'We may update features, pricing, policies, or these Terms. We may suspend or terminate access where required for security, fraud prevention, legal compliance, unpaid fees, or misuse of the service.',
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#f7f0df] text-stone-900">
      <MarketingNavbar />
      <main className="pt-24">
        <section className="border-b border-stone-200 bg-[#f7f0df]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase text-emerald-700">
              <ShieldCheck size={14} />
              Last updated May 12, 2026
            </div>
            <h1 className="mt-6 text-4xl sm:text-5xl font-black text-stone-950">Terms of Service</h1>
            <p className="mt-5 max-w-3xl text-base sm:text-lg leading-8 text-stone-700">
              These Terms govern use of TallyPadi, including the web dashboard, WhatsApp workflows, storefronts, marketplace listings, seller verification, wallet features, and managed product promotion tools.
            </p>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
          <div className="rounded-lg border border-stone-200 bg-white p-6">
            <h2 className="text-xl font-black text-stone-950">Business identity and contact</h2>
            <p className="mt-3 leading-7 text-stone-700">
              TallyPadi operates from Lagos, Nigeria. Official support is available at <a href="mailto:support@tallypadi.com" className="font-bold text-emerald-700">support@tallypadi.com</a> and through WhatsApp at +234 903 566 4420.
            </p>
          </div>

          {terms.map((section) => (
            <div key={section.title} className="rounded-lg border border-stone-200 bg-white p-6">
              <h2 className="text-xl font-black text-stone-950">{section.title}</h2>
              <p className="mt-3 leading-7 text-stone-700">{section.body}</p>
            </div>
          ))}

          <div className="rounded-lg border border-stone-200 bg-white p-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-bold uppercase text-stone-600">
              <Megaphone size={14} />
              Managed ads terms
            </div>
            <h2 className="mt-5 text-xl font-black text-stone-950">Advertising platform use</h2>
            <p className="mt-3 leading-7 text-stone-700">
              When a merchant requests an ad boost, TallyPadi may review product details, generate or edit ad suggestions, reserve campaign funds, create provider campaign records, submit approved campaign materials to platforms such as TikTok, Meta, or Google where API access is enabled, pause or stop campaigns, and retrieve reporting data for display in TallyPadi.
            </p>
            <p className="mt-3 leading-7 text-stone-700">
              TallyPadi may reject or pause a campaign that violates our rules, advertiser policies, marketplace policy, applicable law, or third-party platform policy. External platforms may also reject, limit, review, or suspend ads based on their own policies.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <PauseCircle className="text-emerald-600" size={24} />
              <h3 className="mt-4 font-black text-stone-950">Campaign controls</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">Merchants may request campaign pause, stop, top-up, resume, or change requests where available. Admin approval may be required to protect budgets and platform policy compliance.</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <AlertTriangle className="text-amber-600" size={24} />
              <h3 className="mt-4 font-black text-stone-950">No guaranteed results</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">Campaign approval, reach, clicks, conversions, sales, spend pace, and reporting availability can vary by provider, product category, budget, creative quality, and platform review.</p>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-[#171715] p-6 text-white">
            <h2 className="text-xl font-black">Related policies</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/privacy-policy" className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 transition">Privacy Policy</Link>
              <Link href="/contact" className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 transition">Contact</Link>
              <Link href="/about" className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 transition">About TallyPadi</Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
