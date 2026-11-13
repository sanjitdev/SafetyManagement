/**
 * Render the four role dashboards to PNG for a local visual check.
 *
 * NOT a baseline generator. The committed baselines are platform-specific
 * and must be produced by CI on ubuntu-latest (see tests-mockups/README.md).
 * This script exists so a developer can eyeball a mockup on Windows without
 * committing a Windows-rendered baseline.
 *
 * Usage:
 *   node scripts/render-mockups.mjs [outDir]
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve(process.argv[2] || 'tests-mockups/scratch-render');
const MOCKUPS = resolve('design-artifacts/D-Design-System/01-Visual-Design/mockups');

const FILES = [
  '01-citizen-dashboard.html',
  '02-dispatcher-dashboard.html',
  '03-crew-dashboard.html',
  '04-admin-dashboard.html',
];

const VIEWPORT = { width: 1440, height: 900 };

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });

for (const file of FILES) {
  const url = `file:///${resolve(MOCKUPS, file).replace(/\\/g, '/')}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const out = resolve(OUT, file.replace('.html', '.png'));
  await page.screenshot({ path: out, fullPage: true });
  console.log(`→ ${out}`);
}

await browser.close();
