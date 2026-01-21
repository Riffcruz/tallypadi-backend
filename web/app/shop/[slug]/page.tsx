import { Metadata } from 'next';
import ShopClient from './ShopClient';

// Helper to fetch data
async function getShopData(slug: string) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
  // Revalidate every 60 seconds to keep shop data fresh but cacheable
  const res = await fetch(`${API_URL}/shop/${slug}`, { next: { revalidate: 60 } });
  
  if (!res.ok) {
      if (res.status === 404) return null;
      // Depending on error handling strategy, we might return null or throw
      return null;
  }
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
  
  const data = await getShopData(slug);

  if (!data) return { title: 'Shop Not Found' };

  let imageUrl: string | undefined;
  
  // If productId is present, try to find the product image for OG tag
  if (productId && data.products) {
      const product = data.products.find((p: any) => p._id === productId);
      if (product && product.image) {
           const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
           const baseUrl = API_URL.replace(/\/api\/?$/, '');
           if (product.image.startsWith('http') || product.image.startsWith('data:')) {
               imageUrl = product.image;
           } else {
               imageUrl = `${baseUrl}${product.image.startsWith('/') ? '' : '/'}${product.image}`;
           }
      }
  }

  return {
      title: `${data.shop.name} on Tallypadi`,
      description: `Check out products from ${data.shop.name}`,
      openGraph: {
          title: data.shop.name,
          description: `Check out products from ${data.shop.name}`,
          images: imageUrl ? [imageUrl] : [],
      },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const data = await getShopData(slug);

  return <ShopClient data={data} slug={slug} />;
}