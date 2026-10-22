import Image from 'next/image';

const canOptimizeMarketplaceImage = (src: string) => {
  if (src.startsWith('/')) return true;

  try {
    const hostname = new URL(src).hostname;
    return hostname === 'tallypadi.com'
      || hostname.endsWith('.tallypadi.com')
      || hostname.endsWith('.r2.dev');
  } catch {
    return false;
  }
};

export default function MarketplaceImage({
  src,
  alt,
  sizes,
  className = 'object-cover',
  priority = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      quality={72}
      priority={priority}
      unoptimized={!canOptimizeMarketplaceImage(src)}
      className={className}
    />
  );
}
