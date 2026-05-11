import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BadgeCheck, ExternalLink, MapPin, MessageCircle, PackageCheck, Store, TrendingUp } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tallypadi.com';

type ShopInfo = {
  name: string;
  description?: string;
  heroImageUrl?: string;
  phone?: string;
  themeColor?: string;
  currencyCode?: string;
  location?: {
    country?: string;
    state?: string;
    city?: string;
    address?: string;
  };
  verification?: {
    verified?: boolean;
    label?: string | null;
  };
};

type ShopProduct = {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  category?: string;
  description?: string;
  colors?: string[];
  sizes?: string[];
  inStock: boolean;
  isBoosted?: boolean;
  seo?: {
    title?: string;
    metaDescription?: string;
    adDescription?: string;
    keywords?: string[];
  };
};

type ShopResponse = { shop?: ShopInfo };
type Props = { params: Promise<{ slug: string; productId: string }> };

const normalizeImageUrl = (image?: string | null) => {
  if (!image) return '';
  if (image.startsWith('http') || image.startsWith('data:')) return image;
  const baseUrl = API_URL.replace(/\/api\/?$/, '');
  return `${baseUrl}${image.startsWith('/') ? '' : '/'}${image}`;
};

const truncate = (value: string, maxLength: number) => {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength - 1).trim() : clean;
};

const formatMoney = (amount: number, currencyCode = 'NGN') => {
  const localeMap: Record<string, string> = {
    NGN: 'en-NG',
    USD: 'en-US',
    GBP: 'en-GB',
    EUR: 'de-DE',
    GHS: 'en-GH',
    KES: 'en-KE',
    ZAR: 'en-ZA',
  };

  return new Intl.NumberFormat(localeMap[currencyCode] || 'en-NG', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

const getShop = async (slug: string) => {
  const res = await fetch(`${API_URL}/shop/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as ShopResponse;
  return data.shop || null;
};

const getProduct = async (slug: string, productId: string) => {
  const res = await fetch(`${API_URL}/shop/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return (await res.json()) as ShopProduct;
};

const getLocationText = (shop: ShopInfo) => [
  shop.location?.address,
  shop.location?.city,
  shop.location?.state,
].filter(Boolean).join(', ');

const getDescription = (product: ShopProduct, shop: ShopInfo) => {
  const location = getLocationText(shop);
  return product.seo?.metaDescription
    || product.description
    || `${product.name} from ${shop.name}${location ? ` in ${location}` : ''}. View price, available options, and advertiser details on TallyPadi.`;
};

const buildWhatsAppLink = (product: ShopProduct, shop: ShopInfo, slug: string) => {
  const phone = String(shop.phone || '').replace(/[^\d]/g, '');
  if (!phone) return null;
  const url = `${SITE_URL}/shop/${slug}/product/${product.id}`;
  const message = `Hello ${shop.name}, I saw ${product.name} on your TallyPadi shop. Is it available?\n\n${url}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params;
  const [shop, product] = await Promise.all([
    getShop(slug),
    getProduct(slug, productId),
  ]);

  if (!shop || !product) return { title: 'Product Not Found | TallyPadi Shop' };

  const title = truncate(product.seo?.title || `${product.name} | ${shop.name}`, 65);
  const description = truncate(getDescription(product, shop), 170);
  const image = normalizeImageUrl(product.image) || normalizeImageUrl(shop.heroImageUrl) || '/og.png';
  const canonical = `/shop/${slug}/product/${product.id}`;
  const keywords = product.seo?.keywords || [product.name, product.category || '', shop.name].filter(Boolean);

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      siteName: shop.name,
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function ShopProductPage({ params }: Props) {
  const { slug, productId } = await params;
  const [shop, product] = await Promise.all([
    getShop(slug),
    getProduct(slug, productId),
  ]);

  if (!shop || !product) notFound();

  const themeColor = shop.themeColor || '#10b981';
  const image = normalizeImageUrl(product.image);
  const whatsappLink = buildWhatsAppLink(product, shop, slug);
  const locationText = getLocationText(shop);
  const visibleDescription = product.seo?.adDescription || product.description || getDescription(product, shop);
  const productUrl = `${SITE_URL}/shop/${slug}/product/${product.id}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: visibleDescription,
    image: image ? [image] : undefined,
    category: product.category,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: shop.currencyCode || 'NGN',
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: productUrl,
      seller: {
        '@type': 'Organization',
        name: shop.name,
      },
      areaServed: locationText || undefined,
    },
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="relative overflow-hidden text-white" style={{ backgroundColor: themeColor }}>
        {shop.heroImageUrl && (
          <img
            src={normalizeImageUrl(shop.heroImageUrl)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay"
          />
        )}
        <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href={`/shop/${slug}`} className="inline-flex items-center gap-2 text-sm font-black text-white">
            <ArrowLeft size={17} />
            Back to shop
          </Link>
          <Link href={`/shop/${slug}`} className="inline-flex min-w-0 items-center gap-2 font-black text-white">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
              <Store size={18} />
            </span>
            <span className="truncate">{shop.name}</span>
            {shop.verification?.verified && (
              <span title={shop.verification.label || 'Verified seller'} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-black text-sky-700">
                <BadgeCheck size={13} fill="currentColor" />
                Verified
              </span>
            )}
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8 lg:py-10">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="aspect-[4/3] bg-slate-100">
            {image ? (
              <img src={image} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-7xl font-black uppercase" style={{ color: themeColor }}>
                {product.name.slice(0, 1)}
              </div>
            )}
          </div>

          <div className="space-y-6 p-5 sm:p-7">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {product.isBoosted && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2.5 py-1 text-xs font-black text-slate-950">
                    <TrendingUp size={13} />
                    Sponsored
                  </span>
                )}
                {product.category && (
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                    {product.category}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                  <PackageCheck size={13} />
                  In stock
                </span>
              </div>
              <h1 className="text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
                {product.name}
              </h1>
              <p className="mt-3 text-3xl font-black" style={{ color: themeColor }}>
                {formatMoney(product.price, shop.currencyCode)}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Description</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">
                {visibleDescription}
              </p>
            </div>

            {(product.colors?.length || product.sizes?.length) ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {product.colors?.length ? (
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Available colors</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.colors.map((color) => (
                        <span key={color} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700">
                          {color}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {product.sizes?.length ? (
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Available sizes</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.sizes.map((size) => (
                        <span key={size} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700">
                          {size}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: themeColor }}>Advertiser details</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">{shop.name}</h2>
            {shop.description && (
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{shop.description}</p>
            )}
            {locationText && (
              <p className="mt-3 flex items-start gap-2 text-sm font-semibold leading-6 text-slate-600">
                <MapPin size={16} className="mt-1 text-amber-600" />
                {locationText}
              </p>
            )}

            <div className="mt-5 grid gap-2">
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-black text-white transition hover:opacity-90"
                  style={{ backgroundColor: themeColor }}
                >
                  <MessageCircle size={17} />
                  Chat advertiser
                </a>
              )}
              <Link
                href={`/shop/${slug}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                View shop
                <ExternalLink size={15} />
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-black text-amber-950">Buyer note</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-amber-900">
              Confirm the exact color, size, delivery option, and payment terms with the advertiser before paying.
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
