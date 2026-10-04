/**
 * Home route — scaffold entry.
 *
 * This page is a Phase 1 (WO-000 platform) development placeholder. It
 * exists to prove the Next.js scaffold works end-to-end:
 *   - App Router compiles
 *   - tokens.css loads via globals.css
 *   - Bangla-first typography baseline renders
 *   - The design-canvas viewport (1440 × 900) displays correctly
 *
 * WO-001 (Rahim / citizen) will replace this with the real `1.6 Home / City
 * Activity` page per `mockups/02-home-city-activity.html`. Until then this
 * is the "hello world" that the Playwright `npm run dev` smoke test can hit.
 *
 * See:
 *   - design-artifacts/E-Development/000-PRD.md — master PRD
 *   - design-artifacts/E-Development/WO-001-citizen-report-flow.md — page 1.6
 *   - design-artifacts/D-Design-System/01-Visual-Design/mockups/02-home-city-activity.html
 */

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-7) var(--space-5)',
      }}
    >
      <div style={{ maxWidth: 640, textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: 'var(--color-primary)',
            borderRadius: '50%',
            marginBottom: 'var(--space-3)',
          }}
          aria-hidden
        />
        <h1
          style={{
            fontSize: 'var(--text-display-lg)',
            margin: '0 0 var(--space-3)',
            color: 'var(--color-ink)',
          }}
        >
          CityFix
        </h1>
        <p
          style={{
            fontSize: 'var(--text-body-lg)',
            color: 'var(--color-ink-secondary)',
            lineHeight: 1.6,
            margin: '0 0 var(--space-5)',
          }}
        >
          The platform scaffold is live. WO-000 (platform foundation) is in
          progress; WO-001 will replace this page with the citizen Home view
          (mockup&nbsp;02).
        </p>
        <div
          style={{
            display: 'inline-block',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-secondary)',
          }}
        >
          v1 scaffold · WO-000 in progress
        </div>
      </div>
    </main>
  );
}