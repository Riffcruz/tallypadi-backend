import { API_URL, SITE_URL, urlSetXml, xmlResponse, type SitemapEntry } from '../../../../lib/sitemapXml';

export const revalidate = 3600;

type Product = {
  id: string;
  isBoosted?: boolean;
  updatedAt?: string;
  shop?: { slug?: string };
};

type MarketplaceResponse = { products?: Product[] };

export async function GET(_request: Request, context: { params: Promise<{ page: string }> }) {
  const { page: rawPage } = await context.params;
  const page = Math.max(1, Number(rawPage) || 1);
  const response = await fetch(`${API_URL}/marketplace?limit=48&page=${page}&sort=recommended`, {
    next: { revalidate: 3600 },
  });
  if (!response.ok) return xmlResponse(urlSetXml([]));

  const data = (await response.json()) as MarketplaceResponse;
  const products = Array.isArray(data.products) ? data.products : [];
  const entries: SitemapEntry[] = products.map((product) => ({
    url: `${SITE_URL}/marketplace/product/${product.id}`,
    lastModified: product.updatedAt,
    changeFrequency: 'daily',
    priority: product.isBoosted ? 0.9 : 0.7,
  }));

  const shopSlugs = Array.from(new Set(products.map((product) => product.shop?.slug).filter(Boolean))) as string[];
  entries.push(...shopSlugs.map((slug) => ({
    url: `${SITE_URL}/shop/${encodeURIComponent(slug)}`,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  })));

  return xmlResponse(urlSetXml(entries));
}
