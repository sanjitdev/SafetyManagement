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
 *
 * THE MARK
 * --------
 * One idea, drawn once: a civic-blue map pin whose eye is a CARVED
 * WHITE SQUARE, with the service-green check sitting inside it.
 *
 *   the PIN  = a civic issue at a place
 *   the EYE  = the issue, looked at
 *   the CHECK = reported, and resolved
 *
 * The eye is a square rather than a circle on purpose. A circle reads
 * as "generic map pin"; a square with a tight corner radius reads as
 * civic and Swiss, and it echoes the radius language of the app's own
 * cards and tiles. It is also the version that stays crisp at 16px,
 * which is where a favicon has to live.
 *
 * Colours are the design tokens so the mark follows the theme:
 * `--color-primary` (civic blue), `--color-surface-card` (the carved
 * eye) and `--color-success` (the check). In the dark theme those
 * tokens invert to a lighter blue, a near-black eye and a lighter
 * green, and the mark stays legible without a second code path.
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
        {/* Pin body — civic blue. */}
        <path
          d="M12 22.4c-.4 0-.74-.21-.93-.57C10.65 20.7 6.2 15.2 6.2 10 6.2 5.6 8.9 2 12.2 2S18.2 5.6 18.2 10c0 5.2-4.45 10.7-4.87 11.83-.19.36-.53.57-.93.57Z"
          fill="var(--color-primary)"
        />
        {/* The carved eye — the issue, looked at. */}
        <rect x="7.5" y="5.1" width="9" height="9" rx="2" fill="var(--color-surface-card)" />
        {/* The check — reported, and resolved. */}
        <path
          d="M9.6 9.5 11.3 11.2l3.4-3.6"
          stroke="var(--color-success)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
