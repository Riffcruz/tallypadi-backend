import type { BlogPost } from './types';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

type BlogListResponse = {
  posts?: BlogPost[];
};

type BlogDetailResponse = {
  post?: BlogPost;
};

const fetchWithTimeout = async (url: string, timeoutMs = 2500) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      next: { revalidate: 300 },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchBlogPosts = async (limit = 24): Promise<BlogPost[]> => {
  try {
    const res = await fetchWithTimeout(`${apiUrl}/blog?limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as BlogListResponse;
    return Array.isArray(data.posts) ? data.posts : [];
  } catch {
    return [];
  }
};

export const fetchBlogPost = async (slug: string): Promise<BlogPost | null> => {
  try {
    const res = await fetchWithTimeout(`${apiUrl}/blog/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as BlogDetailResponse;
    return data.post || null;
  } catch {
    return null;
  }
};
