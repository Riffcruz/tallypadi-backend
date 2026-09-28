import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BadgeCheck, ExternalLink, MapPin, MessageCircle, TrendingUp } from 'lucide-react';
import MarketplaceFooter from '../../../../components/marketplace/MarketplaceFooter';
import MarketplaceHeader from '../../../../components/marketplace/MarketplaceHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tallypadi.com';

type MarketplaceProduct = {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  category?: string;
  description?: string;
  colors?: string[];
  sizes?: string[];
  isBoosted?: boolean;
  smartCategory?: {
    id: string;
    label: string;
  };
  seo?: {
    title?: string;
    metaDescription?: string;
    adDescription?: string;
    keywords?: string[];
    source?: string;
    generatedAt?: string;
  };
  shop: {
    name: string;
    slug?: string;
    phone?: string;
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
};

type ProductResponse = { product?: MarketplaceProduct };
type ListingsResponse = { products?: MarketplaceProduct[] };
type Props = { params: Promise<{ productId: string }> };

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

const truncate = (value: string, maxLength: number) => {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}` : clean;
};

const getLocationText = (product: MarketplaceProduct) => [
  product.shop.location?.address,
  product.shop.location?.city,
  product.shop.location?.state,
].filter(Boolean).join(', ');

const getDescription = (product: MarketplaceProduct) => {
  return product.seo?.metaDescription
    || product.description
    || `${product.name} from ${product.shop.name}${getLocationText(product) ? ` in ${getLocationText(product)}` : ''}. View price, product details, available options, and advertiser details on TallyPadi.`;
};

const getProduct = async (productId: string) => {
  const res = await fetch(`${API_URL}/marketplace/products/${encodeURIComponent(productId)}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as ProductResponse;
  return data.product || null;
};

const getSimilarProducts = async (product: MarketplaceProduct) => {
  const params = new URLSearchParams({ limit: '12', sort: 'recommended' });
  const category = product.smartCategory?.id || product.category;
  if (category) params.set('category', category);

  const res = await fetch(`${API_URL}/marketplace?${params.toString()}`, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const data = (await res.json()) as ListingsResponse;
  return (data.products || [])
    .filter((candidate) => candidate.id !== product.id)
    .sort((a, b) => Number(Boolean(b.isBoosted)) - Number(Boolean(a.isBoosted)))
    .slice(0, 4);
};

const buildWhatsAppLink = (product: MarketplaceProduct) => {
  const phone = String(product.shop.phone || '').replace(/[^\d]/g, '');
  if (!phone) return null;
  const url = `${SITE_URL}/marketplace/product/${product.id}`;
  const message = `Hello ${product.shop.name}, I saw ${product.name} on TallyPadi Marketplace. Is it available?\n\n${url}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId } = await params;
  const product = await getProduct(productId);

  if (!product) return { title: 'Product Not Found | TallyPadi Marketplace' };

  const title = truncate(product.seo?.title || `${product.name} | ${product.shop.name} on TallyPadi`, 65);
  const description = truncate(getDescription(product), 170);
  const canonical = `${SITE_URL}/marketplace/product/${product.id}`;
  const keywords = product.seo?.keywords || [product.name, product.category || '', product.shop.name].filter(Boolean);

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      siteName: 'TallyPadi Marketplace',
      images: product.image ? [{ url: product.image, alt: product.name }] : [{ url: `${SITE_URL}/og.png`, alt: 'TallyPadi Marketplace' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: product.image ? [product.image] : [`${SITE_URL}/og.png`],
    },
  };
}

export default async function MarketplaceProductPage({ params }: Props) {
  const { productId } = await params;
  const product = await getProduct(productId);
  if (!product) notFound();
  const similarProducts = await getSimilarProducts(product);

  const whatsappLink = buildWhatsAppLink(product);
  const locationText = getLocationText(product);
  const visibleDescription = product.description || `${product.name} from ${product.shop.name}. Contact the seller for availability and product details.`;
  const productUrl = `${SITE_URL}/marketplace/product/${product.id}`;
  const shopUrl = product.shop.slug ? `/shop/${product.shop.slug}` : '/marketplace';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: visibleDescription,
    image: product.image ? [product.image] : undefined,
    category: product.category,
    brand: {
      '@type': 'Brand',
      name: product.shop.name,
    },
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.shop.currencyCode || 'NGN',
      availability: 'https://schema.org/InStock',
      url: productUrl,
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: product.shop.name,
      },
      areaServed: locationText || undefined,
    },
  };

  return (
    <div className="min-h-screen bg-[#f7fbf8] text-stone-950">
      <MarketplaceHeader />
      <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm font-black text-emerald-800 hover:text-emerald-950">
          <ArrowLeft size={17} />
          Back to Marketplace
        </Link>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="aspect-[4/3] bg-emerald-50">
            {product.image ? (
              <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-7xl font-black uppercase text-emerald-700">
                {product.name.slice(0, 1)}
              </div>
            )}
          </div>

          <div className="space-y-6 p-5 sm:p-7">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {product.isBoosted && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2.5 py-1 text-xs font-black text-stone-950">
                    <TrendingUp size={13} />
                    Sponsored
                  </span>
                )}
                {product.category && (
                  <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800">
                    {product.category}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black leading-tight tracking-tight text-stone-950 sm:text-4xl">
                {product.name}
              </h1>
              <p className="mt-3 text-3xl font-black text-emerald-700">
                {formatMoney(product.price, product.shop.currencyCode)}
              </p>
            </div>

            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-stone-500">Description</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-stone-700">
                {visibleDescription}
              </p>
            </div>

            {(product.colors?.length || product.sizes?.length) ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {product.colors?.length ? (
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.14em] text-stone-500">Available colors</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.colors.map((color) => (
                        <span key={color} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-bold text-stone-700">
                          {color}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {product.sizes?.length ? (
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-[0.14em] text-stone-500">Available sizes</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.sizes.map((size) => (
                        <span key={size} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-bold text-stone-700">
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
          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Advertiser details</p>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-black text-stone-950">
              <span>{product.shop.name}</span>
              {product.shop.verification?.verified && (
                <span title={product.shop.verification.label || 'Verified seller'} className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs font-black text-sky-700">
                  <BadgeCheck size={14} fill="currentColor" />
                  Verified
                </span>
              )}
            </h2>
            {locationText && (
              <p className="mt-3 flex items-start gap-2 text-sm font-semibold leading-6 text-stone-600">
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
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
                >
                  <MessageCircle size={17} />
                  Chat advertiser
                </a>
              )}
              <Link
                href={shopUrl}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-3 text-sm font-black text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
              >
                View shop
                <ExternalLink size={15} />
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-black text-amber-950">Buyer note</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-amber-900">
              Confirm availability, exact color or size, delivery, and payment terms with the advertiser before paying.
            </p>
          </div>
        </aside>
        </div>
      </section>

      {similarProducts.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">More in this category</p>
              <h2 className="mt-1 text-2xl font-black text-stone-950">Similar adverts</h2>
            </div>
            <Link href={`/marketplace${product.smartCategory?.id ? `?category=${encodeURIComponent(product.smartCategory.id)}` : ''}`} className="text-sm font-black text-emerald-700 hover:text-emerald-900">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
            {similarProducts.map((item) => (
              <Link key={item.id} href={`/marketplace/product/${item.id}`} className="group overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative aspect-square overflow-hidden bg-emerald-50 sm:aspect-[4/3]">
                  {item.image ? <img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-4xl font-black uppercase text-emerald-700">{item.name.slice(0, 1)}</div>}
                  {item.isBoosted && <span className="absolute left-2 top-2 rounded bg-amber-300 px-2 py-1 text-[10px] font-black uppercase text-stone-950">Sponsored</span>}
                </div>
                <div className="p-3 sm:p-4">
                  <p className="line-clamp-2 text-sm font-black text-stone-950">{item.name}</p>
                  <p className="mt-2 text-sm font-black text-emerald-700">{formatMoney(item.price, item.shop.currencyCode)}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-stone-500">{item.shop.name}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
      <MarketplaceFooter />
    </div>
  );
}
