import type { Metadata } from 'next';
import MarketplaceClient from './MarketplaceClient';

export const metadata: Metadata = {
  title: 'TallyPadi Marketplace - Shop Products From Local Businesses',
  description:
    'Discover products from independent businesses, search by location or category, and chat directly with sellers on WhatsApp.',
  keywords: [
    'TallyPadi Marketplace',
    'Nigeria online marketplace',
    'African SME marketplace',
    'shop fronts Nigeria',
    'product marketplace Nigeria',
    'verified seller marketplace Nigeria',
    'storefront ads Nigeria',
    'business management marketplace',
  ],
  alternates: {
    canonical: 'https://tallypadi.com/marketplace',
  },
  openGraph: {
    title: 'TallyPadi Marketplace - Shop Local Businesses',
    description:
      'Discover products near you and chat directly with independent sellers on WhatsApp.',
    url: 'https://tallypadi.com/marketplace',
    siteName: 'TallyPadi',
    images: [{ url: 'https://tallypadi.com/og.png', width: 1200, height: 630, alt: 'TallyPadi Marketplace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TallyPadi Marketplace',
    description: 'Discover products from independent local businesses and chat directly with sellers.',
    images: ['https://tallypadi.com/og.png'],
  },
};

export default function MarketplacePage() {
  return <MarketplaceClient />;
}
