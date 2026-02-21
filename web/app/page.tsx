import type { Metadata } from 'next';
import Script from 'next/script';
import LandingPageClient from './LandingPageClient';

export const metadata: Metadata = {
  title: 'TallyPadi — The Smartest WhatsApp POS & Inventory Software',
  description:
    "Record sales, generate instant WhatsApp receipts, and track your shop's inventory automatically. The easiest accounting tool designed for African businesses. Start your free trial today.",
  alternates: {
    canonical: 'https://tallypadi.com/',
  },
  openGraph: {
    type: 'website',
    url: 'https://tallypadi.com/',
    title: 'TallyPadi — The Smartest WhatsApp POS & Inventory Software',
    description:
      'Turn your WhatsApp into a professional POS. Auto-sync sales, manage multiple branches, and recover debts instantly.',
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
    title: 'TallyPadi — The Smartest WhatsApp POS & Inventory Software',
    description:
      'Turn your WhatsApp into a professional POS. Auto-sync sales, manage multiple branches, and recover debts instantly.',
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
