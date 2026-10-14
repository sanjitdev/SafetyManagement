#!/usr/bin/env node
/**
 * check-i18n-keys.mjs
 *
 * Intent 008 / Bolt 008-001: static-analysis guard for the
 * typed i18n key registry in `lib/i18n/keys.ts`.
 *
 * The `t(...)` helper in `lib/i18n/keys.ts` returns the key
 * itself when the entry is missing:
 *
 *     if (!entry) return key;
 *
 * That fallback makes missing translations visible in the UI
 * (as raw `key.path` strings) — which is the exact bug the
 * slow-motion demo surfaced for 12 keys. The slow-motion demo
 * cannot be re-run on every PR, so this script greps every
 * `t('...',` call site under `app/**` and asserts the key
 * exists in the registry.
 *
 * Usage:
 *   node scripts/check-i18n-keys.mjs
 *
 * Exit codes:
 *   0 — all keys registered
 *   1 — one or more keys referenced but not in TRANSLATIONS
 *
 * Limitations:
 * - The script only greps string-literal `t('key.path', ...)`
 *   call sites. Dynamic keys constructed at runtime (rare)
 *   are not caught.
 * - The script does not validate that each entry has both
 *   `bn` and `en` values; that's covered by
 *   `tests/unit/i18n/keys.test.ts`.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'app');
const KEYS_FILE = join(ROOT, 'lib', 'i18n', 'keys.ts');

// Match t('key.path', ...) and t("key.path", ...). Keys are
// dotted, lowercase-leading, and may include underscores or
// dots. We use a capture group so we can list the missing key.
const PATTERN = /\bt\(\s*['"]([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)['"]/g;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

const keysFile = await readFile(KEYS_FILE, 'utf8');

// Extract every key registered in TRANSLATIONS. The registry
// uses single-quoted keys: 'foo.bar': { ... }
const REGISTERED = new Set();
const REGISTRY_PATTERN = /^\s*'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'\s*:\s*\{/gm;
for (const m of keysFile.matchAll(REGISTRY_PATTERN)) {
  REGISTERED.add(m[1]);
}

if (REGISTERED.size === 0) {
  console.error(
    'check-i18n-keys: failed to read TRANSLATIONS registry. ' +
      'Is lib/i18n/keys.ts structured as expected?',
  );
  process.exit(1);
}

const misses = [];
for await (const file of walk(APP_DIR)) {
  const src = await readFile(file, 'utf8');
  for (const m of src.matchAll(PATTERN)) {
    const key = m[1];
    if (!REGISTERED.has(key)) {
      misses.push({ file: relative(ROOT, file), key });
    }
  }
}

if (misses.length) {
  console.error(
    `check-i18n-keys: ${misses.length} key(s) referenced but not in TRANSLATIONS:`,
  );
  for (const m of misses) {
    console.error(`  ${m.file}: ${m.key}`);
  }
  console.error(
    '\nFix: add the key to lib/i18n/keys.ts (with both `bn` and `en` values).',
  );
  process.exit(1);
}

console.log(
  `check-i18n-keys: ok — all keys referenced by app/** are registered (${REGISTERED.size} keys in TRANSLATIONS).`,
);
