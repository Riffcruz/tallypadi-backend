import { Schema, model, Document, Types } from 'mongoose';

export type BlogPostStatus = 'DRAFT' | 'PUBLISHED';

export type BlogBlockType =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'quote'
  | 'list'
  | 'button'
  | 'callout'
  | 'divider';

export interface IBlogContentBlock {
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
  align?: 'left' | 'center' | 'right';
}

export interface IBlogSeo {
  metaTitle?: string;
  metaDescription?: string;
  keywords: string[];
  canonicalUrl?: string;
  ogImage?: string;
  noIndex: boolean;
}

export interface IBlogPost extends Document {
  title: string;
  slug: string;
  excerpt: string;
  coverImage?: string;
  coverImageAlt?: string;
  category?: string;
  tags: string[];
  authorName: string;
  status: BlogPostStatus;
  contentBlocks: IBlogContentBlock[];
  seo: IBlogSeo;
  readingMinutes: number;
  publishedAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const contentBlockSchema = new Schema<IBlogContentBlock>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['heading', 'paragraph', 'image', 'quote', 'list', 'button', 'callout', 'divider'],
      required: true,
    },
    text: { type: String, default: '' },
    level: { type: Number, min: 2, max: 4, default: 2 },
    items: { type: [String], default: [] },
    imageUrl: { type: String, default: '' },
    alt: { type: String, default: '' },
    caption: { type: String, default: '' },
    href: { type: String, default: '' },
    label: { type: String, default: '' },
    textColor: { type: String, default: '' },
    backgroundColor: { type: String, default: '' },
    fontSize: { type: String, default: 'base' },
    align: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  },
  { _id: false }
);

const blogSeoSchema = new Schema<IBlogSeo>(
  {
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    keywords: { type: [String], default: [] },
    canonicalUrl: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    noIndex: { type: Boolean, default: false },
  },
  { _id: false }
);

const blogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    excerpt: { type: String, default: '', maxlength: 320 },
    coverImage: { type: String, default: '' },
    coverImageAlt: { type: String, default: '' },
    category: { type: String, default: '', index: true },
    tags: { type: [String], default: [], index: true },
    authorName: { type: String, default: 'TallyPadi Team' },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT', index: true },
    contentBlocks: { type: [contentBlockSchema], default: [] },
    seo: { type: blogSeoSchema, default: () => ({ keywords: [], noIndex: false }) },
    readingMinutes: { type: Number, default: 1, min: 1 },
    publishedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ title: 'text', excerpt: 'text', tags: 'text', category: 'text' });

export const BlogPost = model<IBlogPost>('BlogPost', blogPostSchema);
