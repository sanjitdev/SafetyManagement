/**
 * Tailwind config — CityFix.
 *
 * Tailwind is the utility-class layer (per tech-audit.md §1). The full
 * design-token system (colors, type, spacing, radii, motion, themes) lives
 * in `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` and is
 * imported by `app/globals.css`. Tailwind's theme here is intentionally
 * narrow — utility classes for layout/flex/spacing/typography sizing —
 * so the visual design stays token-driven and the mockups stay the source
 * of truth.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Spacing — mirror the token scale so utility usage matches the
      // design system. The audit says tokens.css owns the canonical values.
      spacing: {
        '4xs': 'var(--space-1)',
        '3xs': 'var(--space-2)',
        '2xs': 'var(--space-3)',
        xs:   'var(--space-4)',
        sm:   'var(--space-5)',
        md:   'var(--space-6)',
        lg:   'var(--space-7)',
        xl:   'var(--space-8)',
      },
      // Border-radius — mirror token radii.
      borderRadius: {
        'xs-token': 'var(--radius-xs)',
        'sm-token': 'var(--radius-sm)',
        'md-token': 'var(--radius-md)',
        'lg-token': 'var(--radius-lg)',
        'pill-token': 'var(--radius-pill)',
      },
      // Font families — keep the spec's named families addressable from
      // Tailwind utilities without breaking the Bangla-first default.
      fontFamily: {
        body:    ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      // Layout breakpoints — match the explicit widths of the design
      // canvases (large 1440, medium 1024, phone 390). Tailwind's default
      // sm/md/lg/xl are kept available; these are token-anchored aliases.
      screens: {
        'canvas-large':  '1440px',
        'canvas-medium': '1024px',
        'canvas-phone':  '390px',
      },
    },
  },
  plugins: [],
};