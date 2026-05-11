export const DEFAULT_PRODUCT_IMAGE_URL =
  process.env.DEFAULT_PRODUCT_IMAGE_URL || 'https://tallypadi.com/tallypadi-product-placeholder.svg';

export const getPublicProductImage = (image?: string | null) =>
  String(image || '').trim() || DEFAULT_PRODUCT_IMAGE_URL;

export type StoreSetupStatus = {
  isComplete: boolean;
  missing: string[];
};

const hasText = (value: unknown, minLength = 1) => String(value || '').trim().length >= minLength;

export const getStoreSetupStatus = (user: any): StoreSetupStatus => {
  const location = user?.settings?.location || {};
  const missing: string[] = [];

  if (!hasText(user?.businessName, 2)) missing.push('businessName');
  if (!hasText(user?.shopSlug, 3)) missing.push('shopSlug');
  if (!hasText(user?.shopDescription, 10)) missing.push('shopDescription');
  if (!hasText(user?.phoneNumber, 6)) missing.push('phoneNumber');
  if (!hasText(location.country, 2)) missing.push('location.country');
  if (!hasText(location.state, 1)) missing.push('location.state');
  if (!hasText(location.city, 1)) missing.push('location.city');
  if (!hasText(location.address, 3)) missing.push('location.address');

  return {
    isComplete: missing.length === 0,
    missing,
  };
};

export const isStorefrontPublicReady = (user: any) => getStoreSetupStatus(user).isComplete;

export const getVerificationBadge = (user: any) => ({
  verified: user?.marketplaceVerificationStatus === 'VERIFIED',
  status: user?.marketplaceVerificationStatus || 'UNVERIFIED',
  label: user?.marketplaceVerificationStatus === 'VERIFIED' ? 'Verified ID' : null,
  verifiedAt: user?.marketplaceVerifiedAt || null,
  rating: {
    score: null,
    count: 0,
  },
});
