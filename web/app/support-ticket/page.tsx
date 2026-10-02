import type { Metadata } from 'next';
import MarketingFooter from '../../components/MarketingFooter';
import MarketingNavbar from '../../components/MarketingNavbar';
import SupportTicketForm from '../../components/SupportTicketForm';

export const metadata: Metadata = {
  title: 'Submit a Support Ticket | TallyPadi',
  description: 'Send a support request to the TallyPadi team.',
  alternates: { canonical: 'https://tallypadi.com/support-ticket' },
};

export default function SupportTicketPage() {
  return (
    <div className="min-h-screen bg-[#f7f0df] text-stone-900">
      <MarketingNavbar />
      <main className="pt-24">
        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Support</p>
          <h1 className="mt-3 text-4xl font-black text-stone-950 sm:text-5xl">How can we help?</h1>
          <p className="mt-4 mb-8 text-stone-600">Send your request and keep the ticket number for reference.</p>
          <SupportTicketForm />
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
