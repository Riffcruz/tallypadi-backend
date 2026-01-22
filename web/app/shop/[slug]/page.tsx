import { Metadata } from 'next';
import ShopClient from './ShopClient';

// Helper to fetch data
async function getShopData(slug: string) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tallypadi.com/api';
  // Revalidate every 60 seconds
  const res = await fetch(`${API_URL}/shop/${slug}`, { next: { revalidate: 60 } });
  
  if (!res.ok) {
      if (res.status === 404) return null;
      return null;
  }
  return res.json();
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  
  const data = await getShopData(slug);

  if (!data) return { title: 'Shop Not Found' };

  return {
      title: `${data.shop.name} on Tallypadi`,
      description: data.shop.description || `Check out products from ${data.shop.name}`,
      openGraph: {
          title: data.shop.name,
          description: data.shop.description || `Check out products from ${data.shop.name}`,
          images: data.shop.heroImageUrl ? [data.shop.heroImageUrl] : [],
      },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const data = await getShopData(slug);

  return <ShopClient initialShop={data?.shop || null} slug={slug} />;
}
