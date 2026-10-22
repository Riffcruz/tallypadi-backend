'use client';

import Link from 'next/link';
import { State } from 'country-state-city';
import { BadgeCheck, ExternalLink, MapPin, MessageCircle, Store, TrendingUp } from 'lucide-react';
import type { MarketplaceProduct } from '../../lib/marketplaceTypes';
import MarketplaceImage from './MarketplaceImage';

const formatMoney = (amount: number, currencyCode = 'NGN') => {
  const localeMap: Record<string, string> = {
    NGN: 'en-NG', USD: 'en-US', GBP: 'en-GB', EUR: 'de-DE', GHS: 'en-GH', KES: 'en-KE', ZAR: 'en-ZA',
  };
  return new Intl.NumberFormat(localeMap[currencyCode] || 'en-NG', {
    style: 'currency', currency: currencyCode, maximumFractionDigits: 0,
  }).format(amount || 0);
};

const titleCase = (value?: string) => String(value || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(' ');

const getStateLabel = (stateCode?: string, countryCode = 'NG') => {
  if (!stateCode) return '';
  return State.getStateByCodeAndCountry(stateCode, countryCode)?.name || stateCode;
};

const buildWhatsAppLink = (product: MarketplaceProduct) => {
  const phone = String(product.shop.phone || '').replace(/[^\d]/g, '');
  if (!phone) return null;
  const shopUrl = `https://tallypadi.com/marketplace/product/${product.id}`;
  const message = `Hello ${product.shop.name}, I saw ${product.name} on TallyPadi Marketplace. Is it available?\n\n${shopUrl}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

function ProductImage({ product, compact = false }: { product: MarketplaceProduct; compact?: boolean }) {
  if (!product.image) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-emerald-50 font-black uppercase text-emerald-700 ${compact ? 'text-3xl' : 'text-5xl'}`}>
        {product.name.slice(0, 1)}
      </div>
    );
  }

  return (
    <MarketplaceImage
      src={product.image}
      alt={product.name}
      sizes={compact ? '88px' : '(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw'}
      className="object-cover transition duration-500 group-hover:scale-105"
    />
  );
}

export function MarketplaceProductCard({ product }: { product: MarketplaceProduct }) {
  const productUrl = `/marketplace/product/${product.id}`;
  const locationText = [
    product.shop.location?.city,
    getStateLabel(product.shop.location?.state, product.shop.location?.country || 'NG'),
  ].filter(Boolean).join(', ');
  const whatsappLink = buildWhatsAppLink(product);

  return (
    <article className={`group flex h-full flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${product.isBoosted ? 'border-amber-300 shadow-amber-100' : 'border-stone-200'}`}>
      <Link href={productUrl} className="relative block aspect-square overflow-hidden bg-stone-100 sm:aspect-[4/3]">
        <ProductImage product={product} />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5 sm:left-3 sm:top-3 sm:gap-2">
          {product.isBoosted && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-1 text-[11px] font-black text-stone-950 shadow">
              <TrendingUp size={12} /> Boosted
            </span>
          )}
          <span className="hidden rounded-md bg-white/90 px-2 py-1 text-[11px] font-black text-emerald-800 shadow sm:inline-flex">
            {product.smartCategory.label}
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="text-base font-black text-emerald-700 sm:text-lg">{formatMoney(product.price, product.shop.currencyCode)}</p>
        <Link href={productUrl} className="mt-1 line-clamp-2 block text-sm font-black leading-snug text-stone-950 hover:text-emerald-700">
          {titleCase(product.name)}
        </Link>

        {product.description && <p className="mb-3 mt-2 hidden line-clamp-2 text-xs leading-relaxed text-stone-500 sm:block">{product.description}</p>}

        <div className="mt-auto space-y-2 border-t border-stone-100 pt-2.5 sm:space-y-3 sm:pt-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-sm font-bold text-stone-800">
              <Store size={14} className="shrink-0 text-emerald-700" />
              <span className="truncate">{product.shop.name}</span>
              {product.shop.verification?.verified && (
                <span title={product.shop.verification.label || 'Verified'} className="inline-flex shrink-0 text-blue-500">
                  <BadgeCheck size={16} fill="currentColor" stroke="white" />
                </span>
              )}
            </div>
            {locationText && (
              <div className="mt-1 hidden items-center gap-1.5 text-xs font-semibold text-stone-500 sm:flex">
                <MapPin size={13} className="text-amber-600" /><span className="truncate">{locationText}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link href={productUrl} className="hidden items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 sm:inline-flex">
              Details <ExternalLink size={13} />
            </Link>
            {whatsappLink ? (
              <a href={whatsappLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700">
                <MessageCircle size={13} /> Chat
              </a>
            ) : (
              <Link href={productUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700">
                <MessageCircle size={13} /> Ask
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function MarketplaceSponsoredProductCard({ product }: { product: MarketplaceProduct }) {
  return (
    <Link href={`/marketplace/product/${product.id}`} className="group grid min-w-[260px] grid-cols-[88px_1fr] overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md sm:min-w-0">
      <div className="relative aspect-square overflow-hidden bg-emerald-50"><ProductImage product={product} compact /></div>
      <div className="min-w-0 p-3">
        <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-900">Sponsored</span>
        <h3 className="mt-1.5 line-clamp-1 text-sm font-black text-stone-950 group-hover:text-emerald-700">{titleCase(product.name)}</h3>
        <p className="mt-1 text-sm font-black text-emerald-700">{formatMoney(product.price, product.shop.currencyCode)}</p>
        <p className="mt-1 truncate text-xs font-semibold text-stone-500">{product.shop.name}</p>
      </div>
    </Link>
  );
}
