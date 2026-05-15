import type { Metadata } from 'next';
import LandingPageClient from './LandingPageClient';

export const metadata: Metadata = {
  title: {
    absolute: 'TallyPadi — WhatsApp POS & Business Management Software for Africa',
  },
  description:
    'TallyPadi is a WhatsApp POS, receipt generator, inventory tracker, sales ledger, debtor manager, storefront, managed ads, and business management software for Nigerian and African SMEs. It works on phones, web, and compatible POS machines.',
  keywords: [
    'WhatsApp POS Africa',
    'WhatsApp POS Nigeria',
    'business management software Africa',
    'business management software Nigeria',
    'small business management app Africa',
    'inventory management software Nigeria',
    'stock management app Nigeria',
    'sales tracking app Africa',
    'sales ledger app Nigeria',
    'receipt generator Nigeria',
    'SME business tools Africa',
    'retail POS Nigeria',
    'debtor management Nigeria',
    'WhatsApp inventory tracker',
    'African retail software',
    'send ads to facebook',
    'send ads to instagram',
    'send ads to tiktok',
    'send ads to google',
    'send receipts via whatsapp',
    'manage inventory and stock',
    'record sales and track cash flow',
    'publish products to a public shop link',
    'publish products to TallyPadi Marketplace',
  ],
  alternates: {
    canonical: 'https://tallypadi.com/',
  },
  openGraph: {
    type: 'website',
    url: 'https://tallypadi.com/',
    title: 'TallyPadi — WhatsApp POS & Business Management Software for Africa',
    description:
      'Run sales, receipts, inventory, debtors, staff, storefronts, managed product boosts, and reports from WhatsApp, web, phones, and compatible POS machines. Built for Nigerian and African SMEs.',
    siteName: 'Tallypadi',
    images: [
      {
        url: 'https://tallypadi.com/og.png', // create this image later (recommended)
        width: 1200,
        height: 630,
        alt: 'TallyPadi WhatsApp POS and business management software',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TallyPadi — WhatsApp POS & Business Management Software',
    description:
      'Business management software for Nigerian and African SMEs: WhatsApp POS, POS machine support, receipts, inventory, storefronts, ads boosts, sales tracking, and debtors.',
    images: ['https://tallypadi.com/og.png'],
  },
};

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://tallypadi.com/#organization',
        name: 'TallyPadi',
        url: 'https://tallypadi.com',
        logo: 'https://tallypadi.com/logo.png',
        email: 'support@tallypadi.com',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Lagos',
          addressCountry: 'NG',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          telephone: '+2349035664420',
          email: 'support@tallypadi.com',
          areaServed: ['NG', 'Africa'],
          availableLanguage: ['English'],
        },
        areaServed: [
          { '@type': 'Country', name: 'Nigeria' },
          { '@type': 'Place', name: 'Africa' },
        ],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://tallypadi.com/#website',
        name: 'TallyPadi',
        url: 'https://tallypadi.com',
        inLanguage: 'en-NG',
        publisher: { '@id': 'https://tallypadi.com/#organization' },
        description:
          'WhatsApp POS and business management software for Nigerian and African SMEs.',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://tallypadi.com/#software',
        name: 'TallyPadi',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, WhatsApp',
        url: 'https://tallypadi.com',
        inLanguage: 'en-NG',
        publisher: { '@id': 'https://tallypadi.com/#organization' },
        description:
          'TallyPadi helps Nigerian and African SMEs record sales on WhatsApp, generate PDF receipts, track inventory, manage debtors, monitor staff, and understand business performance.',
        featureList: [
          'WhatsApp POS',
          'PDF receipt generator',
          'Inventory and stock management',
          'Sales tracking and business ledger',
          'Debtor and customer credit management',
          'Online storefront and product catalog',
          'Managed product boosts to storefront and product pages',
          'Staff and multi-branch workflows',
          'Compatible POS machine and tablet use',
          'Business reports for SMEs',
        ],
        audience: {
          '@type': 'BusinessAudience',
          audienceType: 'Retailers, wholesalers, service businesses, and SMEs',
          geographicArea: [
            { '@type': 'Country', name: 'Nigeria' },
            { '@type': 'Place', name: 'Africa' },
          ],
        },
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'NGN',
          lowPrice: '0',
          highPrice: '5000',
          offerCount: '3',
          offers: [
            {
              '@type': 'Offer',
              name: 'Free Trial',
              price: '0',
              priceCurrency: 'NGN',
            },
            {
              '@type': 'Offer',
              name: 'Oga Boss',
              price: '3000',
              priceCurrency: 'NGN',
            },
            {
              '@type': 'Offer',
              name: 'Tycoon',
              price: '5000',
              priceCurrency: 'NGN',
            },
          ],
        },
        areaServed: [
          { '@type': 'Country', name: 'Nigeria' },
          { '@type': 'Place', name: 'Africa' },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://tallypadi.com/#faq',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is TallyPadi?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'TallyPadi is WhatsApp POS and business management software for Nigerian and African SMEs. It helps shop owners record sales, send receipts, track stock, manage debtors, and view reports.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I use TallyPadi without buying POS hardware?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. TallyPadi works from WhatsApp and the web dashboard, so shop owners can record sales and manage inventory without expensive POS hardware. If you already use a compatible POS machine, tablet, or browser-based terminal, you can use TallyPadi there too.',
            },
          },
          {
            '@type': 'Question',
            name: 'Who is TallyPadi built for?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'TallyPadi is built for retailers, wholesalers, service businesses, and SMEs across Nigeria and Africa that need simple sales, receipts, inventory, customer, debtor, and business management tools.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can TallyPadi run ads to my storefront?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. Merchants can boost products so TallyPadi can route traffic to their storefront, marketplace listing, or product page. Campaigns are reviewed before submission and reporting can be shown in the dashboard.',
            },
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        id="tallypadi-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPageClient />
    </>
  );
}
