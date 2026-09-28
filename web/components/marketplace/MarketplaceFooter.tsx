'use client';

import Link from 'next/link';
import { Store } from 'lucide-react';

const links = [
  { href: '/marketplace', label: 'Shop' },
  { href: '/register', label: 'Sell' },
  { href: '/help', label: 'Help' },
  { href: '/privacy-policy', label: 'Privacy' },
];

export default function MarketplaceFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white">
            <Store size={17} />
          </span>
          <div>
            <p className="font-black text-emerald-950">TallyPadi Marketplace</p>
            <p className="text-xs text-stone-500">Shop directly from independent sellers.</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-stone-600" aria-label="Marketplace footer">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-emerald-700">{link.label}</Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-stone-100 px-4 py-4 text-center text-xs text-stone-400">
        © {new Date().getFullYear()} TallyPadi
      </div>
    </footer>
  );
}
