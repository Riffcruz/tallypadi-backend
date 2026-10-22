'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MARKETPLACE_CATEGORY_ICONS, type SmartCategory } from '../../lib/marketplaceCatalog';

export default function MarketplaceCategoryGrid({
  categories,
  selectedCategory,
  onCategoryChange,
}: {
  categories: SmartCategory[];
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedIsHidden = Boolean(selectedCategory && categories.slice(7).some((category) => category.id === selectedCategory));
  const visibleCategories = useMemo(
    () => (expanded || selectedIsHidden ? categories : categories.slice(0, 7)),
    [categories, expanded, selectedIsHidden]
  );
  const canExpand = categories.length > 7;

  return (
    <section className="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:hidden">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-black text-stone-950">Browse categories</h2>
        {selectedCategory && <button type="button" onClick={() => onCategoryChange('')} className="text-xs font-black text-emerald-700">Clear</button>}
      </div>

      <div className="grid grid-cols-4 gap-x-2 gap-y-5">
        <button type="button" onClick={() => onCategoryChange('')} className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl ${!selectedCategory ? 'bg-emerald-600 text-white ring-2 ring-emerald-200' : 'bg-stone-100'}`}>🛍️</span>
          <span className="text-[11px] font-bold leading-4 text-stone-700">All products</span>
        </button>
        {visibleCategories.map((item) => (
          <button key={item.id} type="button" onClick={() => onCategoryChange(item.id)} className="flex min-w-0 flex-col items-center gap-2 text-center">
            <span className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl ${selectedCategory === item.id ? 'bg-emerald-600 ring-2 ring-emerald-200' : 'bg-slate-100'}`}>
              {MARKETPLACE_CATEGORY_ICONS[item.id] || '📦'}
            </span>
            <span className="line-clamp-2 text-[11px] font-bold leading-4 text-stone-700">{item.label}</span>
          </button>
        ))}
      </div>

      {canExpand && !selectedIsHidden && (
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-5 flex w-full items-center justify-center gap-1.5 border-t border-stone-100 pt-3 text-xs font-black text-emerald-700">
          {expanded ? 'Show less' : 'More categories'} <ChevronDown size={15} className={`transition ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </section>
  );
}
