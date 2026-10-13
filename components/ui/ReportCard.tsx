/**
 * ReportCard — dense list-row primitive for activity feeds,
 * my-reports lists, and dispatcher queue rows.
 *
 * S-003.4 (ReportCard + StatusPill standardization). Extracted
 * from the inline `ActivityCard` in `app/home/page.tsx` so the
 * same visual density + status pill composition applies across
 * the home, my-reports, and dispatcher surfaces.
 *
 * The card is a link (the entire row is clickable; the parent
 * supplies the destination via the `href` prop). When `isNew`
 * is true the background tints to the primary-soft token and
 * a "new" badge appears next to the age timestamp.
 *
 * The card is presentational only. It does not fetch, route,
 * or own state. The photo thumb is rendered as a CSS background
 * so the card avoids `next/image` config coupling; in v1.1 the
 * thumb can move to `<Image fill>` if we add image optimization.
 *
 * The card is locale-aware (`lang` prop) and Bangla-first.
 */

import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { StatusPill, type StatusKey } from './StatusPill';

export interface ReportCardProps {
  /** Destination URL when the row is clicked. */
  href: string;
  /** Localized category name (already translated by the parent). */
  categoryName: string;
  /** Localized ward name; may be empty. */
  wardName?: string;
  /** Free-text note shown on a single ellipsised line. */
  note?: string | null;
  /** First photo URL; empty / non-http falls back to a gradient. */
  photoUrl?: string | null;
  /** Status key driving the StatusPill on the right. */
  status: StatusKey;
  /** ISO timestamp used to compute the "X min ago" / "X hr ago" label. */
  createdAt: string;
  /** Bumps the soft-tint background and the "new" badge. */
  isNew?: boolean;
  lang: Language;
  /** Optional className passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return lang === 'bn' ? `${minutes} মিনিট আগে` : `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === 'bn' ? `${days} দিন আগে` : `${days} day ago`;
}

export function ReportCard({
  href,
  categoryName,
  wardName,
  note,
  photoUrl,
  status,
  createdAt,
  isNew,
  lang,
  className,
  'data-testid': testId,
}: ReportCardProps) {
  const thumbBg =
    photoUrl && photoUrl.startsWith('http')
      ? `url(${photoUrl}) center/cover`
      : 'linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-surface-raised) 100%)';

  return (
    <Link
      href={href}
      lang={lang}
      data-testid={testId}
      data-new={isNew ? 'true' : undefined}
      className={className}
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: isNew ? 'var(--color-primary-soft)' : 'var(--color-surface-page)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: 'var(--color-ink)',
        transition: 'background var(--duration-base) var(--ease-out)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-sm)',
          background: thumbBg,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-1)',
          }}
        >
          <span
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-semibold)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {categoryName}
          </span>
          <StatusPill status={status} lang={lang} />
        </div>
        {note && (
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {note}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {wardName && <span lang={lang}>{wardName}</span>}
          {wardName && <span aria-hidden>·</span>}
          <span lang={lang}>{formatAge(createdAt, lang)}</span>
          {isNew && (
            <span
              lang={lang}
              style={{
                marginLeft: 'auto',
                padding: '2px 6px',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 10,
                fontWeight: 'var(--weight-bold)',
              }}
            >
              {t('home.activity.new_badge', null, lang)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}