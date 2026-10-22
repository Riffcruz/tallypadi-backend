import marketplaceCategories from '../../src/config/marketplaceCategories.json';

export type SmartCategory = {
  id: string;
  label: string;
  count?: number;
};

export const MARKETPLACE_CATEGORIES: SmartCategory[] = marketplaceCategories.map(({ id, label }) => ({ id, label }));
export const MARKETPLACE_CATEGORY_IDS = new Set(MARKETPLACE_CATEGORIES.map((category) => category.id));
export const MARKETPLACE_CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  marketplaceCategories.map(({ id, icon }) => [id, icon])
);
MARKETPLACE_CATEGORY_ICONS.other = '📦';

export const cleanMarketplaceCategories = (incoming: SmartCategory[]) => {
  const counts = new Map<string, number>();
  let otherCount = 0;

  incoming.forEach((category) => {
    const count = Math.max(0, Number(category.count) || 0);
    if (MARKETPLACE_CATEGORY_IDS.has(category.id)) {
      counts.set(category.id, (counts.get(category.id) || 0) + count);
    } else {
      otherCount += count;
    }
  });

  const categories = MARKETPLACE_CATEGORIES.map((category) => {
    const count = counts.get(category.id);
    return count === undefined ? category : { ...category, count };
  });

  if (otherCount > 0) categories.push({ id: 'other', label: 'Other', count: otherCount });
  return categories;
};
