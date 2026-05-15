import type { CSSProperties } from 'react';
import type { BlogContentBlock } from '../../app/blog/types';

const fontSizeClass: Record<string, string> = {
  sm: 'text-base',
  base: 'text-lg',
  lg: 'text-xl',
  xl: 'text-2xl',
  '2xl': 'text-3xl',
};

const blockStyle = (block: BlogContentBlock): CSSProperties => ({
  color: block.textColor || undefined,
  backgroundColor: block.backgroundColor || undefined,
  textAlign: block.align || 'left',
});

const backgroundClass = (block: BlogContentBlock, classes: string) => (
  block.backgroundColor ? classes : ''
);

export default function BlogRenderer({ blocks }: { blocks: BlogContentBlock[] }) {
  if (!blocks.length) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 bg-white/70 p-8 text-stone-600">
        This article is being prepared.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {blocks.map((block) => {
        const style = blockStyle(block);
        const sizeClass = fontSizeClass[block.fontSize || 'base'] || fontSizeClass.base;

        if (block.type === 'divider') {
          return <hr key={block.id} className="my-10 border-stone-200" />;
        }

        if (block.type === 'heading') {
          if (block.level === 4) {
            return <h4 key={block.id} className={`text-2xl font-black text-stone-950 ${backgroundClass(block, 'rounded-lg px-5 py-4')}`} style={style}>{block.text}</h4>;
          }
          if (block.level === 3) {
            return <h3 key={block.id} className={`text-3xl font-black text-stone-950 ${backgroundClass(block, 'rounded-lg px-5 py-4')}`} style={style}>{block.text}</h3>;
          }
          return <h2 key={block.id} className={`text-4xl font-black text-stone-950 ${backgroundClass(block, 'rounded-lg px-5 py-4')}`} style={style}>{block.text}</h2>;
        }

        if (block.type === 'image') {
          return (
            <figure key={block.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
              {block.imageUrl ? (
                <img
                  src={block.imageUrl}
                  alt={block.alt || block.caption || 'TallyPadi blog image'}
                  className="max-h-[560px] w-full object-cover"
                />
              ) : (
                <div className="flex h-60 items-center justify-center bg-stone-100 text-sm text-stone-500">Image</div>
              )}
              {block.caption && <figcaption className="px-5 py-3 text-sm text-stone-600">{block.caption}</figcaption>}
            </figure>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              key={block.id}
              className={`border-l-4 border-emerald-600 bg-emerald-50 p-6 font-semibold italic leading-8 text-stone-800 ${sizeClass}`}
              style={style}
            >
              {block.text}
            </blockquote>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={block.id} className={`list-disc space-y-3 pl-6 leading-8 text-stone-800 ${sizeClass} ${backgroundClass(block, 'rounded-lg px-10 py-5')}`} style={style}>
              {(block.items || []).map((item, index) => <li key={`${block.id}-${index}`}>{item}</li>)}
            </ul>
          );
        }

        if (block.type === 'button') {
          return (
            <a
              key={block.id}
              href={block.href || '#'}
              className="inline-flex rounded-lg bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
            >
              {block.label || 'Open link'}
            </a>
          );
        }

        if (block.type === 'callout') {
          return (
            <div
              key={block.id}
              className={`rounded-lg border border-emerald-200 bg-emerald-50 p-6 font-semibold leading-8 text-emerald-950 ${sizeClass}`}
              style={style}
            >
              {block.text}
            </div>
          );
        }

        return (
          <p key={block.id} className={`leading-8 text-stone-800 ${sizeClass} ${backgroundClass(block, 'rounded-lg px-5 py-4')}`} style={style}>
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
