import { API_URL, SITE_URL, sitemapIndexXml, xmlResponse } from '../../lib/sitemapXml';

export const revalidate = 3600;

type CountResponse = { pagination?: { totalPages?: number } };

const getPages = async (url: string) => {
  try {
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return 1;
    const data = (await response.json()) as CountResponse;
    return Math.max(1, Number(data.pagination?.totalPages) || 1);
  } catch {
    return 1;
  }
};

export async function GET() {
  const [marketplacePages, blogPages] = await Promise.all([
    getPages(`${API_URL}/marketplace?limit=48&page=1`),
    getPages(`${API_URL}/blog?limit=50&page=1`),
  ]);

  const sitemaps = [
    `${SITE_URL}/sitemaps/static.xml`,
    ...Array.from({ length: marketplacePages }, (_, index) => `${SITE_URL}/sitemaps/marketplace/${index + 1}`),
    ...Array.from({ length: blogPages }, (_, index) => `${SITE_URL}/sitemaps/blog/${index + 1}`),
  ];

  return xmlResponse(sitemapIndexXml(sitemaps));
}
