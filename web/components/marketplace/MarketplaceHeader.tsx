'use client';

import Link from 'next/link';
import { Store } from 'lucide-react';

export default function MarketplaceHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-emerald-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-white">
            <Store size={18} />
          </span>
          <span className="text-lg font-black tracking-tight text-emerald-900">TallyPadi</span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          <Link href="/" className="text-sm font-bold text-stone-600 hover:text-emerald-700">Home</Link>
          <Link href="/marketplace" className="text-sm font-black text-emerald-700">Marketplace</Link>
          <Link href="/#pricing" className="text-sm font-bold text-stone-600 hover:text-emerald-700">Pricing</Link>
          <Link href="/help" className="text-sm font-bold text-stone-600 hover:text-emerald-700">Help</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/online-store"
            className="hidden rounded-lg border border-emerald-200 px-4 py-2 text-sm font-black text-emerald-800 transition hover:bg-emerald-50 sm:inline-flex"
          >
            Sell here
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700"
          >
            Start
          </Link>
        </div>
      </div>
    </header>
  );
}
