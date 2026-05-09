import type { Metadata } from 'next';
import MarketplaceClient from './MarketplaceClient';

export const metadata: Metadata = {
  title: 'TallyPadi Marketplace - Products From Active Shop Fronts',
  description:
    'Search published products from TallyPadi shops by category, state, city, and seller location. Boosted products appear first.',
  alternates: {
    canonical: '/marketplace',
  },
  openGraph: {
    title: 'TallyPadi Marketplace',
    description:
      'Find products from active TallyPadi shop fronts by category, state, city, and seller location.',
    url: '/marketplace',
    siteName: 'TallyPadi',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'TallyPadi Marketplace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TallyPadi Marketplace',
    description: 'Search products from active TallyPadi shop fronts across Nigeria.',
    images: ['/og.png'],
  },
};

export default function MarketplacePage() {
  return <MarketplaceClient />;
}
