import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions (FAQ) | TallyPadi',
  description: 'Get answers to common questions about TallyPadi. Learn how to register, record sales, manage inventory, and use our WhatsApp bot.',
  alternates: {
    canonical: 'https://tallypadi.com/faq',
  },
  openGraph: {
    title: 'Frequently Asked Questions (FAQ) | TallyPadi',
    description: 'How to use TallyPadi, pricing details, and troubleshooting guide.',
    url: 'https://tallypadi.com/faq',
    type: 'website',
  },
};

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
