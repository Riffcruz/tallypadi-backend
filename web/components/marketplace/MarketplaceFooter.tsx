'use client';

import Link from 'next/link';
import { BadgeCheck, MapPin, Megaphone, Search, Store } from 'lucide-react';

const marketplaceLinks = [
  { href: '/marketplace?sort=recommended', label: 'Recommended products' },
  { href: '/marketplace?sort=newest', label: 'Newest products' },
  { href: '/product-catalog-shop-link-generator', label: 'Create a shop link' },
  { href: '/online-store', label: 'Seller storefront settings' },
];

const sellerLinks = [
  { href: '/ads-manager', label: 'Boost a product' },
  { href: '/online-store', label: 'Publish products' },
  { href: '/settings', label: 'Shop settings' },
  { href: '/contact', label: 'Marketplace support' },
];

export default function MarketplaceFooter() {
  return (
    <footer className="border-t border-emerald-100 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.1fr] lg:px-8">
        <div>
          <Link href="/marketplace" className="inline-flex items-center gap-2 text-lg font-black text-emerald-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white">
              <Store size={18} />
            </span>
            TallyPadi Marketplace
          </Link>
          <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-stone-600">
            Search products from active TallyPadi shop fronts. Listings are sorted by relevance, freshness, boost status, and seller readiness.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-emerald-800">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1">
              <Search size={13} /> SEO-friendly product pages
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2.5 py-1 text-sky-700">
              <BadgeCheck size={13} /> Verified seller badges
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">Browse</h3>
          <ul className="mt-4 space-y-3 text-sm font-bold text-stone-700">
            {marketplaceLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-emerald-700">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">For sellers</h3>
          <ul className="mt-4 space-y-3 text-sm font-bold text-stone-700">
            {sellerLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-emerald-700">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="flex items-center gap-2 text-sm font-black text-amber-950">
            <Megaphone size={17} />
            Product ranking note
          </h3>
          <p className="mt-3 text-sm font-medium leading-6 text-amber-900">
            TallyPadi can generate product SEO, marketplace descriptions, and boost signals so serious sellers get better visibility.
          </p>
          <p className="mt-3 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-800">
            <MapPin size={14} /> Location filters help nearby buyers find you
          </p>
        </div>
      </div>
    </footer>
  );
}
