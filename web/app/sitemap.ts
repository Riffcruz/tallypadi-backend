import { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tallypadi.com';
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type MarketplaceSitemapProduct = {
  id: string;
  isBoosted?: boolean;
  createdAt?: string;
  shop?: {
    slug?: string;
  };
};

type MarketplaceSitemapResponse = {
  products?: MarketplaceSitemapProduct[];
};

type BlogSitemapPost = {
  slug: string;
  updatedAt?: string;
  publishedAt?: string;
};

type BlogSitemapResponse = {
  posts?: BlogSitemapPost[];
};

const fetchMarketplaceUrls = async (): Promise<MetadataRoute.Sitemap> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${apiUrl}/marketplace?limit=48&sort=recommended`, {
      next: { revalidate: 3600 },
      signal: controller.signal,
    });
    if (!res.ok) return [];

    const data = (await res.json()) as MarketplaceSitemapResponse;
    const products = Array.isArray(data.products) ? data.products : [];
    const shopSlugs = Array.from(new Set(
      products
        .map((product) => product.shop?.slug)
        .filter((slug): slug is string => Boolean(slug))
    ));

    return [
      ...products.map((product) => ({
        url: `${baseUrl}/marketplace/product/${product.id}`,
        lastModified: product.createdAt ? new Date(product.createdAt) : new Date(),
        changeFrequency: 'daily' as const,
        priority: product.isBoosted ? 0.95 : 0.75,
      })),
      ...shopSlugs.map((slug) => ({
        url: `${baseUrl}/shop/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
};

const fetchBlogUrls = async (): Promise<MetadataRoute.Sitemap> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${apiUrl}/blog?limit=100`, {
      next: { revalidate: 3600 },
      signal: controller.signal,
    });
    if (!res.ok) return [];

    const data = (await res.json()) as BlogSitemapResponse;
    const posts = Array.isArray(data.posts) ? data.posts : [];

    return posts
      .filter((post) => post.slug)
      .map((post) => ({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: post.updatedAt || post.publishedAt ? new Date(post.updatedAt || post.publishedAt || '') : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.75,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [marketplaceUrls, blogUrls] = await Promise.all([
    fetchMarketplaceUrls(),
    fetchBlogUrls(),
  ]);

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/marketplace`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/partners`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/terms-of-service`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/policy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // New SEO Landing Pages
    {
      url: `${baseUrl}/whatsapp-receipt-generator`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/free-invoice-generator`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/sales-tracking-ledger`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/inventory-stock-management`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/product-catalog-shop-link-generator`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/accounts-receivable-debtors-tracking`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/receiptbuddy-alternative`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/nairatrack-alternative`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tallyprime-whatsapp-alternative`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/whatsapp-receipt-generator-nigeria`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // Growth education page
    {
      url: `${baseUrl}/best-way-to-grow-business`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0, 
    },
    ...blogUrls,
    ...marketplaceUrls,
  ];
}
