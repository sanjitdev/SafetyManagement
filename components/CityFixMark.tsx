/**
 * The shared CityFix pin-and-check mark used across every app surface.
 *
 * `size` defaults to 34 — the brand size used on EVERY surface (public
 * landing, login/register, splash, the app header, the role sidebar and
 * the admin dashboard). The brand used to render at three different
 * sizes (34 on the public pages, 38 in the shared header, 44 in the role
 * sidebar and 48 on the admin dashboard), which made the dashboard pages
 * read as a different product from the rest of the app.
 *
 * Callers should not pass `size` unless they are reproducing a
 * deliberate, documented deviation; prefer the default so the brand
 * stays consistent.
 */
export function CityFixMark({ size = 34 }: { size?: number }) {
  const iconSize = Math.round(size * 0.71);

  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        display: 'inline-grid',
        placeItems: 'center',
        flexShrink: 0,
        background: 'var(--color-primary-soft)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" focusable="false">
        <path
          d="M12 22.5c-.42 0-.78-.22-.98-.6C10.6 20.9 6 15.3 6 9.9 6 5.4 9.13 1.8 12.95 1.8S20 5.4 20 9.9c0 5.4-4.6 11-5.02 12-.2.38-.56.6-.98.6Z"
          fill="var(--color-ink)"
        />
        <path d="M7.1 6.6a6.1 6.1 0 0 1 3-2.35" stroke="var(--color-primary)" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M8.9 9.6 11.3 12l4.1-4.4" stroke="var(--color-success)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
