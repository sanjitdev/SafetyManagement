/**
 * CategoryIcon — the visual glyph for a report category.
 *
 * WHY THIS EXISTS
 * ---------------
 * Three surfaces (the dispatcher queue, the crew list and the crew
 * ticket detail) each hand-rolled a `categoryIcon(slug)` helper that
 * returned an EMOJI — `💡`, `🕳️`, `🌊`, `🗑️`. Emoji are font
 * dependent: they rendered as a colour picture on Windows, a
 * monochrome outline on Linux, and a boxed glyph on some Android
 * builds. They could not be recoloured by a theme token, so the
 * dark theme showed a bright emoji on a dark tile.
 *
 * The registry in `lib/ui/icon-map.ts` is the single source of truth:
 * one icon family (Phosphor, Outline weight), one colour token per
 * category, and a graceful fallback for a slug the app has not seen.
 *
 * The icon is decorative — the category NAME is always rendered as
 * text next to it — so it is `aria-hidden` and never announced.
 */

import { categoryIcon, categoryIconColor } from '@/lib/ui/icon-map';

export interface CategoryIconProps {
  /** The category slug (e.g. "streetlight"). Unknown slugs fall back to `other`. */
  slug: string | null | undefined;
  /** Rendered size in px. Defaults to 20. */
  size?: number;
  /**
   * Override the glyph colour.
   *
   * The default is the category's own colour token, which is the point
   * of the icon on a light surface. On a SOLID brand-coloured tile the
   * category colour is illegible — a slate pothole glyph on a civic
   * blue tile reads as a smudge — so the caller passes the tile's
   * foreground instead.
   */
  color?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function CategoryIcon({
  slug,
  size = 20,
  color,
  'data-testid': testId,
}: CategoryIconProps) {
  const entry = categoryIcon(slug);
  const IconComponent = entry.icon;

  return (
    <span
      aria-hidden
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color ?? categoryIconColor(slug),
      }}
    >
      <IconComponent size={size} weight={entry.weight} aria-hidden focusable="false" />
    </span>
  );
}
