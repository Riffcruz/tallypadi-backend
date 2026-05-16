import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock3, Share2 } from 'lucide-react';
import MarketingNavbar from '../../../components/MarketingNavbar';
import MarketingFooter from '../../../components/MarketingFooter';
import BlogRenderer from '../../../components/blog/BlogRenderer';
import { fetchBlogPost } from '../blogApi';

export const dynamic = 'force-dynamic';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tallypadi.com';

const formatDate = (value?: string) => {
  if (!value) return 'Fresh guide';
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'long' }).format(new Date(value));
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);

  if (!post) {
    return {
      title: 'Blog article not found - TallyPadi',
      robots: { index: false, follow: false },
    };
  }

  const title = post.seo?.metaTitle || `${post.title} - TallyPadi Blog`;
  const description = post.seo?.metaDescription || post.excerpt || 'Practical TallyPadi business management guide for African SMEs.';
  const canonical = post.seo?.canonicalUrl || `${siteUrl}/blog/${post.slug}`;
  const ogImage = post.seo?.ogImage || post.coverImage;

  return {
    title,
    description,
    keywords: post.seo?.keywords || post.tags || [],
    alternates: { canonical },
    robots: post.seo?.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: post.authorName ? [post.authorName] : ['TallyPadi Team'],
      images: ogImage ? [{ url: ogImage, alt: post.coverImageAlt || post.title }] : undefined,
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);

  if (!post) notFound();

  const canonical = post.seo?.canonicalUrl || `${siteUrl}/blog/${post.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.seo?.metaTitle || post.title,
    description: post.seo?.metaDescription || post.excerpt,
    image: post.seo?.ogImage || post.coverImage || undefined,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    author: {
      '@type': 'Organization',
      name: post.authorName || 'TallyPadi Team',
    },
    publisher: {
      '@type': 'Organization',
      name: 'TallyPadi',
      url: siteUrl,
    },
    mainEntityOfPage: canonical,
  };

  return (
    <div className="min-h-screen bg-[#f7f0df] text-stone-900">
      <MarketingNavbar />
      <main className="pt-24">
        <article>
          <header className="border-b border-stone-200">
            <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
              <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-black text-emerald-700 hover:text-emerald-900">
                <ArrowLeft size={16} /> Back to blog
              </Link>
              <div className="mt-8 flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-wider text-emerald-700">
                {post.category && <span>{post.category}</span>}
                <span className="inline-flex items-center gap-1 text-stone-500">
                  <CalendarDays size={14} /> {formatDate(post.publishedAt)}
                </span>
                <span className="inline-flex items-center gap-1 text-stone-500">
                  <Clock3 size={14} /> {post.readingMinutes || 1} min read
                </span>
              </div>
              <h1 className="mt-5 text-4xl font-black text-stone-950 sm:text-6xl">{post.title}</h1>
              {post.excerpt && <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-700">{post.excerpt}</p>}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-700 shadow-sm">
                  By {post.authorName || 'TallyPadi Team'}
                </span>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${post.title} ${canonical}`)}`}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-700"
                >
                  <Share2 size={15} /> Share
                </a>
              </div>
            </div>
            {post.coverImage && (
              <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
                <img
                  src={post.coverImage}
                  alt={post.coverImageAlt || post.title}
                  className="max-h-[560px] w-full rounded-lg object-cover shadow-xl"
                />
              </div>
            )}
          </header>

          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <BlogRenderer blocks={post.contentBlocks || []} />
            {(post.tags || []).length > 0 && (
              <div className="mt-12 flex flex-wrap gap-2 border-t border-stone-200 pt-8">
                {(post.tags || []).map((tag) => (
                  <span key={tag} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-stone-600 shadow-sm">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </article>
      </main>
      <MarketingFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
