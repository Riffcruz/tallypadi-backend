import type { Metadata } from 'next';
import Script from 'next/script';
import LandingPageClient from './LandingPageClient';

export const metadata: Metadata = {
  title: 'Tallypadi — WhatsApp Receipts, Invoices & Inventory Management',
  description:
    "The best WhatsApp receipt generator and inventory tool for businesses of any size. Track sales, debtors, and stock easily. Start for free.",
  alternates: {
    canonical: 'https://tallypadi.com/',
  },
  openGraph: {
    type: 'website',
    url: 'https://tallypadi.com/',
    title: 'Tallypadi — WhatsApp Receipts, Invoices & Inventory Management',
    description:
      'Send professional receipts on WhatsApp, track sales, and manage inventory automatically. Built for growing businesses.',
    siteName: 'Tallypadi',
    images: [
      {
        url: 'https://tallypadi.com/og.png', // create this image later (recommended)
        width: 1200,
        height: 630,
        alt: 'Tallypadi',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tallypadi — WhatsApp Receipts, Invoices & Inventory Management',
    description:
      'Send professional receipts on WhatsApp, track sales, and manage inventory automatically.',
    images: ['https://tallypadi.com/og.png'],
  },
};

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Tallypadi',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'Track sales, stock, and profit directly on WhatsApp. Generate receipts and invoices instantly. Built for businesses of all sizes.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NGN',
    },
    url: 'https://tallypadi.com',
  };

  return (
    <>
      {/* OPTIONAL: JSON-LD (not required for indexing, but safe here) */}
      <Script
        id="tallypadi-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPageClient />
    </>
  );
}
