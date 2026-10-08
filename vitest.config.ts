import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config for the platform-layer unit tests (tests/unit/**).
 *
 * The mockup baselines (tests/01-mockups.spec.ts) remain Playwright-driven
 * and require the Next dev server — those are intentionally NOT picked up
 * by vitest.
 *
 * `CITYFIX_DEV_STORE=1` is set by default so the dev-session and the
 * real-store transitions tests can run without a Postgres connection.
 * Set CITYFIX_DEV_STORE=0 to opt out (the existing transitions test in
 * tests/unit/transitions.test.ts mocks the db-switch module so it works
 * either way).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: false,
    env: {
      CITYFIX_DEV_STORE: '1',
    },
  },
});