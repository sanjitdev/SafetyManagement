/**
 * The mockups reference only tokens that `tokens.css` defines.
 *
 * THE BUG THIS CATCHES
 * --------------------
 * A `var(--color-primary-on)` with no matching declaration resolves to
 * NOTHING. The declaration it belongs to is silently dropped, the
 * element inherits whatever it would have inherited, and the page
 * renders a button with the wrong text colour — with no console error,
 * no build error and no failing test.
 *
 * That is exactly what happened in the Wave 1.1 token rewrite:
 * `--color-primary-on` was renamed to `--color-on-primary`, and seven
 * mockups kept the old name. The mockups still LOOKED fine in a
 * casual glance (the primary buttons inherited a near-white text
 * colour from the page), so the drift survived until an audit script
 * compared the two token sets.
 *
 * The rule is now a TEST: every `var(--token)` in every mockup and in
 * the component library must name a token that `tokens.css` defines.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DESIGN_DIR = join(ROOT, 'design-artifacts', 'D-Design-System', '01-Visual-Design');
const TOKENS_CSS = join(DESIGN_DIR, 'tokens.css');
const MOCKUP_DIR = join(DESIGN_DIR, 'mockups');

const css = readFileSync(TOKENS_CSS, 'utf8');

/** Every custom property the token file declares, in any block. */
function declaredTokens(source: string): Set<string> {
  return new Set(Array.from(source.matchAll(/(--[a-z0-9-]+)\s*:/g)).map((match) => match[1]));
}

/** Every custom property a source file references through `var()`. */
function referencedTokens(source: string): Set<string> {
  return new Set(Array.from(source.matchAll(/var\(\s*(--[a-z0-9-]+)/g)).map((match) => match[1]));
}

const declared = declaredTokens(css);

describe('the design artifacts reference only defined tokens', () => {
  it('the component library references only defined tokens', () => {
    const library = readFileSync(join(DESIGN_DIR, 'components.html'), 'utf8');
    const missing = [...referencedTokens(library)].filter((token) => !declared.has(token));

    expect(
      missing,
      `components.html references tokens that tokens.css does not define: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every mockup references only defined tokens', () => {
    const files = readdirSync(MOCKUP_DIR).filter((file) => file.endsWith('.html'));
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(MOCKUP_DIR, file), 'utf8');
      const missing = [...referencedTokens(source)].filter((token) => !declared.has(token));
      if (missing.length > 0) {
        failures.push(`${file}: ${missing.join(', ')}`);
      }
    }

    expect(
      failures,
      `these mockups reference tokens that tokens.css does not define:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  it('the gallery entry point references only defined tokens', () => {
    const gallery = readFileSync(join(DESIGN_DIR, 'gallery.html'), 'utf8');
    const missing = [...referencedTokens(gallery)].filter((token) => !declared.has(token));

    expect(
      missing,
      `gallery.html references tokens that tokens.css does not define: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
