import type { Metadata } from 'next';
import Script from 'next/script';
import LandingPageClient from './LandingPageClient';

export const metadata: Metadata = {
  title: 'TallyPadi — WhatsApp POS, Marketplace & Ads for Growing Shops',
  description:
    "Record sales, generate receipts, track inventory, publish products to a marketplace, and boost ads across TallyPadi, Google-ready search pages, Meta, and TikTok.",
  alternates: {
    canonical: 'https://tallypadi.com/',
  },
  openGraph: {
    type: 'website',
    url: 'https://tallypadi.com/',
    title: 'TallyPadi — WhatsApp POS, Marketplace & Ads for Growing Shops',
    description:
      'Run sales on WhatsApp, publish products to a shop front, and request product boosts across marketplace, search, Meta, and TikTok channels.',
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
    title: 'TallyPadi — WhatsApp POS, Marketplace & Ads for Growing Shops',
    description:
      'Run sales on WhatsApp, publish products to a shop front, and request product boosts across marketplace, search, Meta, and TikTok channels.',
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
      'Track sales, stock, and profit directly on WhatsApp. Generate receipts, publish products to a marketplace, and run product boosts across multiple ad channels.',
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
