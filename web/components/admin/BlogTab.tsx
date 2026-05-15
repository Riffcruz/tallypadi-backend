'use client';

import React, { ChangeEvent, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  FilePlus2,
  Globe2,
  Heading2,
  Image as ImageIcon,
  ImagePlus,
  Link as LinkIcon,
  List,
  Loader2,
  Megaphone,
  MessageSquareQuote,
  MousePointerClick,
  Palette,
  PanelRight,
  Pilcrow,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Send,
  SeparatorHorizontal,
  Settings2,
  Trash2,
  Type,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';
import { uploadToR2 } from '../../src/utils/uploadToR2';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type BlogStatus = 'DRAFT' | 'PUBLISHED';
type BlogBlockType = 'heading' | 'paragraph' | 'image' | 'quote' | 'list' | 'button' | 'callout' | 'divider';
type BlockAlign = 'left' | 'center' | 'right';
type InspectorTab = 'article' | 'seo' | 'preview';
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

const blockTypes: { value: BlogBlockType; label: string; icon: LucideIcon }[] = [
  { value: 'heading', label: 'Heading', icon: Heading2 },
  { value: 'paragraph', label: 'Paragraph', icon: Pilcrow },
  { value: 'image', label: 'Image', icon: ImageIcon },
  { value: 'quote', label: 'Quote', icon: MessageSquareQuote },
  { value: 'list', label: 'List', icon: List },
  { value: 'button', label: 'Button', icon: MousePointerClick },
  { value: 'callout', label: 'Callout', icon: Megaphone },
  { value: 'divider', label: 'Divider', icon: SeparatorHorizontal },
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
  contentBlocks: [createBlock('heading'), createBlock('paragraph')],
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
      fontSize: fontSizes.some((size) => size.value === block.fontSize) ? block.fontSize : 'base',
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

const canvasFontSizeClass: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};

const previewFontSizeClass: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};

const headingClass = (level?: number) => (
  level === 4 ? 'text-xl' : level === 3 ? 'text-2xl' : 'text-3xl'
);

const blockStyle = (block: BlogContentBlock): React.CSSProperties => ({
  color: block.textColor || undefined,
  backgroundColor: block.backgroundColor || undefined,
  textAlign: block.align || 'left',
});

const blockName = (type: BlogBlockType) => blockTypes.find((item) => item.value === type)?.label || 'Block';

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

function ToolButton({
  label,
  active = false,
  disabled = false,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20'
          : active
            ? 'border-emerald-400 bg-emerald-500 text-slate-950'
            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function PreviewBlock({ block }: { block: BlogContentBlock }) {
  const style = blockStyle(block);
  const sizeClass = previewFontSizeClass[block.fontSize || 'base'] || previewFontSizeClass.base;
  const hasBackground = Boolean(block.backgroundColor);

  if (block.type === 'divider') return <hr className="my-8 border-slate-700" />;

  if (block.type === 'heading') {
    return (
      <h2 className={`font-black text-white ${headingClass(block.level)} ${hasBackground ? 'rounded-md px-4 py-3' : ''}`} style={style}>
        {block.text}
      </h2>
    );
  }

  if (block.type === 'image') {
    return (
      <figure className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
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
      <ul className={`list-disc space-y-3 pl-6 leading-8 text-slate-200 ${sizeClass} ${hasBackground ? 'rounded-md px-8 py-4' : ''}`} style={style}>
        {(block.items || []).map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>)}
      </ul>
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote className={`rounded-md border-l-4 border-emerald-400 bg-slate-800/70 p-5 italic leading-8 text-slate-100 ${sizeClass}`} style={style}>
        {block.text}
      </blockquote>
    );
  }

  if (block.type === 'button') {
    return (
      <a href={block.href || '#'} className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400">
        {block.label || 'Open link'} <MousePointerClick size={16} />
      </a>
    );
  }

  if (block.type === 'callout') {
    return (
      <div className={`rounded-md border border-emerald-500/30 bg-emerald-500/10 p-5 leading-8 text-emerald-50 ${sizeClass}`} style={style}>
        {block.text}
      </div>
    );
  }

  return (
    <p className={`leading-8 text-slate-200 ${sizeClass} ${hasBackground ? 'rounded-md px-4 py-3' : ''}`} style={style}>
      {block.text}
    </p>
  );
}

export default function BlogTab({ adminToken }: { adminToken: string }) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<BlogPost>(() => createEmptyPost());
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('article');
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

  const selectedBlock = useMemo(() => (
    selectedPost.contentBlocks.find((block) => block.id === selectedBlockId) || selectedPost.contentBlocks[0] || null
  ), [selectedPost.contentBlocks, selectedBlockId]);

  useEffect(() => {
    if (selectedPost.contentBlocks.length === 0) {
      if (selectedBlockId) setSelectedBlockId(null);
      return;
    }
    if (!selectedPost.contentBlocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(selectedPost.contentBlocks[0].id);
    }
  }, [selectedPost.contentBlocks, selectedBlockId]);

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

  const selectPost = (post: BlogPost) => {
    const normalized = normalizePost(post);
    setSelectedPost(normalized);
    setSelectedBlockId(normalized.contentBlocks[0]?.id || null);
    setInspectorTab('article');
  };

  const newArticle = () => {
    const draft = createEmptyPost();
    setSelectedPost(draft);
    setSelectedBlockId(draft.contentBlocks[0]?.id || null);
    setInspectorTab('article');
  };

  const addBlock = (type: BlogBlockType, afterBlockId = selectedBlock?.id) => {
    const nextBlock = createBlock(type);
    setSelectedPost((prev) => {
      const insertIndex = afterBlockId ? prev.contentBlocks.findIndex((block) => block.id === afterBlockId) : -1;
      const nextBlocks = [...prev.contentBlocks];
      nextBlocks.splice(insertIndex >= 0 ? insertIndex + 1 : nextBlocks.length, 0, nextBlock);
      return { ...prev, contentBlocks: nextBlocks };
    });
    setSelectedBlockId(nextBlock.id);
    setInspectorTab('article');
  };

  const removeBlock = (blockId: string) => {
    const currentIndex = selectedPost.contentBlocks.findIndex((block) => block.id === blockId);
    const nextBlocks = selectedPost.contentBlocks.filter((block) => block.id !== blockId);
    updatePost({ contentBlocks: nextBlocks });
    if (selectedBlockId === blockId) {
      setSelectedBlockId(nextBlocks[Math.min(currentIndex, nextBlocks.length - 1)]?.id || null);
    }
  };

  const duplicateBlock = (block: BlogContentBlock) => {
    const copy = { ...block, id: createId() };
    updatePost({
      contentBlocks: selectedPost.contentBlocks.flatMap((item) => (
        item.id === block.id ? [item, copy] : [item]
      )),
    });
    setSelectedBlockId(copy.id);
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

  const changeBlockType = (block: BlogContentBlock, type: BlogBlockType) => {
    const template = createBlock(type);
    const text = block.text || (block.items || []).join('\n') || template.text;
    updateBlock(block.id, {
      ...template,
      id: block.id,
      type,
      text: type === 'list' ? '' : text,
      items: type === 'list' ? (block.items?.length ? block.items : splitLines(text || '')) : [],
      imageUrl: type === 'image' ? block.imageUrl || '' : '',
      alt: type === 'image' ? block.alt || '' : '',
      caption: type === 'image' ? block.caption || '' : '',
      href: type === 'button' ? block.href || '' : '',
      label: type === 'button' ? block.label || text || template.label : '',
      textColor: block.textColor || '',
      backgroundColor: block.backgroundColor || '',
      fontSize: block.fontSize || 'base',
      align: block.align || 'left',
    });
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
      setSelectedBlockId(saved.contentBlocks[0]?.id || null);
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
      setSelectedBlockId(published.contentBlocks[0]?.id || null);
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
      setSelectedBlockId(draft.contentBlocks[0]?.id || null);
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
      newArticle();
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
      newArticle();
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
    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-600 bg-slate-900 px-3 text-xs font-bold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-300">
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

  const selectedBlockIndex = selectedBlock ? selectedPost.contentBlocks.findIndex((block) => block.id === selectedBlock.id) : -1;

  const renderEditorBlock = (block: BlogContentBlock, index: number) => {
    const selected = block.id === selectedBlock?.id;
    const style = blockStyle(block);
    const sizeClass = canvasFontSizeClass[block.fontSize || 'base'] || canvasFontSizeClass.base;
    const baseInputClass = 'w-full resize-y rounded-md border border-transparent bg-transparent px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:bg-slate-950/70';

    return (
      <section
        key={block.id}
        onClick={() => setSelectedBlockId(block.id)}
        className={`group rounded-lg border p-3 transition ${
          selected
            ? 'border-emerald-400 bg-emerald-500/5 shadow-[0_0_0_1px_rgba(52,211,153,0.18)]'
            : 'border-transparent hover:border-slate-700 hover:bg-slate-900/50'
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-wider text-slate-500">
          <span>{index + 1}. {blockName(block.type)}</span>
          {selected && <span className="text-emerald-300">Selected</span>}
        </div>

        {block.type === 'heading' && (
          <input
            value={block.text || ''}
            onChange={(event) => updateBlock(block.id, { text: event.target.value })}
            placeholder="Heading"
            style={style}
            className={`${baseInputClass} font-black ${headingClass(block.level)}`}
          />
        )}

        {(block.type === 'paragraph' || block.type === 'quote' || block.type === 'callout') && (
          <textarea
            value={block.text || ''}
            onChange={(event) => updateBlock(block.id, { text: event.target.value })}
            rows={block.type === 'paragraph' ? 6 : 4}
            placeholder={block.type === 'paragraph' ? 'Start writing...' : blockName(block.type)}
            style={style}
            className={`${baseInputClass} leading-8 ${sizeClass} ${
              block.type === 'quote'
                ? 'border-l-4 border-l-emerald-400 italic'
                : block.type === 'callout'
                  ? 'border-emerald-500/30 bg-emerald-500/10 font-semibold text-emerald-50'
                  : ''
            }`}
          />
        )}

        {block.type === 'list' && (
          <textarea
            value={(block.items || []).join('\n')}
            onChange={(event) => updateBlock(block.id, { items: splitLines(event.target.value) })}
            rows={5}
            placeholder="One list item per line"
            style={style}
            className={`${baseInputClass} leading-8 ${sizeClass}`}
          />
        )}

        {block.type === 'image' && (
          <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
            {block.imageUrl ? (
              <img src={block.imageUrl} alt={block.alt || 'Blog section image'} className="max-h-[420px] w-full object-cover" />
            ) : (
              <div className="flex h-64 items-center justify-center text-slate-500">
                <ImagePlus size={32} />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 p-3">
              <input
                value={block.caption || ''}
                onChange={(event) => updateBlock(block.id, { caption: event.target.value })}
                placeholder="Caption"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-300 outline-none placeholder:text-slate-600"
              />
              {renderUploadButton(block.id, block.imageUrl ? 'Replace image' : 'Upload image')}
            </div>
          </div>
        )}

        {block.type === 'button' && (
          <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <input
              value={block.label || ''}
              onChange={(event) => updateBlock(block.id, { label: event.target.value })}
              placeholder="Button label"
              className={`${baseInputClass} font-black`}
            />
            <input
              value={block.href || ''}
              onChange={(event) => updateBlock(block.id, { href: event.target.value })}
              placeholder="/register or https://..."
              className={baseInputClass}
            />
          </div>
        )}

        {block.type === 'divider' && (
          <div className="py-5">
            <hr className="border-slate-700" />
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
              <BookOpen size={16} /> Blog CMS
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black text-white">Article Editor</h2>
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass[selectedPost.status]}`}>
                {selectedPost.status}
              </span>
              {selectedPost.slug && (
                <span className="max-w-full truncate rounded-full bg-slate-950 px-3 py-1 text-xs text-slate-400">/blog/{selectedPost.slug}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={newArticle}
              className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              <FilePlus2 size={16} /> New
            </button>
            <button
              type="button"
              onClick={() => void savePost()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
            </button>
            {selectedPost.status === 'PUBLISHED' ? (
              <button
                type="button"
                onClick={() => void unpublishPost()}
                disabled={saving || !getPostId(selectedPost)}
                className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 px-4 py-2 text-sm font-bold text-amber-200 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Eye size={16} /> Unpublish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void publishPost()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={16} /> Publish
              </button>
            )}
            <button
              type="button"
              onClick={() => void deletePost()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-150px)] 2xl:overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-1">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">Articles</h3>
            <button
              type="button"
              onClick={() => void fetchPosts(statusFilter)}
              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              aria-label="Refresh articles"
              title="Refresh articles"
            >
              <RefreshCcw size={16} />
            </button>
          </div>

          <div className="mt-3 flex gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
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
                type="button"
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-md px-2 py-2 text-[11px] font-black transition ${
                  statusFilter === status ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="mt-4 max-h-[660px] space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 rounded-md border border-slate-700 p-8 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Loading posts
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-700 p-5 text-sm text-slate-500">
                No blog posts yet.
              </div>
            ) : filteredPosts.map((post) => {
              const selected = getPostId(post) && getPostId(post) === getPostId(selectedPost);
              return (
                <button
                  type="button"
                  key={getPostId(post) || post.title}
                  onClick={() => selectPost(post)}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    selected ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm font-black text-white">{post.title || 'Untitled article'}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${statusClass[post.status]}`}>
                      {post.status}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{post.excerpt || 'No excerpt yet.'}</p>
                  <p className="mt-3 text-[11px] text-slate-500">{post.readingMinutes || 1} min read | {formatDate(post.publishedAt)}</p>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0">
          <div className="sticky top-0 z-20 rounded-lg border border-slate-800 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedBlock?.type || ''}
                onChange={(event) => {
                  if (selectedBlock) changeBlockType(selectedBlock, event.target.value as BlogBlockType);
                }}
                disabled={!selectedBlock}
                aria-label="Block type"
                className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white outline-none focus:border-emerald-400 disabled:opacity-40"
              >
                {blockTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>

              <select
                defaultValue=""
                onChange={(event) => {
                  const type = event.target.value as BlogBlockType;
                  if (type) addBlock(type);
                  event.currentTarget.value = '';
                }}
                aria-label="Add block"
                className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-slate-200 outline-none focus:border-emerald-400"
              >
                <option value="">Add block</option>
                {blockTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>

              <div className="h-7 w-px bg-slate-800" />

              {selectedBlock?.type === 'heading' && (
                <select
                  value={selectedBlock.level || 2}
                  onChange={(event) => updateBlock(selectedBlock.id, { level: Number(event.target.value) })}
                  aria-label="Heading level"
                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white outline-none focus:border-emerald-400"
                >
                  <option value={2}>H2</option>
                  <option value={3}>H3</option>
                  <option value={4}>H4</option>
                </select>
              )}

              <select
                value={selectedBlock?.fontSize || 'base'}
                onChange={(event) => selectedBlock && updateBlock(selectedBlock.id, { fontSize: event.target.value })}
                disabled={!selectedBlock}
                aria-label="Text size"
                className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-40"
              >
                {fontSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
              </select>

              <div className="flex gap-1">
                <ToolButton label="Align left" active={selectedBlock?.align === 'left' || !selectedBlock?.align} disabled={!selectedBlock} onClick={() => selectedBlock && updateBlock(selectedBlock.id, { align: 'left' })}>
                  <AlignLeft size={16} />
                </ToolButton>
                <ToolButton label="Align center" active={selectedBlock?.align === 'center'} disabled={!selectedBlock} onClick={() => selectedBlock && updateBlock(selectedBlock.id, { align: 'center' })}>
                  <AlignCenter size={16} />
                </ToolButton>
                <ToolButton label="Align right" active={selectedBlock?.align === 'right'} disabled={!selectedBlock} onClick={() => selectedBlock && updateBlock(selectedBlock.id, { align: 'right' })}>
                  <AlignRight size={16} />
                </ToolButton>
              </div>

              <label className="flex h-9 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs font-bold text-slate-300" title="Text color">
                <Type size={14} />
                <input
                  type="color"
                  value={selectedBlock?.textColor || '#e2e8f0'}
                  onChange={(event) => selectedBlock && updateBlock(selectedBlock.id, { textColor: event.target.value })}
                  disabled={!selectedBlock}
                  className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                  aria-label="Text color"
                />
              </label>

              <label className="flex h-9 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs font-bold text-slate-300" title="Background color">
                <Palette size={14} />
                <input
                  type="color"
                  value={selectedBlock?.backgroundColor || '#0f172a'}
                  onChange={(event) => selectedBlock && updateBlock(selectedBlock.id, { backgroundColor: event.target.value })}
                  disabled={!selectedBlock}
                  className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                  aria-label="Background color"
                />
              </label>

              {selectedBlock?.type === 'image' && renderUploadButton(selectedBlock.id, selectedBlock.imageUrl ? 'Replace' : 'Upload')}

              <div className="h-7 w-px bg-slate-800" />

              <ToolButton label="Move block up" disabled={!selectedBlock || selectedBlockIndex <= 0} onClick={() => selectedBlock && moveBlock(selectedBlock.id, -1)}>
                <ChevronUp size={16} />
              </ToolButton>
              <ToolButton label="Move block down" disabled={!selectedBlock || selectedBlockIndex < 0 || selectedBlockIndex >= selectedPost.contentBlocks.length - 1} onClick={() => selectedBlock && moveBlock(selectedBlock.id, 1)}>
                <ChevronDown size={16} />
              </ToolButton>
              <ToolButton label="Duplicate block" disabled={!selectedBlock} onClick={() => selectedBlock && duplicateBlock(selectedBlock)}>
                <Copy size={16} />
              </ToolButton>
              <ToolButton label="Reset block style" disabled={!selectedBlock} onClick={() => selectedBlock && updateBlock(selectedBlock.id, { textColor: '', backgroundColor: '', fontSize: 'base', align: 'left' })}>
                <RefreshCcw size={16} />
              </ToolButton>
              <ToolButton label="Delete block" danger disabled={!selectedBlock} onClick={() => selectedBlock && removeBlock(selectedBlock.id)}>
                <Trash2 size={16} />
              </ToolButton>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4 sm:p-6">
            <article className="mx-auto max-w-4xl rounded-lg bg-slate-900 p-4 shadow-2xl sm:p-8">
              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                {selectedPost.coverImage ? (
                  <img src={selectedPost.coverImage} alt={selectedPost.coverImageAlt || selectedPost.title || 'Cover image'} className="max-h-[360px] w-full object-cover" />
                ) : (
                  <div className="flex h-48 items-center justify-center text-slate-500 sm:h-60">
                    <ImagePlus size={34} />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 p-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">Cover image</span>
                  {renderUploadButton('cover', selectedPost.coverImage ? 'Replace cover' : 'Upload cover')}
                </div>
              </div>

              <div className="mt-7 space-y-4">
                <input
                  value={selectedPost.title}
                  onChange={(event) => updatePost({ title: event.target.value })}
                  placeholder="Article title"
                  className="w-full bg-transparent text-3xl font-black leading-tight text-white outline-none placeholder:text-slate-600 sm:text-5xl"
                />
                <textarea
                  value={selectedPost.excerpt}
                  onChange={(event) => updatePost({ excerpt: event.target.value })}
                  rows={3}
                  placeholder="Short summary for cards and search previews"
                  className="w-full resize-y bg-transparent text-lg leading-8 text-slate-300 outline-none placeholder:text-slate-600"
                />
              </div>

              <div className="mt-8 space-y-4">
                {selectedPost.contentBlocks.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => addBlock('paragraph')}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 p-8 text-sm font-bold text-slate-400 transition hover:border-emerald-400 hover:text-emerald-300"
                  >
                    <Plus size={16} /> Add first block
                  </button>
                ) : selectedPost.contentBlocks.map((block, index) => renderEditorBlock(block, index))}
              </div>
            </article>
          </div>
        </main>

        <aside className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-150px)] 2xl:overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'article', label: 'Article', icon: Settings2 },
              { value: 'seo', label: 'SEO', icon: Globe2 },
              { value: 'preview', label: 'Preview', icon: PanelRight },
            ] as { value: InspectorTab; label: string; icon: LucideIcon }[]).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  type="button"
                  key={tab.value}
                  onClick={() => setInspectorTab(tab.value)}
                  className={`inline-flex items-center justify-center gap-2 rounded-md px-2 py-2 text-xs font-black transition ${
                    inspectorTab === tab.value ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon size={14} /> {tab.label}
                </button>
              );
            })}
          </div>

          {inspectorTab === 'article' && (
            <div className="mt-4 space-y-4">
              <div className="space-y-3">
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Slug</span>
                  <input
                    value={selectedPost.slug}
                    onChange={(event) => updatePost({ slug: event.target.value })}
                    placeholder="auto-generated from title"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Category</span>
                  <input
                    value={selectedPost.category}
                    onChange={(event) => updatePost({ category: event.target.value })}
                    placeholder="Business tips"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Tags</span>
                  <input
                    value={commaList(selectedPost.tags)}
                    onChange={(event) => updatePost({ tags: splitInputList(event.target.value) })}
                    placeholder="WhatsApp POS, inventory"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Author</span>
                  <input
                    value={selectedPost.authorName}
                    onChange={(event) => updatePost({ authorName: event.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Cover alt text</span>
                  <input
                    value={selectedPost.coverImageAlt}
                    onChange={(event) => updatePost({ coverImageAlt: event.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  />
                </label>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <Type size={16} className="text-emerald-300" />
                  <h3 className="text-sm font-black text-white">Selected block</h3>
                </div>
                {selectedBlock ? (
                  <div className="space-y-3">
                    <label className="block space-y-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">Block type</span>
                      <select
                        value={selectedBlock.type}
                        onChange={(event) => changeBlockType(selectedBlock, event.target.value as BlogBlockType)}
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      >
                        {blockTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>

                    {selectedBlock.type === 'heading' && (
                      <label className="block space-y-2">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">Heading level</span>
                        <select
                          value={selectedBlock.level || 2}
                          onChange={(event) => updateBlock(selectedBlock.id, { level: Number(event.target.value) })}
                          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                        >
                          <option value={2}>H2</option>
                          <option value={3}>H3</option>
                          <option value={4}>H4</option>
                        </select>
                      </label>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2">
                        <span className="text-xs text-slate-500">Text</span>
                        <input
                          type="color"
                          value={selectedBlock.textColor || '#e2e8f0'}
                          onChange={(event) => updateBlock(selectedBlock.id, { textColor: event.target.value })}
                          className="h-10 w-full rounded-md border border-slate-700 bg-slate-950"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs text-slate-500">Background</span>
                        <input
                          type="color"
                          value={selectedBlock.backgroundColor || '#0f172a'}
                          onChange={(event) => updateBlock(selectedBlock.id, { backgroundColor: event.target.value })}
                          className="h-10 w-full rounded-md border border-slate-700 bg-slate-950"
                        />
                      </label>
                    </div>

                    <label className="block space-y-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">Text size</span>
                      <select
                        value={selectedBlock.fontSize || 'base'}
                        onChange={(event) => updateBlock(selectedBlock.id, { fontSize: event.target.value })}
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      >
                        {fontSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">Alignment</span>
                      <select
                        value={selectedBlock.align || 'left'}
                        onChange={(event) => updateBlock(selectedBlock.id, { align: event.target.value as BlockAlign })}
                        className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </label>

                    {selectedBlock.type === 'image' && (
                      <div className="space-y-3">
                        <label className="block space-y-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Image URL</span>
                          <input
                            value={selectedBlock.imageUrl || ''}
                            onChange={(event) => updateBlock(selectedBlock.id, { imageUrl: event.target.value })}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                        <label className="block space-y-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Alt text</span>
                          <input
                            value={selectedBlock.alt || ''}
                            onChange={(event) => updateBlock(selectedBlock.id, { alt: event.target.value })}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                        <label className="block space-y-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-400">Caption</span>
                          <input
                            value={selectedBlock.caption || ''}
                            onChange={(event) => updateBlock(selectedBlock.id, { caption: event.target.value })}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                          />
                        </label>
                        {renderUploadButton(selectedBlock.id, selectedBlock.imageUrl ? 'Replace image' : 'Upload image')}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => updateBlock(selectedBlock.id, { textColor: '', backgroundColor: '', fontSize: 'base', align: 'left' })}
                      className="w-full rounded-md border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-800"
                    >
                      Reset style
                    </button>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-700 p-5 text-sm text-slate-500">
                    Select a block on the canvas.
                  </div>
                )}
              </div>
            </div>
          )}

          {inspectorTab === 'seo' && (
            <div className="mt-4 space-y-4">
              <label className="block space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Meta title</span>
                  <SeoCounter value={selectedPost.seo.metaTitle} max={70} label="Recommended" />
                </div>
                <input
                  value={selectedPost.seo.metaTitle}
                  onChange={(event) => updateSeo({ metaTitle: event.target.value })}
                  placeholder={selectedPost.title || 'Title shown in Google search'}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">Meta description</span>
                  <SeoCounter value={selectedPost.seo.metaDescription} max={170} label="Recommended" />
                </div>
                <textarea
                  value={selectedPost.seo.metaDescription}
                  onChange={(event) => updateSeo({ metaDescription: event.target.value })}
                  rows={4}
                  placeholder={selectedPost.excerpt || 'Short summary for search result snippets'}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">SEO keywords</span>
                <input
                  value={commaList(selectedPost.seo.keywords)}
                  onChange={(event) => updateSeo({ keywords: splitInputList(event.target.value) })}
                  placeholder="business management software Nigeria, WhatsApp POS Africa"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block space-y-2">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                  <LinkIcon size={14} /> Canonical URL
                </span>
                <input
                  value={selectedPost.seo.canonicalUrl}
                  onChange={(event) => updateSeo({ canonicalUrl: event.target.value })}
                  placeholder="https://tallypadi.com/blog/article-slug"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
              </label>
              <label className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-950 px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedPost.seo.noIndex}
                  onChange={(event) => updateSeo({ noIndex: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-emerald-500"
                />
                <span className="text-sm font-bold text-slate-200">Hide from search indexing</span>
              </label>

              <div className="overflow-hidden rounded-md border border-slate-700 bg-slate-950">
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
              {renderUploadButton('og', 'Upload OG image')}
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">OG image URL</span>
                <input
                  value={selectedPost.seo.ogImage}
                  onChange={(event) => updateSeo({ ogImage: event.target.value })}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
              </label>
            </div>
          )}

          {inspectorTab === 'preview' && (
            <article className="mt-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              {selectedPost.coverImage && (
                <img src={selectedPost.coverImage} alt={selectedPost.coverImageAlt || selectedPost.title} className="max-h-[260px] w-full object-cover" />
              )}
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-300">
                  {selectedPost.category && <span>{selectedPost.category}</span>}
                  <span>{selectedPost.readingMinutes || 1} min read</span>
                </div>
                <h1 className="mt-3 text-2xl font-black text-white">{selectedPost.title || 'Untitled article'}</h1>
                {selectedPost.excerpt && <p className="mt-3 text-sm leading-6 text-slate-300">{selectedPost.excerpt}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPost.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-900 px-3 py-1 text-[11px] text-slate-300">{tag}</span>
                  ))}
                </div>
                <div className="mt-6 space-y-5">
                  {selectedPost.contentBlocks.map((block) => <PreviewBlock key={block.id} block={block} />)}
                </div>
              </div>
            </article>
          )}
        </aside>
      </div>
    </div>
  );
}
