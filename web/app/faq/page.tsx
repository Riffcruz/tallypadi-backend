import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MessageCircle, Plus } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description: 'How to register with TallyPadi, record sales on WhatsApp, track expenses and stock, create receipts and invoices, and set up your online storefront.',
  alternates: { canonical: 'https://tallypadi.com/faq' },
  openGraph: {
    title: 'TallyPadi — Frequently Asked Questions',
    description: 'Practical answers about WhatsApp bookkeeping, business records, receipts, inventory and your TallyPadi account.',
    url: 'https://tallypadi.com/faq',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
};

const topics = [
  {
    id: 'getting-started', label: 'Getting started',
    questions: [
      { question: 'What is TallyPadi?', answer: 'TallyPadi helps small businesses record sales, track expenses, manage stock and customer balances, and create receipts and invoices. You can use WhatsApp for everyday entries and the web dashboard to manage and review your records.' },
      { question: 'How do I register my shop?', answer: 'Create an account on the website, or send Hello to our WhatsApp number and choose to register. Follow the prompts to provide your email, set and confirm a password, and choose your shop name. You can use your WhatsApp profile name or enter a different shop name.' },
      { question: 'Do I need to download an app?', answer: 'No separate app is required. You can use TallyPadi through WhatsApp and open the web dashboard in your browser on a phone, tablet or computer.' },
      { question: 'Is there a free trial?', answer: 'New accounts start with a seven-day Tycoon trial. You can review the current plans and features on our pricing section before choosing a subscription.' },
    ],
  },
  {
    id: 'sales-and-records', label: 'Sales, expenses & stock',
    questions: [
      { question: 'How do I record a sale on WhatsApp?', answer: 'Send the product, quantity and price in a message, for example: Sold 2 bags of rice at 50000 each. You can also record sales in the web dashboard. Check the saved quantity, price and payment details before relying on the record.' },
      { question: 'How do I add stock or change a price?', answer: 'Use a message such as Add 20 sneakers to add stock. To change prices, be specific: Set shoe selling price to 15000 and cost price to 10000. You can also manage products, quantities and prices from your inventory dashboard.' },
      { question: 'Can I track business expenses and customers who owe me?', answer: 'Yes. For an expense, try Spent 5000 on fuel. For a credit sale, include the customer name and state that it is on credit, for example: Sold 2 shoes to Emeka on credit. Review the customer balance and record payments when they come in.' },
      { question: 'How can I check my sales or stock?', answer: 'Use the WhatsApp menu to view your sales report or track inventory, or check your web dashboard. Keep entries up to date so your reports reflect what happened in your business.' },
      { question: 'Does AI do all the bookkeeping?', answer: 'AI helps interpret supported WhatsApp messages. The software stores your business records, calculates totals and generates documents. Review the details for accuracy, particularly when a message could be understood in more than one way. TallyPadi does not replace professional accounting or tax advice.' },
    ],
  },
  {
    id: 'receipts-and-invoices', label: 'Receipts & invoices',
    questions: [
      { question: 'How do I get a receipt for a sale?', answer: 'After recording a sale, choose the receipt action in WhatsApp and follow any prompts for the customer details. The receipt is generated from the sale record. You can also use the receipt tools on the website.' },
      { question: 'What details do I need for an invoice?', answer: 'Include the customer name, items or services, quantities and prices. Save your business bank details when prompted so they can appear on the invoice. Check the customer details, totals and payment status before sharing the document.' },
      { question: 'What should I do if a record or document is wrong?', answer: 'Check the underlying sale, item prices and customer information in your dashboard. Correct the relevant details using the available controls before sharing the document again. If you cannot find the right option, contact support with the record or document reference.' },
    ],
  },
  {
    id: 'shop-and-account', label: 'Your shop & account',
    questions: [
      { question: 'Can I give staff access to my shop?', answer: 'TallyPadi supports staff accounts and permissions. The owner can add staff and manage their access. Check the current plans for availability and staff limits before choosing a subscription.' },
      { question: 'Can I manage more than one shop?', answer: 'TallyPadi includes HQ and branch workflows for businesses with multiple locations. Contact support to confirm the account setup and plan that fit your shops.' },
      { question: 'What is the difference between my storefront and the marketplace?', answer: 'Your storefront is a public shop page you can share with customers. TallyPadi Marketplace lets shoppers browse published products from participating stores. Complete your store setup and choose the products you want to publish; your private sales records are separate from your public product listings.' },
      { question: 'What happens when my subscription expires?', answer: 'Access to subscription features is restricted until you renew. Follow the renewal prompts in WhatsApp or your account. If you have a billing issue, contact support rather than creating another account for the same shop.' },
      { question: 'Where can I read about privacy or request help with my data?', answer: 'Our privacy policy explains what information TallyPadi processes and how to request access or deletion. For privacy requests, email privacy@tallypadi.com. For product or account help, contact support@tallypadi.com.' },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-[#f7f0df] text-[#181816]">
      <MarketingNavbar />
      <main className="pt-[72px]">
        <header className="border-b border-stone-900/15">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-10 sm:py-20">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">Frequently asked questions</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl">Questions about TallyPadi?</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">How to get started, keep your records and use the tools in your account.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/register" className="inline-flex min-h-12 items-center gap-3 rounded-lg bg-[#181816] px-5 text-sm font-bold text-white hover:bg-stone-700">Create your account<ArrowRight size={17} /></Link>
              <Link href="/help" className="inline-flex min-h-12 items-center rounded-lg border border-stone-900/20 px-5 text-sm font-bold hover:bg-white/60">Open help center</Link>
            </div>
          </div>
        </header>
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-10 sm:py-16 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
          <aside>
            <div className="lg:sticky lg:top-24">
              <nav aria-label="FAQ topics" className="border-y border-stone-900/15 py-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-stone-500">On this page</p>
                {topics.map(topic => <a key={topic.id} href={`#${topic.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm font-semibold hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-stone-900">{topic.label}<ArrowRight size={15} className="shrink-0 text-stone-400" /></a>)}
              </nav>
              <div className="mt-7 hidden border-l-2 border-amber-400 pl-5 lg:block"><p className="font-bold">Can’t find your answer?</p><p className="mt-2 text-sm leading-6 text-stone-600">Talk to us about your shop, account or a particular record.</p><Link href="/contact" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold underline underline-offset-4">Contact support<ArrowRight size={15} /></Link></div>
            </div>
          </aside>
          <div className="min-w-0 space-y-12 sm:space-y-16">
            {topics.map((topic, index) => <section key={topic.id} id={topic.id} className="scroll-mt-28">
              <div className="mb-5 flex items-baseline gap-4"><span className="text-xs text-stone-500">0{index + 1}</span><h2 className="text-2xl font-bold tracking-tight">{topic.label}</h2></div>
              <div className="divide-y divide-stone-900/15 border-y border-stone-900/15">{topic.questions.map(faq => <details key={faq.question} className="group">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-5 text-base font-semibold leading-7 marker:content-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900 [&::-webkit-details-marker]:hidden"><span>{faq.question}</span><Plus aria-hidden="true" size={19} className="shrink-0 text-stone-500 transition-transform group-open:rotate-45" /></summary>
                <p className="max-w-3xl pr-5 pb-6 text-sm leading-7 text-stone-600 sm:text-base sm:leading-8">{faq.answer}</p>
              </details>)}</div>
            </section>)}
            <div className="border-t border-stone-900/15 pt-8"><h2 className="text-2xl font-bold tracking-tight">Still need help?</h2><p className="mt-3 max-w-lg leading-7 text-stone-600">Send us your question. Include the relevant record or invoice reference if you have one.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/contact" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-amber-300 px-5 text-sm font-bold hover:bg-amber-200">Contact support<ArrowRight size={17} /></Link><a href="https://wa.me/2349035664420?text=Hello%20TallyPadi%20support" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-stone-900/20 px-5 text-sm font-bold hover:bg-white/60"><MessageCircle size={17} />Ask on WhatsApp</a></div><p className="mt-6 text-sm text-stone-600"><Link href="/privacy-policy" className="underline underline-offset-4">Privacy policy</Link><span className="px-3" aria-hidden="true">·</span><Link href="/#pricing" className="underline underline-offset-4">Current plans</Link></p></div>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
