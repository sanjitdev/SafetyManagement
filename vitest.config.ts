import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config for the platform-layer unit tests (tests/unit/**).
 *
 * The mockup baselines (tests/01-mockups.spec.ts) remain Playwright-driven
 * and require the Next dev server — those are intentionally NOT picked up
 * by vitest.
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
  },
});