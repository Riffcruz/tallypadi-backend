type ProductSeoSource = 'SYSTEM' | 'BOOST' | 'AI' | 'FALLBACK';

export interface MarketplaceProductSeo {
  title: string;
  metaDescription: string;
  adDescription: string;
  keywords: string[];
  generatedAt?: Date;
  source?: ProductSeoSource;
}

type ProductLike = {
  name?: string;
  category?: string | null;
  description?: string | null;
  lastUnitPrice?: number | null;
  marketplaceSeo?: Partial<MarketplaceProductSeo> | null;
};

type OwnerLike = {
  businessName?: string | null;
  countryCode?: string | null;
  marketplaceVerificationStatus?: string | null;
  settings?: {
    currencyCode?: string | null;
    location?: {
      country?: string | null;
      state?: string | null;
      city?: string | null;
      address?: string | null;
    } | null;
  } | null;
};

type BoostLike = {
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string[] | null;
  adDescription?: string | null;
};

type BuildOptions = {
  source?: ProductSeoSource;
  extraKeywords?: unknown;
  adBrief?: string | null;
  targetAudience?: string | null;
  campaignGoal?: string | null;
};

const cleanText = (value: unknown, maxLength: number) =>
  String(value || '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const titleCase = (value: unknown) =>
  cleanText(value, 160)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const truncateSentence = (value: string, maxLength: number) => {
  const clean = cleanText(value, maxLength + 40);
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1).trim();
};

const normalizeKeywords = (value: unknown, maxItems = 12) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(
    raw
      .map((item) => cleanText(item, 70).toLowerCase())
      .filter(Boolean)
  )).slice(0, maxItems);
};

const currencyForOwner = (owner?: OwnerLike | null) => {
  const explicit = cleanText(owner?.settings?.currencyCode, 8).toUpperCase();
  if (explicit) return explicit;

  const countryMap: Record<string, string> = {
    NG: 'NGN',
    GH: 'GHS',
    KE: 'KES',
    ZA: 'ZAR',
    US: 'USD',
    GB: 'GBP',
  };
  return countryMap[cleanText(owner?.countryCode || owner?.settings?.location?.country || 'NG', 8).toUpperCase()] || 'NGN';
};

const formatPrice = (amount?: number | null, currencyCode = 'NGN') => {
  if (!amount || amount <= 0) return '';
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currencyCode} ${Number(amount || 0).toLocaleString()}`;
  }
};

const locationParts = (owner?: OwnerLike | null) => {
  const location = owner?.settings?.location;
  return {
    city: cleanText(location?.city, 80),
    state: cleanText(location?.state, 80),
    country: cleanText(location?.country || owner?.countryCode || 'NG', 20),
    address: cleanText(location?.address, 160),
  };
};

const hasUsableSeo = (seo?: Partial<MarketplaceProductSeo> | null) =>
  Boolean(seo?.title && seo?.metaDescription && seo?.adDescription);

export const buildMarketplaceProductSeo = (
  product: ProductLike,
  owner?: OwnerLike | null,
  options: BuildOptions = {}
): MarketplaceProductSeo => {
  const productName = titleCase(product.name || 'Product');
  const category = titleCase(product.category || '');
  const businessName = cleanText(owner?.businessName || 'TallyPadi seller', 90);
  const currencyCode = currencyForOwner(owner);
  const price = formatPrice(product.lastUnitPrice, currencyCode);
  const location = locationParts(owner);
  const cityState = [location.city, location.state].filter(Boolean).join(', ');
  const locationText = cityState ? ` in ${cityState}` : location.country ? ` in ${location.country}` : '';
  const categoryText = category ? `${category} ` : '';
  const priceText = price ? ` for ${price}` : '';
  const boostLead = options.source === 'BOOST' ? 'Sponsored listing: ' : '';
  const verifiedText = owner?.marketplaceVerificationStatus === 'VERIFIED' ? ' verified seller' : ' seller';
  const briefText = cleanText(options.adBrief || options.campaignGoal || '', 180);
  const audienceText = cleanText(options.targetAudience, 140);

  const titleBase = `${productName}${locationText} | TallyPadi Marketplace`;
  const fallbackTitle = `${productName} | TallyPadi Marketplace`;
  const title = truncateSentence(titleBase, 65) || truncateSentence(fallbackTitle, 65);

  const descriptor = [
    productName,
    category ? `${categoryText.trim()} product` : 'product',
    price ? `priced at ${price}` : '',
    cityState ? `from ${businessName}${locationText}` : `from ${businessName}`,
  ].filter(Boolean).join(', ');

  const metaDescription = truncateSentence(
    `${boostLead}Buy ${descriptor}. View details, availability, seller location, and contact the merchant on TallyPadi Marketplace.`,
    170
  );

  const descriptionBase = cleanText(product.description, 360);
  const adDescription = truncateSentence(
    [
      boostLead ? boostLead.trim() : '',
      descriptionBase || `${productName}${priceText}${locationText} from ${businessName}.`,
      `Check product details, available options, shop location, and contact the${verifiedText} directly on TallyPadi Marketplace.`,
      briefText ? `Campaign note: ${briefText}.` : '',
      audienceText ? `Useful for ${audienceText}.` : '',
    ].filter(Boolean).join(' '),
    700
  );

  const keywordSeeds = [
    productName,
    category,
    businessName,
    location.city,
    location.state,
    location.country,
    `${productName} ${location.city}`.trim(),
    `${productName} ${location.state}`.trim(),
    category ? `${category} ${location.state}`.trim() : '',
    category ? `buy ${category} in Nigeria` : '',
    `buy ${productName} in Nigeria`,
    'TallyPadi Marketplace',
    'Nigeria online marketplace',
    'African SME marketplace',
    ...(normalizeKeywords(options.extraKeywords, 12)),
  ];

  return {
    title,
    metaDescription,
    adDescription,
    keywords: normalizeKeywords(keywordSeeds, 12),
    generatedAt: new Date(),
    source: options.source || 'SYSTEM',
  };
};

export const getMarketplaceProductSeo = (
  product: ProductLike,
  owner?: OwnerLike | null,
  boost?: BoostLike | null
): MarketplaceProductSeo => {
  const boostSeo: MarketplaceProductSeo | null = boost?.seoTitle || boost?.seoDescription || boost?.adDescription
    ? {
      ...buildMarketplaceProductSeo(product, owner, { source: 'BOOST', extraKeywords: boost?.seoKeywords || [] }),
      title: cleanText(boost?.seoTitle, 65) || buildMarketplaceProductSeo(product, owner, { source: 'BOOST' }).title,
      metaDescription: cleanText(boost?.seoDescription, 170) || buildMarketplaceProductSeo(product, owner, { source: 'BOOST' }).metaDescription,
      adDescription: cleanText(boost?.adDescription, 700) || buildMarketplaceProductSeo(product, owner, { source: 'BOOST' }).adDescription,
      keywords: normalizeKeywords(boost?.seoKeywords || [], 12).length
        ? normalizeKeywords(boost?.seoKeywords || [], 12)
        : buildMarketplaceProductSeo(product, owner, { source: 'BOOST' }).keywords,
      source: 'BOOST',
    }
    : null;

  if (boostSeo && hasUsableSeo(boostSeo)) return boostSeo;
  if (hasUsableSeo(product.marketplaceSeo)) {
    return {
      ...buildMarketplaceProductSeo(product, owner),
      ...product.marketplaceSeo,
      keywords: normalizeKeywords(product.marketplaceSeo?.keywords || [], 12),
      generatedAt: product.marketplaceSeo?.generatedAt || new Date(),
      source: product.marketplaceSeo?.source || 'SYSTEM',
    };
  }

  return buildMarketplaceProductSeo(product, owner);
};
