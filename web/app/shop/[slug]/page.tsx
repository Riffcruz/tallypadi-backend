import { Metadata } from 'next';
import ShopClient from './ShopClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';

// Helper to fetch shop data
async function getShopData(slug: string) {
  // Revalidate every 60 seconds
  const res = await fetch(`${API_URL}/shop/${slug}`, { next: { revalidate: 60 } });
  
  if (!res.ok) {
      if (res.status === 404) return null;
      return null;
  }
  return res.json();
}

// Helper to fetch single product data for metadata
async function getProductData(slug: string, productId: string) {
  const res = await fetch(`${API_URL}/shop/${slug}/products/${productId}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.json();
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const productId = resolvedSearchParams.productId as string | undefined;
  
  const shopData = await getShopData(slug);

  if (!shopData) return { title: 'Shop Not Found' };

  let title = `${shopData.shop.name} on Tallypadi`;
  let description = shopData.shop.description || `Check out products from ${shopData.shop.name}`;
  let imageUrl = shopData.shop.heroImageUrl;

  // If viewing a specific product, override metadata
  if (productId) {
     const product = await getProductData(slug, productId);
     if (product) {
        title = `${product.name} | ${shopData.shop.name}`;
        description = `Buy ${product.name} for ₦${product.price ? product.price.toLocaleString() : '0'}. ${shopData.shop.description || ''}`;
        if (product.image) {
           // Ensure absolute URL if it's relative
           if (product.image.startsWith('http') || product.image.startsWith('data:')) {
               imageUrl = product.image;
           } else {
               const baseUrl = API_URL.replace(/\/api\/?$/, '');
               imageUrl = `${baseUrl}${product.image.startsWith('/') ? '' : '/'}${product.image}`;
           }
        }
     }
  }

  return {
      title: title,
      description: description,
      openGraph: {
          title: title,
          description: description,
          images: imageUrl ? [imageUrl] : [],
      },
      twitter: {
        card: 'summary_large_image',
        title: title,
        description: description,
        images: imageUrl ? [imageUrl] : [],
      }
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const data = await getShopData(slug);

  return <ShopClient initialShop={data?.shop || null} slug={slug} />;
}