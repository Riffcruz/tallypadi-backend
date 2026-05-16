import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { BlogPost, BlogBlockType, IBlogContentBlock, IBlogSeo } from '../models/blogPost.model';

const allowedBlockTypes = new Set<BlogBlockType>([
  'heading',
  'paragraph',
  'image',
  'quote',
  'list',
  'button',
  'callout',
  'divider',
]);

const allowedFontSizes = new Set(['sm', 'base', 'lg', 'xl', '2xl']);

const cleanString = (value: unknown, max = 5000) => String(value || '').trim().slice(0, max);

const getRouteParam = (value: unknown): string => {
  if (Array.isArray(value)) return String(value[0] || '');
  return typeof value === 'string' ? value : '';
};

const normalizeStringArray = (value: unknown, maxItems = 20, maxLength = 64): string[] => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return Array.from(new Set(
    raw
      .map((item) => cleanString(item, maxLength))
      .filter(Boolean)
  )).slice(0, maxItems);
};

const makeSlug = (value: unknown): string => {
  const base = cleanString(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return base || `blog-${Date.now()}`;
};

const ensureUniqueSlug = async (baseSlug: string, excludeId?: string): Promise<string> => {
  let slug = baseSlug;
  let counter = 2;

  while (true) {
    const query: Record<string, unknown> = { slug };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: excludeId };
    }

    const exists = await BlogPost.exists(query);
    if (!exists) return slug;

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
};

const normalizeBlocks = (value: unknown): IBlogContentBlock[] => {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 120).map((raw, index) => {
    const block = (raw || {}) as Record<string, unknown>;
    const requestedType = cleanString(block.type, 24) as BlogBlockType;
    const type = allowedBlockTypes.has(requestedType) ? requestedType : 'paragraph';
    const level = Math.min(4, Math.max(2, Number(block.level) || 2));
    const alignValue = cleanString(block.align, 12);
    const align = alignValue === 'center' || alignValue === 'right' ? alignValue : 'left';
    const fontSizeValue = cleanString(block.fontSize, 24);
    const fontSize = allowedFontSizes.has(fontSizeValue) ? fontSizeValue : 'base';

    return {
      id: cleanString(block.id, 64) || `block-${Date.now()}-${index}`,
      type,
      text: cleanString(block.text, 12000),
      level,
      items: normalizeStringArray(block.items, 60, 240),
      imageUrl: cleanString(block.imageUrl, 1000),
      alt: cleanString(block.alt, 180),
      caption: cleanString(block.caption, 240),
      href: cleanString(block.href, 1000),
      label: cleanString(block.label, 120),
      textColor: cleanString(block.textColor, 32),
      backgroundColor: cleanString(block.backgroundColor, 32),
      fontSize,
      align,
    };
  });
};

const normalizeSeo = (value: unknown): IBlogSeo => {
  const seo = (value || {}) as Record<string, unknown>;
  return {
    metaTitle: cleanString(seo.metaTitle, 70),
    metaDescription: cleanString(seo.metaDescription, 170),
    keywords: normalizeStringArray(seo.keywords, 24, 80),
    canonicalUrl: cleanString(seo.canonicalUrl, 300),
    ogImage: cleanString(seo.ogImage, 1000),
    noIndex: Boolean(seo.noIndex),
  };
};

const extractWords = (blocks: IBlogContentBlock[]): string[] => {
  const text = blocks
    .flatMap((block) => [block.text || '', block.label || '', ...(block.items || [])])
    .join(' ');
  return text.split(/\s+/).filter(Boolean);
};

const calculateReadingMinutes = (blocks: IBlogContentBlock[]): number => {
  const wordCount = extractWords(blocks).length;
  return Math.max(1, Math.ceil(wordCount / 220));
};

const buildPostPayload = async (body: Record<string, unknown>, existingId?: string) => {
  const title = cleanString(body.title, 180);
  if (!title) throw new Error('Title is required');

  const baseSlug = makeSlug(body.slug || title);
  const slug = await ensureUniqueSlug(baseSlug, existingId);
  const contentBlocks = normalizeBlocks(body.contentBlocks);

  return {
    title,
    slug,
    excerpt: cleanString(body.excerpt, 320),
    coverImage: cleanString(body.coverImage, 1000),
    coverImageAlt: cleanString(body.coverImageAlt, 180),
    category: cleanString(body.category, 80),
    tags: normalizeStringArray(body.tags, 16, 48),
    authorName: cleanString(body.authorName, 80) || 'TallyPadi Team',
    contentBlocks,
    seo: normalizeSeo(body.seo),
    readingMinutes: calculateReadingMinutes(contentBlocks),
  };
};

const publicProjection = '-createdBy -updatedBy -__v';
const blogCacheControl = 'no-store, no-cache, must-revalidate, proxy-revalidate';

export const listPublishedBlogPosts = async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', blogCacheControl);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const q = cleanString(req.query.q, 80);

    const query: Record<string, unknown> = {
      status: 'PUBLISHED',
      publishedAt: { $lte: new Date() },
      'seo.noIndex': { $ne: true },
    };

    if (q) query.$text = { $search: q };

    const posts = await BlogPost.find(query)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(limit)
      .select(publicProjection)
      .lean();

    return res.json({ posts });
  } catch (error) {
    console.error('listPublishedBlogPosts error:', error);
    return res.status(500).json({ error: 'Failed to load blog posts' });
  }
};

export const getPublishedBlogPostBySlug = async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', blogCacheControl);
    const slug = makeSlug(req.params.slug);
    const post = await BlogPost.findOne({
      slug,
      status: 'PUBLISHED',
      publishedAt: { $lte: new Date() },
    })
      .select(publicProjection)
      .lean();

    if (!post) return res.status(404).json({ error: 'Blog post not found' });
    return res.json({ post });
  } catch (error) {
    console.error('getPublishedBlogPostBySlug error:', error);
    return res.status(500).json({ error: 'Failed to load blog post' });
  }
};

export const listAdminBlogPosts = async (req: Request, res: Response) => {
  try {
    const status = cleanString(req.query.status, 20).toUpperCase();
    const q = cleanString(req.query.q, 80);
    const query: Record<string, unknown> = {};

    if (status === 'DRAFT' || status === 'PUBLISHED') query.status = status;
    if (q) query.$text = { $search: q };

    const posts = await BlogPost.find(query)
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    return res.json({ posts });
  } catch (error) {
    console.error('listAdminBlogPosts error:', error);
    return res.status(500).json({ error: 'Failed to load admin blog posts' });
  }
};

export const createAdminBlogPost = async (req: Request, res: Response) => {
  try {
    const payload = await buildPostPayload(req.body || {});
    const post = await BlogPost.create({
      ...payload,
      status: req.body?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      publishedAt: req.body?.status === 'PUBLISHED' ? new Date() : undefined,
      createdBy: req.user?.id,
      updatedBy: req.user?.id,
    });

    return res.status(201).json({ post });
  } catch (error) {
    console.error('createAdminBlogPost error:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create blog post' });
  }
};

export const updateAdminBlogPost = async (req: Request, res: Response) => {
  try {
    const id = getRouteParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await BlogPost.findById(id);
    if (!post) return res.status(404).json({ error: 'Blog post not found' });

    const payload = await buildPostPayload(req.body || {}, id);
    Object.assign(post, payload, { updatedBy: req.user?.id });
    await post.save();

    return res.json({ post });
  } catch (error) {
    console.error('updateAdminBlogPost error:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update blog post' });
  }
};

export const publishAdminBlogPost = async (req: Request, res: Response) => {
  try {
    const id = getRouteParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await BlogPost.findByIdAndUpdate(
      id,
      { status: 'PUBLISHED', publishedAt: new Date(), updatedBy: req.user?.id },
      { new: true }
    );

    if (!post) return res.status(404).json({ error: 'Blog post not found' });
    return res.json({ post });
  } catch (error) {
    console.error('publishAdminBlogPost error:', error);
    return res.status(500).json({ error: 'Failed to publish blog post' });
  }
};

export const unpublishAdminBlogPost = async (req: Request, res: Response) => {
  try {
    const id = getRouteParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await BlogPost.findByIdAndUpdate(
      id,
      { status: 'DRAFT', updatedBy: req.user?.id },
      { new: true }
    );

    if (!post) return res.status(404).json({ error: 'Blog post not found' });
    return res.json({ post });
  } catch (error) {
    console.error('unpublishAdminBlogPost error:', error);
    return res.status(500).json({ error: 'Failed to unpublish blog post' });
  }
};

export const deleteAdminBlogPost = async (req: Request, res: Response) => {
  try {
    const id = getRouteParam(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid post id' });

    const post = await BlogPost.findByIdAndDelete(id);
    if (!post) return res.status(404).json({ error: 'Blog post not found' });
    return res.json({ ok: true });
  } catch (error) {
    console.error('deleteAdminBlogPost error:', error);
    return res.status(500).json({ error: 'Failed to delete blog post' });
  }
};
