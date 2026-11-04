/** The shared CityFix pin-and-check mark used across every app surface. */
export function CityFixMark({ size = 38 }: { size?: number }) {
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
