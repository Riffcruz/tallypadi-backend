import type { Metadata } from 'next';
import Script from 'next/script';
import LandingPageClient from './LandingPageClient';

export const metadata: Metadata = {
  title: 'Tallypadi — Track Sales, Stock & Profit on WhatsApp',
  description:
    "Stop writing in notebooks. Manage inventory, staff, and sales directly inside WhatsApp. Built for Nigerian SMEs and vendors.",
  alternates: {
    canonical: 'https://tallypadi.com/',
  },
  openGraph: {
    type: 'website',
    url: 'https://tallypadi.com/',
    title: 'Tallypadi — Track Sales, Stock & Profit on WhatsApp',
    description:
      'Manage your shop inside WhatsApp. Record sales, track stock, and see profit reports.',
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
    title: 'Tallypadi — Track Sales, Stock & Profit on WhatsApp',
    description:
      'Record sales, manage inventory, and track profit directly in WhatsApp.',
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
      'Track sales, stock, and profit directly on WhatsApp. Built for SMEs and vendors.',
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
