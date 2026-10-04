import * as path from 'node:path';
import { test } from '@playwright/test';
import { compareMockupVsBuild } from './helpers/compare';

/**
 * Mockup baseline capture for CityFix.
 *
 * Loads the 5 hero mockups in design-artifacts/D-Design-System/01-Visual-Design/mockups/
 * at the design-canvas viewports and asserts full-page screenshots against committed
 * baselines under tests-mockups/baselines/.
 *
 * Web re-skin (2026-10-04): mockups are web-first (large + medium viewports).
 * Mobile-only baselines were retired; Rashid's pages (Phase B) will be tested via
 * responsive helper paths.
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
  // Mockups 01–04 are captured at BOTH large and medium viewports.
  // The id includes the viewport suffix so the baseline filenames stay unique
  // (e.g., 01-welcome-1440x900.png, 01-welcome-1024x768.png).
  //
  // Mockups 06–07 (Rashid, added 2026-10-04 Phase B) are web-first with a phone-width
  // fallback (Feature #4). Captured at large + medium + a phone-width baseline (390 × 844)
  // to verify the responsive collapse.
  for (const { id, file, viewports } of [
    { id: '01-welcome', file: '01-welcome.html', viewports: ['LARGE', 'MEDIUM'] as const },
    { id: '02-home-city-activity', file: '02-home-city-activity.html', viewports: ['LARGE', 'MEDIUM'] as const },
    { id: '03-report-submitted', file: '03-report-submitted.html', viewports: ['LARGE', 'MEDIUM'] as const },
    { id: '04-my-reports-detail', file: '04-my-reports-detail.html', viewports: ['LARGE', 'MEDIUM'] as const },
    // Mockup 05 is desktop-only at large viewport (Habib's 3-region dashboard).
    { id: '05-daily-queue-dashboard', file: '05-daily-queue-dashboard.html', viewports: ['LARGE'] as const },
    // Mockup 06 — Rashid's field app home. Web-first at large + medium; phone-width baseline included.
    { id: '06-field-app-home', file: '06-field-app-home.html', viewports: ['LARGE', 'MEDIUM', 'PHONE'] as const },
    // Mockup 07 — Rashid's status: in-progress (hands-busy, .theme-outdoor). Full-bleed at all viewports.
    { id: '07-status-in-progress', file: '07-status-in-progress.html', viewports: ['LARGE', 'MEDIUM', 'PHONE'] as const },
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