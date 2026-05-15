'use client';

import React, { ChangeEvent, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  FilePlus2,
  Globe2,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  Megaphone,
  MousePointerClick,
  Palette,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Send,
  Trash2,
  Type,
  UploadCloud,
} from 'lucide-react';
import { uploadToR2 } from '../../src/utils/uploadToR2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type BlogStatus = 'DRAFT' | 'PUBLISHED';
type BlogBlockType = 'heading' | 'paragraph' | 'image' | 'quote' | 'list' | 'button' | 'callout' | 'divider';
type BlockAlign = 'left' | 'center' | 'right';
type EditorTab = 'content' | 'seo' | 'preview';
type StatusFilter = 'ALL' | BlogStatus;

interface BlogContentBlock {
  id: string;
  type: BlogBlockType;
  text?: string;
  level?: number;
  items?: string[];
  imageUrl?: string;
  alt?: string;
  caption?: string;
  href?: string;
  label?: string;
  textColor?: string;
  backgroundColor?: string;
  fontSize?: string;
  align?: BlockAlign;
}

interface BlogSeo {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  canonicalUrl: string;
  ogImage: string;
  noIndex: boolean;
}

interface BlogPost {
  _id?: string;
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  coverImageAlt: string;
  category: string;
  tags: string[];
  authorName: string;
  status: BlogStatus;
  contentBlocks: BlogContentBlock[];
  seo: BlogSeo;
  readingMinutes?: number;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const blockTypes: { value: BlogBlockType; label: string }[] = [
  { value: 'heading', label: 'Heading' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'image', label: 'Image' },
  { value: 'quote', label: 'Quote' },
  { value: 'list', label: 'Bullet list' },
  { value: 'button', label: 'Button/link' },
  { value: 'callout', label: 'Callout box' },
  { value: 'divider', label: 'Divider' },
];

const fontSizes = [
  { value: 'sm', label: 'Small' },
  { value: 'base', label: 'Normal' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'XL' },
  { value: '2xl', label: '2XL' },
];

const emptySeo = (): BlogSeo => ({
  metaTitle: '',
  metaDescription: '',
  keywords: [],
  canonicalUrl: '',
  ogImage: '',
  noIndex: false,
});

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createBlock = (type: BlogBlockType): BlogContentBlock => ({
  id: createId(),
  type,
  text: type === 'heading' ? 'New section heading' : type === 'paragraph' ? 'Write your article section here.' : '',
  level: 2,
  items: type === 'list' ? ['First point', 'Second point'] : [],
  imageUrl: '',
  alt: '',
  caption: '',
  href: '',
  label: type === 'button' ? 'Read more' : '',
  textColor: '',
  backgroundColor: '',
  fontSize: 'base',
  align: 'left',
});

const createEmptyPost = (): BlogPost => ({
  title: '',
  slug: '',
  excerpt: '',
  coverImage: '',
  coverImageAlt: '',
  category: '',
  tags: [],
  authorName: 'TallyPadi Team',
  status: 'DRAFT',
  contentBlocks: [
    createBlock('heading'),
    createBlock('paragraph'),
  ],
  seo: emptySeo(),
});

const normalizeArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
};

const normalizePost = (value: Partial<BlogPost> = {}): BlogPost => ({
  ...createEmptyPost(),
  ...value,
  _id: value._id || value.id,
  tags: normalizeArray(value.tags),
  contentBlocks: Array.isArray(value.contentBlocks) && value.contentBlocks.length > 0
    ? value.contentBlocks.map((block) => ({
      ...createBlock(block.type || 'paragraph'),
      ...block,
      id: block.id || createId(),
      align: block.align === 'center' || block.align === 'right' ? block.align : 'left',
      items: normalizeArray(block.items),
    }))
    : createEmptyPost().contentBlocks,
  seo: {
    ...emptySeo(),
    ...(value.seo || {}),
    keywords: normalizeArray(value.seo?.keywords),
    noIndex: Boolean(value.seo?.noIndex),
  },
});

const getPostId = (post: BlogPost) => String(post._id || post.id || '');

const commaList = (items: string[]) => items.join(', ');

const splitInputList = (value: string) => value
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const splitLines = (value: string) => value
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

const formatDate = (value?: string | null) => {
  if (!value) return 'Not published';
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const statusClass: Record<BlogStatus, string> = {
  DRAFT: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  PUBLISHED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

const fontSizeClass: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};

const buildPayload = (post: BlogPost) => ({
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  coverImage: post.coverImage,
  coverImageAlt: post.coverImageAlt,
  category: post.category,
  tags: post.tags,
  authorName: post.authorName,
  status: post.status,
  contentBlocks: post.contentBlocks,
  seo: post.seo,
});

function SeoCounter({ value, max, label }: { value: string; max: number; label: string }) {
  const length = value.trim().length;
  const ok = length > 0 && length <= max;
  return (
    <span className={`text-xs ${ok ? 'text-emerald-300' : length > max ? 'text-red-300' : 'text-slate-500'}`}>
      {label}: {length}/{max}
    </span>
  );
}

function PreviewBlock({ block }: { block: BlogContentBlock }) {
  const style: React.CSSProperties = {
    color: block.textColor || undefined,
    backgroundColor: block.backgroundColor || undefined,
    textAlign: block.align || 'left',
  };
  const sizeClass = fontSizeClass[block.fontSize || 'base'] || fontSizeClass.base;

  if (block.type === 'divider') return <hr className="my-8 border-slate-700" />;

  if (block.type === 'heading') {
    const headingClass = `font-black text-white ${block.level === 4 ? 'text-xl' : block.level === 3 ? 'text-2xl' : 'text-3xl'}`;
    return <h2 className={headingClass} style={style}>{block.text}</h2>;
  }

  if (block.type === 'image') {
    return (
      <figure className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
        {block.imageUrl ? (
          <img src={block.imageUrl} alt={block.alt || block.caption || 'Blog image'} className="max-h-[420px] w-full object-cover" />
        ) : (
          <div className="flex h-56 items-center justify-center text-sm text-slate-500">Image preview</div>
        )}
        {block.caption && <figcaption className="px-4 py-3 text-sm text-slate-400">{block.caption}</figcaption>}
      </figure>
    );
  }

  if (block.type === 'list') {
    return (
      <ul className={`list-disc space-y-3 pl-6 leading-8 text-slate-200 ${sizeClass}`} style={style}>
        {(block.items || []).map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>)}
      </ul>
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote className={`rounded-2xl border-l-4 border-emerald-400 bg-slate-800/70 p-5 italic leading-8 text-slate-100 ${sizeClass}`} style={style}>
        {block.text}
      </blockquote>
    );
  }

  if (block.type === 'button') {
    return (
      <a href={block.href || '#'} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400">
        {block.label || 'Open link'} <MousePointerClick size={16} />
      </a>
    );
  }

  if (block.type === 'callout') {
    return (
      <div className={`rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 leading-8 text-emerald-50 ${sizeClass}`} style={style}>
        {block.text}
      </div>
    );
  }

  return <p className={`leading-8 text-slate-200 ${sizeClass}`} style={style}>{block.text}</p>;
}

export default function BlogTab({ adminToken }: { adminToken: string }) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<BlogPost>(() => createEmptyPost());
  const [editorTab, setEditorTab] = useState<EditorTab>('content');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  }), [adminToken]);

  const fetchPosts = async (nextStatus = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextStatus !== 'ALL') params.set('status', nextStatus);
      if (query.trim()) params.set('q', query.trim());

      const res = await axios.get(`${API_URL}/admin/blog?${params.toString()}`, { headers });
      setPosts(Array.isArray(res.data?.posts) ? res.data.posts.map((post: Partial<BlogPost>) => normalizePost(post)) : []);
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Error', data?.error || 'Failed to load blog posts.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const updatePost = (patch: Partial<BlogPost>) => {
    setSelectedPost((prev) => ({ ...prev, ...patch }));
  };

  const updateSeo = (patch: Partial<BlogSeo>) => {
    setSelectedPost((prev) => ({ ...prev, seo: { ...prev.seo, ...patch } }));
  };

  const updateBlock = (blockId: string, patch: Partial<BlogContentBlock>) => {
    setSelectedPost((prev) => ({
      ...prev,
      contentBlocks: prev.contentBlocks.map((block) => (
        block.id === blockId ? { ...block, ...patch } : block
      )),
    }));
  };

  const addBlock = (type: BlogBlockType) => {
    updatePost({ contentBlocks: [...selectedPost.contentBlocks, createBlock(type)] });
  };

  const removeBlock = (blockId: string) => {
    updatePost({ contentBlocks: selectedPost.contentBlocks.filter((block) => block.id !== blockId) });
  };

  const duplicateBlock = (block: BlogContentBlock) => {
    updatePost({
      contentBlocks: selectedPost.contentBlocks.flatMap((item) => (
        item.id === block.id ? [item, { ...block, id: createId() }] : [item]
      )),
    });
  };

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    const currentIndex = selectedPost.contentBlocks.findIndex((block) => block.id === blockId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= selectedPost.contentBlocks.length) return;
    const blocks = [...selectedPost.contentBlocks];
    const [block] = blocks.splice(currentIndex, 1);
    blocks.splice(nextIndex, 0, block);
    updatePost({ contentBlocks: blocks });
  };

  const savePost = async (showToast = true): Promise<BlogPost | null> => {
    if (!selectedPost.title.trim()) {
      Swal.fire('Missing title', 'Add a title before saving this article.', 'warning');
      return null;
    }

    setSaving(true);
    try {
      const id = getPostId(selectedPost);
      const payload = buildPayload(selectedPost);
      const res = id
        ? await axios.put(`${API_URL}/admin/blog/${id}`, payload, { headers })
        : await axios.post(`${API_URL}/admin/blog`, payload, { headers });
      const saved = normalizePost(res.data?.post);
      setSelectedPost(saved);
      await fetchPosts(statusFilter);
      if (showToast) {
        Swal.fire({ title: 'Saved', text: 'Blog article saved successfully.', icon: 'success', timer: 1200, showConfirmButton: false });
      }
      return saved;
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Save failed', data?.error || 'Could not save this article.', 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publishPost = async () => {
    const saved = await savePost(false);
    const id = saved ? getPostId(saved) : '';
    if (!id) return;

    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/admin/blog/${id}/publish`, {}, { headers });
      const published = normalizePost(res.data?.post);
      setSelectedPost(published);
      await fetchPosts(statusFilter);
      Swal.fire('Published', 'This article is now live on the public blog.', 'success');
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Publish failed', data?.error || 'Could not publish this article.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const unpublishPost = async () => {
    const id = getPostId(selectedPost);
    if (!id) return;

    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/admin/blog/${id}/unpublish`, {}, { headers });
      const draft = normalizePost(res.data?.post);
      setSelectedPost(draft);
      await fetchPosts(statusFilter);
      Swal.fire('Unpublished', 'This article has been moved back to draft.', 'success');
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Unpublish failed', data?.error || 'Could not unpublish this article.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async () => {
    const id = getPostId(selectedPost);
    if (!id) {
      setSelectedPost(createEmptyPost());
      return;
    }

    const result = await Swal.fire({
      title: 'Delete article?',
      text: 'This removes the blog article from the CMS.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#ef4444',
    });
    if (!result.isConfirmed) return;

    setSaving(true);
    try {
      await axios.delete(`${API_URL}/admin/blog/${id}`, { headers });
      setSelectedPost(createEmptyPost());
      await fetchPosts(statusFilter);
      Swal.fire('Deleted', 'Blog article deleted.', 'success');
    } catch (error: unknown) {
      const data = axios.isAxiosError(error) ? error.response?.data as { error?: string } | undefined : undefined;
      Swal.fire('Delete failed', data?.error || 'Could not delete this article.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File | null, target: 'cover' | 'og' | string) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      Swal.fire('Invalid image', 'Please upload an image file.', 'warning');
      return;
    }

    setUploadingTarget(target);
    setUploadProgress(0);
    try {
      const url = await uploadToR2(file, adminToken, setUploadProgress);
      if (target === 'cover') {
        updatePost({ coverImage: url });
      } else if (target === 'og') {
        updateSeo({ ogImage: url });
      } else {
        updateBlock(target, { imageUrl: url });
      }
      Swal.fire({ title: 'Uploaded', text: 'Image uploaded successfully.', icon: 'success', timer: 1000, showConfirmButton: false });
    } catch (error: unknown) {
      Swal.fire('Upload failed', error instanceof Error ? error.message : 'Could not upload image.', 'error');
    } finally {
      setUploadingTarget(null);
      setUploadProgress(0);
    }
  };

  const renderUploadButton = (target: 'cover' | 'og' | string, label = 'Upload image') => (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300">
      {uploadingTarget === target ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
      {uploadingTarget === target ? `Uploading ${uploadProgress}%` : label}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0] || null;
          void handleImageUpload(file, target);
          event.target.value = '';
        }}
      />
    </label>
  );

  const filteredPosts = posts.filter((post) => {
    const text = `${post.title} ${post.excerpt} ${post.category} ${post.tags.join(' ')}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-800/70 p-5 shadow-xl lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
            <BookOpen size={16} /> SEO Content Engine
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">Blog & Articles CMS</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Create practical TallyPadi articles with rich sections, images, internal links, and per-article SEO that can be indexed by search engines.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedPost(createEmptyPost())}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-600"
          >
            <FilePlus2 size={16} /> New Article
          </button>
          <button
            onClick={() => void savePost()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Draft
          </button>
          {selectedPost.status === 'PUBLISHED' ? (
            <button
              onClick={() => void unpublishPost()}
              disabled={saving || !getPostId(selectedPost)}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Eye size={16} /> Unpublish
            </button>
          ) : (
            <button
              onClick={() => void publishPost()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={16} /> Publish
            </button>
          )}
          <button
            onClick={() => void deletePost()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">Articles</h3>
            <button
              onClick={() => void fetchPosts(statusFilter)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
              aria-label="Refresh articles"
            >
              <RefreshCcw size={16} />
            </button>
          </div>

          <div className="mt-4 flex gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">
            <Search size={16} className="mt-0.5 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void fetchPosts(statusFilter);
              }}
              placeholder="Search articles"
              className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['ALL', 'DRAFT', 'PUBLISHED'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-3 py-2 text-xs font-black transition ${
                  statusFilter === status ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="mt-4 max-h-[760px] space-y-3 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 p-8 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Loading posts
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-500">
                No blog posts yet. Create the first article for your SEO engine.
              </div>
            ) : filteredPosts.map((post) => {
              const selected = getPostId(post) && getPostId(post) === getPostId(selectedPost);
              return (
                <button
                  key={getPostId(post) || post.title}
                  onClick={() => setSelectedPost(normalizePost(post))}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selected ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/70 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm font-black text-white">{post.title || 'Untitled article'}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${statusClass[post.status]}`}>
                      {post.status}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{post.excerpt || 'No excerpt yet.'}</p>
                  <p className="mt-3 text-[11px] text-slate-500">{post.readingMinutes || 1} min read · {formatDate(post.publishedAt)}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass[selectedPost.status]}`}>
                  {selectedPost.status}
                </span>
                {selectedPost.slug && (
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-slate-400">/blog/{selectedPost.slug}</span>
                )}
              </div>
              <div className="flex rounded-xl bg-slate-900 p-1">
                {(['content', 'seo', 'preview'] as EditorTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setEditorTab(tab)}
                    className={`rounded-lg px-4 py-2 text-xs font-black capitalize transition ${
                      editorTab === tab ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Title</span>
                <input
                  value={selectedPost.title}
                  onChange={(event) => updatePost({ title: event.target.value })}
                  placeholder="e.g. How to manage your shop inventory on WhatsApp"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Slug</span>
                <input
                  value={selectedPost.slug}
                  onChange={(event) => updatePost({ slug: event.target.value })}
                  placeholder="auto-generated from title if empty"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Excerpt</span>
                <textarea
                  value={selectedPost.excerpt}
                  onChange={(event) => updatePost({ excerpt: event.target.value })}
                  rows={3}
                  placeholder="Short summary that appears on blog cards and search previews."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-emerald-400"
                />
              </label>
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Cover image</span>
                <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                  {selectedPost.coverImage ? (
                    <img src={selectedPost.coverImage} alt={selectedPost.coverImageAlt || 'Cover image'} className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-xs text-slate-500">No cover image</div>
                  )}
                  <div className="flex flex-wrap gap-2 p-3">
                    {renderUploadButton('cover', 'Upload cover')}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Cover alt text</span>
                <input
                  value={selectedPost.coverImageAlt}
                  onChange={(event) => updatePost({ coverImageAlt: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Category</span>
                <input
                  value={selectedPost.category}
                  onChange={(event) => updatePost({ category: event.target.value })}
                  placeholder="Business tips"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Tags</span>
                <input
                  value={commaList(selectedPost.tags)}
                  onChange={(event) => updatePost({ tags: splitInputList(event.target.value) })}
                  placeholder="WhatsApp POS, inventory"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Author</span>
                <input
                  value={selectedPost.authorName}
                  onChange={(event) => updatePost({ authorName: event.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                />
              </label>
            </div>
          </div>

          {editorTab === 'content' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
                <span className="mr-2 text-xs font-black uppercase tracking-wider text-slate-400">Add section</span>
                {blockTypes.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => addBlock(type.value)}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-700 hover:text-white"
                  >
                    <Plus size={13} /> {type.label}
                  </button>
                ))}
              </div>

              {selectedPost.contentBlocks.map((block, index) => (
                <div key={block.id} className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
                  <div className="flex flex-col gap-3 border-b border-slate-700 pb-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-slate-400">#{index + 1}</span>
                      <select
                        value={block.type}
                        onChange={(event) => updateBlock(block.id, { type: event.target.value as BlogBlockType })}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      >
                        {blockTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => moveBlock(block.id, -1)} className="rounded-lg bg-slate-900 p-2 text-slate-300 transition hover:bg-slate-700" aria-label="Move block up">
                        <ChevronUp size={16} />
                      </button>
                      <button onClick={() => moveBlock(block.id, 1)} className="rounded-lg bg-slate-900 p-2 text-slate-300 transition hover:bg-slate-700" aria-label="Move block down">
                        <ChevronDown size={16} />
                      </button>
                      <button onClick={() => duplicateBlock(block)} className="rounded-lg bg-slate-900 p-2 text-slate-300 transition hover:bg-slate-700" aria-label="Duplicate block">
                        <Copy size={16} />
                      </button>
                      <button onClick={() => removeBlock(block.id)} className="rounded-lg bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20" aria-label="Remove block">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      {block.type === 'heading' && (
                        <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
                          <label className="space-y-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Level</span>
                            <select
                              value={block.level || 2}
                              onChange={(event) => updateBlock(block.id, { level: Number(event.target.value) })}
                              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-emerald-400"
                            >
                              <option value={2}>H2</option>
                              <option value={3}>H3</option>
                              <option value={4}>H4</option>
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Heading text</span>
                            <input
                              value={block.text || ''}
                              onChange={(event) => updateBlock(block.id, { text: event.target.value })}
                              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                            />
                          </label>
                        </div>
                      )}

                      {(block.type === 'paragraph' || block.type === 'quote' || block.type === 'callout') && (
                        <label className="space-y-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Text</span>
                          <textarea
                            value={block.text || ''}
                            onChange={(event) => updateBlock(block.id, { text: event.target.value })}
                            rows={block.type === 'paragraph' ? 7 : 4}
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-7 text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                      )}

                      {block.type === 'list' && (
                        <label className="space-y-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400">List items, one per line</span>
                          <textarea
                            value={(block.items || []).join('\n')}
                            onChange={(event) => updateBlock(block.id, { items: splitLines(event.target.value) })}
                            rows={6}
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-7 text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                      )}

                      {block.type === 'image' && (
                        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                          <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                            {block.imageUrl ? (
                              <img src={block.imageUrl} alt={block.alt || 'Blog section image'} className="h-40 w-full object-cover" />
                            ) : (
                              <div className="flex h-40 items-center justify-center text-xs text-slate-500">
                                <ImagePlus size={28} />
                              </div>
                            )}
                            <div className="p-3">{renderUploadButton(block.id, 'Upload image')}</div>
                          </div>
                          <div className="space-y-3">
                            <label className="space-y-2">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Image URL</span>
                              <input
                                value={block.imageUrl || ''}
                                onChange={(event) => updateBlock(block.id, { imageUrl: event.target.value })}
                                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Alt text</span>
                              <input
                                value={block.alt || ''}
                                onChange={(event) => updateBlock(block.id, { alt: event.target.value })}
                                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Caption</span>
                              <input
                                value={block.caption || ''}
                                onChange={(event) => updateBlock(block.id, { caption: event.target.value })}
                                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      {block.type === 'button' && (
                        <div className="grid gap-3 lg:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Button label</span>
                            <input
                              value={block.label || ''}
                              onChange={(event) => updateBlock(block.id, { label: event.target.value })}
                              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400">Link URL</span>
                            <input
                              value={block.href || ''}
                              onChange={(event) => updateBlock(block.id, { href: event.target.value })}
                              placeholder="/register or https://..."
                              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                            />
                          </label>
                        </div>
                      )}

                      {block.type === 'divider' && (
                        <div className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-500">
                          Divider section. It renders as a horizontal line in the article.
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <Palette size={14} /> Section style
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-2">
                          <span className="text-xs text-slate-500">Text</span>
                          <input
                            type="color"
                            value={block.textColor || '#e2e8f0'}
                            onChange={(event) => updateBlock(block.id, { textColor: event.target.value })}
                            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs text-slate-500">Background</span>
                          <input
                            type="color"
                            value={block.backgroundColor || '#0f172a'}
                            onChange={(event) => updateBlock(block.id, { backgroundColor: event.target.value })}
                            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900"
                          />
                        </label>
                      </div>
                      <label className="space-y-2">
                        <span className="flex items-center gap-2 text-xs text-slate-500"><Type size={13} /> Text size</span>
                        <select
                          value={block.fontSize || 'base'}
                          onChange={(event) => updateBlock(block.id, { fontSize: event.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                        >
                          {fontSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs text-slate-500">Alignment</span>
                        <select
                          value={block.align || 'left'}
                          onChange={(event) => updateBlock(block.id, { align: event.target.value as BlockAlign })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </label>
                      <button
                        onClick={() => updateBlock(block.id, { textColor: '', backgroundColor: '', fontSize: 'base', align: 'left' })}
                        className="w-full rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800"
                      >
                        Reset style
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editorTab === 'seo' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5">
                <div className="mb-5 flex items-center gap-2">
                  <Globe2 size={20} className="text-emerald-300" />
                  <h3 className="text-lg font-black text-white">Search Engine Settings</h3>
                </div>
                <div className="space-y-4">
                  <label className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">Meta title</span>
                      <SeoCounter value={selectedPost.seo.metaTitle} max={70} label="Recommended" />
                    </div>
                    <input
                      value={selectedPost.seo.metaTitle}
                      onChange={(event) => updateSeo({ metaTitle: event.target.value })}
                      placeholder={selectedPost.title || 'Title shown in Google search'}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">Meta description</span>
                      <SeoCounter value={selectedPost.seo.metaDescription} max={170} label="Recommended" />
                    </div>
                    <textarea
                      value={selectedPost.seo.metaDescription}
                      onChange={(event) => updateSeo({ metaDescription: event.target.value })}
                      rows={4}
                      placeholder={selectedPost.excerpt || 'Short persuasive summary for search result snippets.'}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-7 text-white outline-none transition focus:border-emerald-400"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">SEO keywords</span>
                    <input
                      value={commaList(selectedPost.seo.keywords)}
                      onChange={(event) => updateSeo({ keywords: splitInputList(event.target.value) })}
                      placeholder="business management software Nigeria, WhatsApp POS Africa"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                      <LinkIcon size={14} /> Canonical URL
                    </span>
                    <input
                      value={selectedPost.seo.canonicalUrl}
                      onChange={(event) => updateSeo({ canonicalUrl: event.target.value })}
                      placeholder="https://tallypadi.com/blog/article-slug"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedPost.seo.noIndex}
                      onChange={(event) => updateSeo({ noIndex: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-emerald-500"
                    />
                    <span className="text-sm font-bold text-slate-200">Hide this article from search indexing</span>
                  </label>
                </div>
              </div>

              <aside className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5">
                <div className="flex items-center gap-2">
                  <Megaphone size={18} className="text-emerald-300" />
                  <h3 className="font-black text-white">Social Preview</h3>
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                  {selectedPost.seo.ogImage || selectedPost.coverImage ? (
                    <img src={selectedPost.seo.ogImage || selectedPost.coverImage} alt="Open graph preview" className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 items-center justify-center text-sm text-slate-500">No OG image</div>
                  )}
                  <div className="space-y-2 p-4">
                    <p className="line-clamp-2 text-sm font-black text-white">{selectedPost.seo.metaTitle || selectedPost.title || 'Article title'}</p>
                    <p className="line-clamp-3 text-xs leading-5 text-slate-400">{selectedPost.seo.metaDescription || selectedPost.excerpt || 'Article description preview.'}</p>
                  </div>
                </div>
                <div className="mt-3">{renderUploadButton('og', 'Upload OG image')}</div>
                <label className="mt-3 block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">OG image URL</span>
                  <input
                    value={selectedPost.seo.ogImage}
                    onChange={(event) => updateSeo({ ogImage: event.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                  />
                </label>
              </aside>
            </div>
          )}

          {editorTab === 'preview' && (
            <article className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
              {selectedPost.coverImage && (
                <img src={selectedPost.coverImage} alt={selectedPost.coverImageAlt || selectedPost.title} className="max-h-[420px] w-full object-cover" />
              )}
              <div className="p-6 sm:p-8 lg:p-10">
                <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-300">
                  {selectedPost.category && <span>{selectedPost.category}</span>}
                  <span>{selectedPost.readingMinutes || 1} min read</span>
                </div>
                <h1 className="mt-4 max-w-4xl text-3xl font-black text-white sm:text-5xl">{selectedPost.title || 'Untitled article'}</h1>
                {selectedPost.excerpt && <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{selectedPost.excerpt}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedPost.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{tag}</span>
                  ))}
                </div>
                <div className="mt-10 space-y-7">
                  {selectedPost.contentBlocks.map((block) => <PreviewBlock key={block.id} block={block} />)}
                </div>
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
