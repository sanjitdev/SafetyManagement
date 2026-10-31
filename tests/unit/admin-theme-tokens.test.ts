/**
 * Vitest: regression guard for hardcoded Tailwind palette utilities
 * in the admin surfaces.
 *
 * ## The bug
 *
 * The admin console did not respond to the theme toggle. The user
 * saw a correctly-dark global `AppHeader` sitting on top of a
 * stubbornly light admin body — hardcoded white cards, slate text,
 * amber banners — with no way to read the page in dark mode.
 *
 * ## Why it happened — and it was NOT the theme system
 *
 * The theme machinery is correct and shared by every role:
 *
 * | Piece | Location | Status |
 * |---|---|---|
 * | Appearance helpers | `lib/theme/appearance.ts` | correct |
 * | `ThemeProvider` (owns `documentElement.classList`) | `lib/theme/ThemeProvider.tsx` | correct |
 * | Pre-paint boot script (no FOUC) | `app/appearance-boot.tsx` | correct |
 * | Full dark token block | `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` | correct |
 * | Shared header + toggle | `components/AppHeader.tsx`, `components/ThemeToggle.tsx` | correct |
 *
 * The project is **100% CSS-custom-property driven**, not Tailwind
 * `dark:`-variant driven. `tailwind.config.js` has no `darkMode`
 * key and the repo contains zero `dark:` variant usages. Every
 * surface except admin follows the convention:
 *
 * ```tsx
 * style={{ background: 'var(--color-surface-card)', borderBottom: '1px solid var(--color-border)' }}
 * ```
 *
 * `app/admin/**` was the ONLY part of the codebase written with
 * hardcoded Tailwind palette utilities (`bg-slate-50`, `text-slate-900`,
 * `bg-emerald-600`, …). Those utilities are static CSS classes — they
 * cannot respond to the `.theme-dark` class, so they render
 * identically in both themes. The token mechanism was fine; the
 * admin surface had opted out of it.
 *
 * ## Why a SOURCE scan and not a DOM scan
 *
 * A DOM-based detector cannot work here: `getComputedStyle` resolves
 * `var(--x)` to a literal `rgb()`, so it cannot distinguish
 * token-sourced colour from hardcoded colour. The existing
 * "Hard-coded color audit" in `tests/02-live-audit.spec.ts` tried,
 * had an operator-precedence bug that reported every transparent
 * element as an offender, surveyed only `ROUTES.slice(0, 4)`
 * (never reaching `/admin`), and could never fail.
 *
 * The reliable detector reads the source. That is what this file
 * does.
 *
 * ## What this pins
 *
 * 1. No hardcoded Tailwind palette utility survives anywhere in
 *    `app/admin/**`, `components/AdminSecurityKey.tsx` or
 *    `components/WebAuthnCeremony.tsx`.
 * 2. The palette scan also runs over the rest of `app/` + `components/`
 *    to prove the admin surface was the only offender — so a
 *    regression elsewhere is caught too.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Repo root — `tests/unit/` is two levels down. */
const ROOT = join(__dirname, '..', '..');

/**
 * Tailwind palette utilities with a hardcoded colour.
 *
 * The first alternative catches the numeric palette shades
 * (`bg-slate-50`, `text-emerald-700`, `border-rose-200`, …). The
 * second catches the bare extremes (`bg-white`, `text-black`) which
 * take no shade number.
 */
const PALETTE_PATTERN =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\b(?:bg|text|border)-(?:white|black)\b/g;

/**
 * Directories and files that are allowed to carry a palette
 * utility. Each entry needs a justification.
 *
 * Currently EMPTY. Every admin surface has been migrated to design
 * tokens, so there is no legitimate exception left. The list exists
 * so that a future, genuinely-justified exception is a one-line
 * change with a stated reason rather than a silent widening of the
 * scanner.
 */
const ALLOW_LIST: Array<{ path: string; reason: string }> = [];

interface Offender {
  file: string;
  line: number;
  match: string;
  text: string;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan a set of files for hardcoded palette utilities.
 *
 * The scan is line-based and reports the offending CLASS, so the
 * failure message tells the developer exactly what to replace.
 */
function scanForPalette(files: string[]): Offender[] {
  const offenders: Offender[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const allow = ALLOW_LIST.find((a) => rel.endsWith(a.path));
    const source = readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      PALETTE_PATTERN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PALETTE_PATTERN.exec(line)) !== null) {
        if (allow) continue;
        offenders.push({
          file: rel,
          line: i + 1,
          match: m[0],
          text: line.trim(),
        });
      }
    }
  }
  return offenders;
}

function formatOffenders(offenders: Offender[]): string {
  return offenders
    .map((o) => `  ${o.file}:${o.line}  ${o.match}\n      ${o.text}`)
    .join('\n');
}

describe('admin surfaces carry no hardcoded Tailwind palette utilities', () => {
  it('app/admin/** is clean', () => {
    const files = listSourceFiles(join(ROOT, 'app', 'admin'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = scanForPalette(files);
    expect(
      offenders,
      `Hardcoded Tailwind palette utilities found. The admin surface must use design tokens (var(--color-*)) so it follows the theme:\n${formatOffenders(
        offenders,
      )}`,
    ).toEqual([]);
  });

  it('the admin-only components are clean', () => {
    const files = [
      join(ROOT, 'components', 'AdminSecurityKey.tsx'),
      join(ROOT, 'components', 'WebAuthnCeremony.tsx'),
    ];
    const offenders = scanForPalette(files);
    expect(
      offenders,
      `Hardcoded Tailwind palette utilities found in the admin-only components:\n${formatOffenders(
        offenders,
      )}`,
    ).toEqual([]);
  });

  it('the whole app/ + components/ tree is clean', () => {
    // The admin surface was the only offender; this proves it stays
    // that way and catches a regression elsewhere.
    const files = [
      ...listSourceFiles(join(ROOT, 'app')),
      ...listSourceFiles(join(ROOT, 'components')),
    ];
    expect(files.length).toBeGreaterThan(0);
    const offenders = scanForPalette(files);
    expect(
      offenders,
      `Hardcoded Tailwind palette utilities found outside the migrated surfaces:\n${formatOffenders(
        offenders,
      )}`,
    ).toEqual([]);
  });
});

describe('the theme tokens the admin surface depends on are defined', () => {
  /**
   * The admin surface references these tokens. If one is missing
   * from `tokens.css`, the declaration silently drops and the
   * element falls back to its inherited colour — which is how the
   * original `--color-bg` bug (dark-only token used in light mode)
   * presented.
   */
  const REQUIRED_TOKENS = [
    '--color-surface-page',
    '--color-surface-card',
    '--color-surface-raised',
    '--color-surface-sunken',
    '--color-ink',
    '--color-ink-secondary',
    '--color-ink-tertiary',
    '--color-ink-muted',
    '--color-border',
    '--color-border-strong',
    '--color-border-focus',
    '--color-primary',
    '--color-primary-hover',
    '--color-primary-pressed',
    '--color-primary-soft',
    '--color-on-primary',
    '--color-success',
    '--color-success-soft',
    '--color-warning',
    '--color-warning-soft',
    '--color-danger',
    '--color-danger-soft',
  ];

  const TOKENS_CSS = join(
    ROOT,
    'design-artifacts',
    'D-Design-System',
    '01-Visual-Design',
    'tokens.css',
  );

  function tokenBlock(css: string, selector: string): string {
    const start = css.indexOf(selector);
    expect(start, `selector ${selector} not found in tokens.css`).toBeGreaterThan(-1);
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    return css.slice(open + 1, close);
  }

  it('defines every token in the light :root block', () => {
    const css = readFileSync(TOKENS_CSS, 'utf8');
    const block = tokenBlock(css, ':root');
    const missing = REQUIRED_TOKENS.filter((t) => !block.includes(`${t}:`));
    expect(missing, `missing from :root → ${missing.join(', ')}`).toEqual([]);
  });

  it('defines every token in the .theme-dark block', () => {
    const css = readFileSync(TOKENS_CSS, 'utf8');
    const block = tokenBlock(css, '.theme-dark');
    const missing = REQUIRED_TOKENS.filter((t) => !block.includes(`${t}:`));
    expect(missing, `missing from .theme-dark → ${missing.join(', ')}`).toEqual([]);
  });

  it('does not use a token that only exists in the dark block', () => {
    // `--color-bg` was defined ONLY inside `.theme-dark`, so the two
    // panels that used it were transparent in light mode. This
    // pins the shape of that class of bug.
    const css = readFileSync(TOKENS_CSS, 'utf8');
    const light = tokenBlock(css, ':root');
    const dark = tokenBlock(css, '.theme-dark');
    expect(light).not.toContain('--color-bg:');
    expect(dark).toContain('--color-bg:');
  });
});
