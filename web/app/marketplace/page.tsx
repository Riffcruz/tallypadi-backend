import type { Metadata } from 'next';
import MarketplaceClient from './MarketplaceClient';

export const metadata: Metadata = {
  title: 'TallyPadi Marketplace - SEO-Friendly Products From Nigerian Shop Fronts',
  description:
    'Search SEO-friendly product pages from active TallyPadi shop fronts by category, state, city, seller location, boost status, and verified seller signals.',
  keywords: [
    'TallyPadi Marketplace',
    'Nigeria online marketplace',
    'African SME marketplace',
    'shop fronts Nigeria',
    'product marketplace Nigeria',
    'SEO product pages Nigeria',
    'boosted marketplace products',
    'verified seller marketplace Nigeria',
    'storefront ads Nigeria',
    'business management marketplace',
  ],
  alternates: {
    canonical: 'https://tallypadi.com/marketplace',
  },
  openGraph: {
    title: 'TallyPadi Marketplace - Products From Nigerian Shop Fronts',
    description:
      'Find SEO-friendly product listings from active TallyPadi shop fronts by category, state, city, boost status, and seller location.',
    url: 'https://tallypadi.com/marketplace',
    siteName: 'TallyPadi',
    images: [{ url: 'https://tallypadi.com/og.png', width: 1200, height: 630, alt: 'TallyPadi Marketplace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TallyPadi Marketplace',
    description: 'Search SEO-friendly products from active TallyPadi shop fronts across Nigeria.',
    images: ['https://tallypadi.com/og.png'],
  },
};

export default function MarketplacePage() {
  return <MarketplaceClient />;
}
