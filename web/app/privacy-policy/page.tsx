import type { Metadata } from 'next';
import Link from 'next/link';
import { Database, LockKeyhole, Megaphone, ShieldCheck } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'TallyPadi Privacy Policy covering account data, business records, marketplace listings, ads campaign data, and third-party advertising API use.',
  alternates: {
    canonical: 'https://tallypadi.com/privacy-policy',
  },
  openGraph: {
    title: 'Privacy Policy | TallyPadi',
    description: 'How TallyPadi collects, uses, shares, stores, and protects merchant data.',
    url: 'https://tallypadi.com/privacy-policy',
  },
};

const sections = [
  {
    title: 'Information we collect',
    body: [
      'Account information such as business name, owner name, email address, phone number, password credentials, plan status, staff accounts, and support messages.',
      'Business records that users enter into TallyPadi, including inventory, sales, receipts, customers, debtors, expenses, storefront settings, marketplace listings, uploaded images, and seller verification records.',
      'Advertising campaign data when a merchant requests a product boost, including selected product, product image, campaign budget, selected platforms, ad copy, keywords, audience notes, target location, campaign status, and campaign performance metrics.',
      'Technical information such as device/browser data, IP address, timestamps, authentication logs, and usage events needed for security, fraud prevention, diagnostics, and service reliability.',
    ],
  },
  {
    title: 'How we use information',
    body: [
      'To provide inventory tracking, sales recording, receipts, storefront publishing, marketplace listings, ads campaign workflows, customer support, and account administration.',
      'To review merchant-submitted product promotions, prepare campaign materials, submit approved campaigns to advertising platforms where enabled, pause or stop campaigns, and show reporting in the merchant dashboard.',
      'To prevent abuse, investigate suspicious activity, verify seller identity where required, improve product reliability, and comply with applicable laws.',
    ],
  },
  {
    title: 'Data sharing',
    body: [
      'We do not sell personal data. We share data only when needed to operate TallyPadi, comply with the law, process payments, host data securely, deliver messages, provide support, or run merchant-requested advertising workflows.',
      'For advertising workflows, TallyPadi may share campaign-related product data, creative content, target location, campaign budget, landing page URLs, and campaign control instructions with advertising providers such as TikTok, Meta, and Google when the merchant has requested the boost and TallyPadi has approved it.',
      'Provider reporting data may be imported back into TallyPadi so merchants and admins can see impressions, clicks, cost, status, and other campaign results.',
    ],
  },
];

export default function PrivacyPolicyPage() {
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
            <h1 className="mt-6 text-4xl sm:text-5xl font-black text-stone-950">Privacy Policy</h1>
            <p className="mt-5 max-w-3xl text-base sm:text-lg leading-8 text-stone-700">
              This Privacy Policy explains how TallyPadi collects, uses, stores, shares, and protects information when merchants, staff, customers, marketplace visitors, and admins use TallyPadi.
            </p>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
          <div className="rounded-lg border border-stone-200 bg-white p-6">
            <h2 className="text-xl font-black text-stone-950">Business identity</h2>
            <p className="mt-3 leading-7 text-stone-700">
              TallyPadi is a business management and merchant promotion platform operating from Lagos, Nigeria. Contact us at <a href="mailto:support@tallypadi.com" className="font-bold text-emerald-700">support@tallypadi.com</a>. Privacy requests can be sent to <a href="mailto:privacy@tallypadi.com" className="font-bold text-emerald-700">privacy@tallypadi.com</a>.
            </p>
          </div>

          {sections.map((section) => (
            <div key={section.title} className="rounded-lg border border-stone-200 bg-white p-6">
              <h2 className="text-xl font-black text-stone-950">{section.title}</h2>
              <ul className="mt-4 space-y-3 text-stone-700 leading-7 list-disc pl-5 marker:text-emerald-600">
                {section.body.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <Database className="text-emerald-600" size={24} />
              <h3 className="mt-4 font-black text-stone-950">Retention</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">We keep account and business records while needed to provide the service, meet legal requirements, resolve disputes, and maintain reliable financial history.</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <LockKeyhole className="text-emerald-600" size={24} />
              <h3 className="mt-4 font-black text-stone-950">Security</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">We use technical and administrative safeguards, access controls, secure authentication, cloud infrastructure, audit logs, and operational monitoring to protect data.</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <Megaphone className="text-emerald-600" size={24} />
              <h3 className="mt-4 font-black text-stone-950">Ads data</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">Campaign data is used only to manage merchant-requested promotions, show results, reconcile spend, and support campaign controls.</p>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-6">
            <h2 className="text-xl font-black text-stone-950">Your choices and rights</h2>
            <p className="mt-3 leading-7 text-stone-700">
              You may request access, correction, export, or deletion of your personal data by contacting us. Some business records may need to be retained where required for legal, security, fraud prevention, or accounting reasons. Merchants can also pause, stop, or request review of active ad campaigns through TallyPadi support or available dashboard controls.
            </p>
          </div>

          <div className="rounded-lg border border-stone-200 bg-[#171715] p-6 text-white">
            <h2 className="text-xl font-black">Contact</h2>
            <p className="mt-3 text-slate-300 leading-7">
              Privacy email: privacy@tallypadi.com<br />
              Support email: support@tallypadi.com<br />
              Service location: Lagos, Nigeria
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 transition">Contact page</Link>
              <Link href="/terms-of-service" className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 transition">Terms of Service</Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
