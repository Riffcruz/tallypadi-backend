import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, CalendarDays, Megaphone, ReceiptText, Warehouse } from 'lucide-react';
import MarketingNavbar from '../../components/MarketingNavbar';
import MarketingFooter from '../../components/MarketingFooter';
import { fetchBlogPosts } from './blogApi';

export const metadata: Metadata = {
  title: 'TallyPadi Blog - Business Management Tips for African SMEs',
  description:
    'Read practical guides about WhatsApp POS, receipts, inventory, storefronts, marketplace product boosts, and business growth for Nigerian and African SMEs.',
  keywords: [
    'TallyPadi blog',
    'business management tips Nigeria',
    'business management tips Africa',
    'business management software Nigeria',
    'business management software Africa',
    'WhatsApp POS Nigeria',
    'inventory management guide Nigeria',
    'send ads to facebook',
    'send ads to instagram',
    'send ads to tiktok',
    'send ads to google',
  ],
  alternates: {
    canonical: 'https://tallypadi.com/blog',
  },
  openGraph: {
    title: 'TallyPadi Blog',
    description: 'Business management, WhatsApp POS, inventory, receipts, storefront, and ads guides for African SMEs.',
    url: 'https://tallypadi.com/blog',
  },
};

const starterGuides = [
  {
    title: 'How to grow a small business with better records',
    text: 'Use sales tracking, inventory records, receipts, and customer data to make better decisions.',
    href: '/best-way-to-grow-business',
    icon: BookOpen,
  },
  {
    title: 'Send receipts via WhatsApp',
    text: 'Generate branded PDF receipts and share them where your customers already chat.',
    href: '/whatsapp-receipt-generator',
    icon: ReceiptText,
  },
  {
    title: 'Manage inventory and stock',
    text: 'Track product movement, low stock, best sellers, and stock value from your dashboard.',
    href: '/inventory-stock-management',
    icon: Warehouse,
  },
  {
    title: 'Boost products to your storefront',
    text: 'Publish products to your shop link and route ads from Meta, TikTok, Google, or Marketplace to product pages.',
    href: '/product-catalog-shop-link-generator',
    icon: Megaphone,
  },
];

const formatDate = (value?: string) => {
  if (!value) return 'Fresh guide';
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(value));
};

export default async function BlogPage() {
  const posts = await fetchBlogPosts(36);

  return (
    <div className="min-h-screen bg-[#f7f0df] text-stone-900">
      <MarketingNavbar />
      <main className="pt-24">
        <section className="relative overflow-hidden border-b border-stone-200">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(22,101,52,0.10),transparent_35%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.20),transparent_30%)]" />
          <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
            <p className="inline-flex rounded-full border border-emerald-200 bg-white/70 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              TallyPadi Blog
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black text-stone-950 sm:text-6xl">
              Practical business guides for shop owners.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-stone-700 sm:text-lg">
              Learn how to record sales, send receipts via WhatsApp, manage inventory and stock, publish products to a public shop link, and promote products to your storefront.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">Latest articles</p>
              <h2 className="mt-2 text-3xl font-black text-stone-950">From the TallyPadi team</h2>
            </div>
            <Link href="/contact" className="inline-flex items-center gap-2 text-sm font-black text-emerald-700 hover:text-emerald-900">
              Suggest a topic <ArrowRight size={15} />
            </Link>
          </div>

          {posts.length > 0 ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow-lg"
                >
                  {post.coverImage ? (
                    <img src={post.coverImage} alt={post.coverImageAlt || post.title} className="h-52 w-full object-cover" />
                  ) : (
                    <div className="flex h-52 items-center justify-center bg-emerald-950 text-emerald-100">
                      <BookOpen size={34} />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-700">
                      {post.category && <span>{post.category}</span>}
                      <span className="inline-flex items-center gap-1 text-stone-500">
                        <CalendarDays size={13} /> {formatDate(post.publishedAt)}
                      </span>
                    </div>
                    <h3 className="mt-4 line-clamp-2 text-xl font-black text-stone-950">{post.title}</h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-stone-700">{post.excerpt}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-700 group-hover:text-emerald-900">
                      Read article <ArrowRight size={15} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-lg border border-dashed border-stone-300 bg-white/70 p-8 text-stone-700">
              No published articles yet. Your admin-published posts will appear here automatically.
            </div>
          )}
        </section>

        <section className="border-y border-stone-200 bg-white/55">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-700">Starter guides</p>
            <h2 className="mt-2 text-3xl font-black text-stone-950">Business management topics people search for</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {starterGuides.map((post) => {
                const Icon = post.icon;
                return (
                  <Link key={post.href} href={post.href} className="group rounded-lg border border-stone-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-lg">
                    <Icon size={28} className="text-emerald-700" />
                    <h3 className="mt-5 text-xl font-black text-stone-950">{post.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-stone-700">{post.text}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-700 group-hover:text-emerald-900">
                      Read guide <ArrowRight size={15} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
