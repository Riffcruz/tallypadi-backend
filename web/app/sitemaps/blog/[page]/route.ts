import { API_URL, SITE_URL, urlSetXml, xmlResponse } from '../../../../lib/sitemapXml';

export const revalidate = 3600;

type BlogPost = { slug: string; updatedAt?: string; publishedAt?: string };
type BlogResponse = { posts?: BlogPost[] };

export async function GET(_request: Request, context: { params: Promise<{ page: string }> }) {
  const { page: rawPage } = await context.params;
  const page = Math.max(1, Number(rawPage) || 1);
  const response = await fetch(`${API_URL}/blog?limit=50&page=${page}`, { next: { revalidate: 3600 } });
  if (!response.ok) return xmlResponse(urlSetXml([]));

  const data = (await response.json()) as BlogResponse;
  const posts = Array.isArray(data.posts) ? data.posts : [];
  return xmlResponse(urlSetXml(posts.map((post) => ({
    url: `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`,
    lastModified: post.updatedAt || post.publishedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))));
}
