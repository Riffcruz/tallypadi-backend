export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tallypadi.com';
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const xmlResponse = (body: string) => new Response(body, {
  headers: {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  },
});

export const sitemapIndexXml = (urls: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join('\n')}
</sitemapindex>`;

export type SitemapEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: 'daily' | 'weekly' | 'monthly';
  priority?: number;
};

export const urlSetXml = (entries: SitemapEntry[]) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <url>
    <loc>${escapeXml(entry.url)}</loc>${entry.lastModified ? `
    <lastmod>${escapeXml(new Date(entry.lastModified).toISOString())}</lastmod>` : ''}${entry.changeFrequency ? `
    <changefreq>${entry.changeFrequency}</changefreq>` : ''}${entry.priority !== undefined ? `
    <priority>${entry.priority.toFixed(1)}</priority>` : ''}
  </url>`).join('\n')}
</urlset>`;
