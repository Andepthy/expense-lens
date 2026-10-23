import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideProps } from 'lucide-react';

export type LucideIcon = ComponentType<LucideProps>;

const cache = new Map<LucideIcon, Map<number, string>>();

/**
 * Material's icon attributes take markup, not React nodes. Lucide renders a
 * trusted, self-contained SVG with currentColor, so serialising it once keeps
 * the icon set unified across navigation, buttons and text fields.
 */
export function iconMarkup(Icon: LucideIcon, size = 24, strokeWidth = 1.75): string {
  const sizes = cache.get(Icon) ?? new Map<number, string>();
  const cached = sizes.get(size);
  if (cached) return cached;
  // Material's navigation rail sets `svg { fill: currentColor }`. Lucide is a
  // stroke icon set, so pin fill off inline where the component CSS cannot
  // override it.
  const markup = renderToStaticMarkup(
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      style={{ fill: 'none', stroke: 'currentColor' }}
    />,
  );
  sizes.set(size, markup);
  cache.set(Icon, sizes);
  return markup;
}
