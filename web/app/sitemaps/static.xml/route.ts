import { SITE_URL, urlSetXml, xmlResponse, type SitemapEntry } from '../../../lib/sitemapXml';

export const revalidate = 86400;

const paths = [
  '/', '/help', '/marketplace', '/about', '/contact', '/blog', '/partners', '/faq',
  '/privacy-policy', '/terms-of-service', '/policy', '/whatsapp-receipt-generator',
  '/free-invoice-generator', '/sales-tracking-ledger', '/inventory-stock-management',
  '/product-catalog-shop-link-generator', '/accounts-receivable-debtors-tracking',
  '/receiptbuddy-alternative', '/nairatrack-alternative', '/tallyprime-whatsapp-alternative',
  '/whatsapp-receipt-generator-nigeria', '/best-way-to-grow-business',
];

export async function GET() {
  const deployedAt = new Date();
  const entries: SitemapEntry[] = paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: deployedAt,
    changeFrequency: path === '/marketplace' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : path === '/marketplace' ? 0.9 : 0.8,
  }));
  return xmlResponse(urlSetXml(entries));
}
