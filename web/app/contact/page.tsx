import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Contact TallyPadi',
  description: 'Contact TallyPadi for support, privacy requests, business verification, advertising API questions, and product support.',
  alternates: {
    canonical: 'https://tallypadi.com/contact',
  },
  openGraph: {
    title: 'Contact TallyPadi',
    description: 'Support and business contact details for TallyPadi.',
    url: 'https://tallypadi.com/contact',
  },
};

const contacts = [
  {
    icon: Mail,
    label: 'General support',
    value: 'support@tallypadi.com',
    href: 'mailto:support@tallypadi.com',
    text: 'Product help, account issues, receipts, inventory, marketplace, and ads support.',
  },
  {
    icon: ShieldCheck,
    label: 'Privacy and data requests',
    value: 'privacy@tallypadi.com',
    href: 'mailto:privacy@tallypadi.com',
    text: 'Data access, deletion, privacy policy, and account data questions.',
  },
  {
    icon: MessageCircle,
    label: 'WhatsApp support',
    value: '+234 903 566 4420',
    href: 'https://wa.me/2349035664420?text=Hello%20TallyPadi%20support',
    text: 'Fast support for merchants and account setup questions.',
  },
  {
    icon: MapPin,
    label: 'Service location',
    value: 'Lagos, Nigeria',
    href: null,
    text: 'TallyPadi serves businesses in Nigeria and other supported markets through its web platform.',
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#f7f0df] text-stone-900">
      <MarketingNavbar />
      <main className="pt-24">
        <section className="border-b border-stone-200 bg-[#f7f0df]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
            <p className="text-sm font-bold uppercase text-emerald-700">Contact</p>
            <h1 className="mt-4 max-w-3xl text-4xl sm:text-5xl font-black text-stone-950">
              Talk to TallyPadi support or business verification.
            </h1>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-8 text-stone-700">
              Use these official channels for account help, privacy requests, ads platform questions, and verification of TallyPadi business use cases.
            </p>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {contacts.map((item) => {
              const Icon = item.icon;
              const content = (
                  <div className="h-full rounded-lg border border-stone-200 bg-white p-5 transition hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-900/5">
                    <Icon className="text-emerald-600" size={24} />
                  <p className="mt-4 text-xs font-bold uppercase text-stone-500">{item.label}</p>
                  <p className="mt-2 font-black text-stone-950">{item.value}</p>
                  <p className="mt-3 text-sm leading-6 text-stone-700">{item.text}</p>
                </div>
              );

              return item.href ? (
                <a key={item.label} href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel={item.href.startsWith('http') ? 'noreferrer' : undefined}>
                  {content}
                </a>
              ) : (
                <div key={item.label}>{content}</div>
              );
            })}
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid lg:grid-cols-2 gap-8">
            <div>
              <h2 className="text-2xl font-black text-stone-950">For ads platform reviewers</h2>
              <p className="mt-4 leading-7 text-stone-700">
                TallyPadi is a business management and merchant promotion tool. Its advertising workflows help merchants request product boosts, approve ad copy, allocate budgets, and view campaign reporting from their TallyPadi dashboard.
              </p>
              <p className="mt-4 leading-7 text-stone-700">
                Advertising API access is used only for business-approved campaign creation, campaign status controls, performance reporting, and reconciliation connected to merchant-submitted product campaigns.
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-[#f7f0df] p-6">
              <h3 className="font-black text-stone-950">Useful pages</h3>
              <div className="mt-4 grid gap-3 text-sm font-semibold">
                <Link href="/about" className="rounded-lg bg-white border border-stone-200 px-4 py-3 hover:border-emerald-300">About TallyPadi</Link>
                <Link href="/privacy-policy" className="rounded-lg bg-white border border-stone-200 px-4 py-3 hover:border-emerald-300">Privacy Policy</Link>
                <Link href="/terms-of-service" className="rounded-lg bg-white border border-stone-200 px-4 py-3 hover:border-emerald-300">Terms of Service</Link>
                <Link href="/marketplace" className="rounded-lg bg-white border border-stone-200 px-4 py-3 hover:border-emerald-300">Marketplace</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
