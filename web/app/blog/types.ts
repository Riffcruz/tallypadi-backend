export type BlogStatus = 'DRAFT' | 'PUBLISHED';
export type BlogBlockType = 'heading' | 'paragraph' | 'image' | 'quote' | 'list' | 'button' | 'callout' | 'divider';
export type BlockAlign = 'left' | 'center' | 'right';

export interface BlogContentBlock {
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

export interface BlogSeo {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  canonicalUrl?: string;
  ogImage?: string;
  noIndex?: boolean;
}

export interface BlogPost {
  _id?: string;
  id?: string;
  title: string;
  slug: string;
  excerpt?: string;
  coverImage?: string;
  coverImageAlt?: string;
  category?: string;
  tags?: string[];
  authorName?: string;
  status?: BlogStatus;
  contentBlocks?: BlogContentBlock[];
  seo?: BlogSeo;
  readingMinutes?: number;
  publishedAt?: string;
  updatedAt?: string;
  createdAt?: string;
}
