import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, MessageCircle } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

const title = 'AI Bookkeeping for Small Businesses in Nigeria';
const description = 'Record daily sales, track business expenses and customer debt with TallyPadi. AI-assisted bookkeeping on WhatsApp and web for Nigerian and African small businesses.';
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: 'https://tallypadi.com/ai-bookkeeping-nigeria' },
  openGraph: { title, description, url: 'https://tallypadi.com/ai-bookkeeping-nigeria', type: 'website', images: [{ url: '/og.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] },
};

const steps = [
  { number: '01', title: 'Record a sale while it is fresh', text: 'Include the product, quantity and price in your WhatsApp message, or enter the sale in your web dashboard. Check the recorded details, especially when prices or quantities could be ambiguous.', example: 'Sold 2 bags of rice at ₦50,000 each' },
  { number: '02', title: 'Capture the costs of doing business', text: 'Keep a record of business expenses such as transport, fuel and shop rent. Recording the expense when you pay it makes it easier to review your spending later.', example: 'Spent ₦5,000 on fuel' },
  { number: '03', title: 'Keep customer debt visible', text: 'Separate credit sales from payments already received. Record the customer name, check the outstanding balance and update the record when a payment comes in.', example: 'Sold 2 shoes to Emeka on credit' },
  { number: '04', title: 'Review before planning your next week', text: 'Look at sales, expenses, customer balances and stock together. Use your records to decide which products to restock and which payments to follow up.', example: 'A weekly review is easier with daily records.' },
];
const faqs = [
  { question: 'What is AI bookkeeping?', answer: 'AI bookkeeping uses artificial intelligence to help turn messages or documents into organised business records. In TallyPadi, AI helps interpret supported WhatsApp requests, while regular software stores records, calculates totals and generates documents. Always review entries for accuracy.' },
  { question: 'How can I record daily sales for my small business in Nigeria?', answer: 'Record the product or service, quantity, price, date and payment status for each sale. With TallyPadi, you can send a supported sales message on WhatsApp or use the web dashboard. Check that the saved record reflects the actual transaction.' },
  { question: 'Can I use WhatsApp to track business expenses?', answer: 'Yes. You can send expense messages such as “Spent 5000 on fuel” to TallyPadi. Keep receipts and review the recorded expense details so your records stay complete.' },
  { question: 'Is bookkeeping the same as profit or cash in the bank?', answer: 'No. Sales, cash received and profit describe different things. A credit sale may be unpaid, and sales totals do not account for every business cost. Keep your sales, customer balances, stock costs and expenses up to date before relying on a report.' },
  { question: 'Does TallyPadi replace an accountant?', answer: 'TallyPadi helps with everyday sales records, expenses, receipts, inventory and business reports. It does not replace an accountant’s judgement or professional tax advice. Requirements differ across Nigeria and other African countries.' },
  { question: 'Who is TallyPadi designed for?', answer: 'TallyPadi is designed for small businesses such as retailers, wholesalers and service businesses in Nigeria and across Africa. Check current plans and contact support to confirm the features and setup that fit your business.' },
];

export default function BookkeepingPage() {
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'WebPage', name: title,
    description, url: 'https://tallypadi.com/ai-bookkeeping-nigeria',
    about: { '@type': 'SoftwareApplication', name: 'TallyPadi', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: 'https://tallypadi.com' },
    publisher: { '@type': 'Organization', '@id': 'https://tallypadi.com/#organization', name: 'TallyPadi' },
  };
  return (
    <div className="bg-[#f7f0df] text-stone-950">
      <MarketingNavbar />
      <main className="pt-[72px]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <section className="border-b border-stone-200"><div className="mx-auto max-w-5xl px-5 py-16 sm:px-10 sm:py-24"><p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-800">WhatsApp bookkeeping · Nigeria & Africa</p><h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">AI bookkeeping for small businesses in Nigeria.</h1><p className="mt-7 max-w-3xl text-lg leading-8 text-stone-600">Keep daily sales, business expenses and customer debt in one place. TallyPadi helps turn your WhatsApp messages into business records, with a web dashboard for reviewing the bigger picture.</p><div className="mt-8 flex flex-wrap gap-4"><Link href="/register" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#181816] px-5 font-semibold text-white hover:bg-stone-700">Start keeping clearer records<ArrowRight size={18} /></Link><Link href="/#pricing" className="inline-flex min-h-12 items-center px-3 font-semibold underline underline-offset-4">See plans</Link></div></div></section>
        <section className="mx-auto max-w-5xl px-5 py-14 sm:px-10 sm:py-20"><h2 className="text-3xl font-semibold tracking-tight">How to record sales and expenses on WhatsApp</h2><p className="mt-5 max-w-3xl leading-8 text-stone-600">For a shop owner, trader or service business, a useful bookkeeping habit starts with recording what happened. These examples show how to keep your records moving during a busy day.</p><div className="mt-10 space-y-5">{steps.map(step => <article key={step.number} className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 sm:grid-cols-[48px_1fr] sm:p-8"><span className="text-sm font-bold text-stone-600">{step.number}</span><div><h3 className="text-xl font-semibold">{step.title}</h3><p className="mt-3 leading-7 text-stone-600">{step.text}</p><p className="mt-5 flex items-start gap-3 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-900"><MessageCircle size={18} className="mt-1 shrink-0" />{step.example}</p></div></article>)}</div></section>
        <section className="bg-[#eee4ce]"><div className="mx-auto max-w-5xl px-5 py-14 sm:px-10 sm:py-20"><h2 className="text-3xl font-semibold tracking-tight">Better business records. More informed decisions.</h2><p className="mt-5 max-w-3xl leading-8 text-stone-700">Whether you run a provisions shop in Lagos, sell clothing in Abuja, or manage a service business elsewhere in Africa, organised records help you ask better questions about your business. They support your decisions; they do not guarantee growth or profit.</p><ul className="mt-7 grid gap-4 sm:grid-cols-2">{['Which products are selling?', 'What am I spending on the business?', 'Which customers still owe me?', 'What should I restock next?'].map(item => <li key={item} className="flex items-center gap-3 text-sm font-semibold"><Check size={18} className="shrink-0 text-stone-800" />{item}</li>)}</ul><div className="mt-9 flex flex-wrap gap-x-7 gap-y-4 text-sm font-semibold text-stone-900">{[{ href: '/sales-tracking-ledger', label: 'Sales tracking' }, { href: '/accounts-receivable-debtors-tracking', label: 'Track customer debt' }, { href: '/inventory-stock-management', label: 'Inventory management' }, { href: '/best-way-to-grow-business', label: 'Business improvement guide' }].map(link => <Link key={link.href} href={link.href} className="underline underline-offset-4">{link.label}</Link>)}</div></div></section>
        <section className="mx-auto max-w-5xl px-5 py-14 sm:px-10 sm:py-20"><h2 className="text-3xl font-semibold tracking-tight">Questions about AI-assisted bookkeeping</h2><div className="mt-8 divide-y divide-stone-200 border-y border-stone-200">{faqs.map(faq => <details key={faq.question} className="py-5"><summary className="cursor-pointer text-base font-semibold leading-7 focus-visible:outline-2 focus-visible:outline-stone-900">{faq.question}</summary><p className="mt-4 max-w-3xl leading-8 text-stone-600">{faq.answer}</p></details>)}</div><div className="mt-10"><Link href="/about" className="inline-flex min-h-11 items-center gap-2 font-semibold text-stone-800">Meet TallyPadi<ArrowRight size={17} /></Link></div></section>
      </main>
      <MarketingFooter />
    </div>
  );
}
