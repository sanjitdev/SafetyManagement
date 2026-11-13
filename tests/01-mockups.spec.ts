import * as path from 'node:path';
import { test } from '@playwright/test';
import { compareMockupVsBuild } from './helpers/compare';

/**
 * Mockup baseline capture for CityFix.
 *
 * Loads the four role dashboards in design-artifacts/D-Design-System/01-Visual-Design/mockups/
 * at the design-canvas viewports and asserts full-page screenshots against committed
 * baselines under tests-mockups/baselines/.
 *
 * Dashboard rebuild (2026-11-13): the 21 page-per-page mockups (login, register, OTP,
 * report flow, ticket detail, dispatcher console) were replaced by four role dashboards
 * rebuilt from the reference images in ui-design/. All four are captured at large +
 * medium viewports.
 *
 * First run: creates the PNG baselines (Playwright treats missing snapshots
 * as "create and pass"). Subsequent runs: pixel-diff against the baseline.
 * If a mockup changes visually, refresh the baseline with:
 *   npm run test:update-baselines
 *
 * Source-of-truth mockups: design-artifacts/D-Design-System/01-Visual-Design/mockups/*.html
 * Viewport mapping is documented in tests-mockups/README.md.
 */

const MOCKUP_DIR = path.resolve(
  __dirname,
  '..',
  'design-artifacts',
  'D-Design-System',
  '01-Visual-Design',
  'mockups',
);

// Large canvas: 1440 × 900 (per tokens.css --layout-desktop and 03-visual-direction.md).
const WEB_LARGE: { width: number; height: number } = { width: 1440, height: 900 };

// Medium canvas: 1024 × 768 (per tokens.css --layout-tablet-max).
const WEB_MEDIUM: { width: number; height: number } = { width: 1024, height: 768 };

// Phone-width canvas: 390 × 844. Used for Rashid's pages to verify the
// Feature #4 responsive fallback (the centered 720px content column reflows
// cleanly to 360–390px widths).
const PHONE_WIDTH: { width: number; height: number } = { width: 390, height: 844 };

test.describe('CityFix mockup baselines', () => {
  // The four role dashboards are captured at BOTH large and medium viewports.
  // The id includes the viewport suffix so the baseline filenames stay unique
  // (e.g., 01-citizen-dashboard-1440x900.png, 01-citizen-dashboard-1024x768.png).
  for (const { id, file, viewports } of [
    { id: '01-citizen-dashboard', file: '01-citizen-dashboard.html', viewports: ['LARGE', 'MEDIUM'] as const },
    { id: '02-dispatcher-dashboard', file: '02-dispatcher-dashboard.html', viewports: ['LARGE', 'MEDIUM'] as const },
    { id: '03-crew-dashboard', file: '03-crew-dashboard.html', viewports: ['LARGE', 'MEDIUM'] as const },
    { id: '04-admin-dashboard', file: '04-admin-dashboard.html', viewports: ['LARGE', 'MEDIUM'] as const },
  ]) {
    for (const vp of viewports) {
      const viewport = vp === 'LARGE' ? WEB_LARGE : vp === 'MEDIUM' ? WEB_MEDIUM : PHONE_WIDTH;
      const suffix = vp === 'LARGE' ? '1440x900' : vp === 'MEDIUM' ? '1024x768' : '390x844';
      const name = `${id}-${suffix}`;
      compareMockupVsBuild({
        name,
        mockupPath: path.join(MOCKUP_DIR, file),
        viewport,
      });
    }
  }
});