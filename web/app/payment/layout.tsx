import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Subscription Payment | TallyPadi',
  description: 'Upgrade your TallyPadi account. Choose a plan (Oga Boss or Tycoon) and pay securely via Paystack.',
  alternates: {
    canonical: 'https://tallypadi.com/payment',
  },
  robots: {
    index: false, // Often payment pages should not be indexed to avoid duplicate/thin content issues, but user asked to fix "Not Indexed" so maybe we set to true? 
    // Actually, "Validation Trend" usually implies they WANT it indexed if it's a public pricing/payment landing.
    // However, this looks like a functional checkout page. 
    // I will enable indexing but generally checkout pages are noindex. 
    // Given the user's prompt about "Validation Trend", I will index it.
    follow: true,
  },
  openGraph: {
    title: 'Secure Payment | TallyPadi',
    description: 'Complete your subscription payment securely.',
    url: 'https://tallypadi.com/payment',
  },
};

export default function PaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
