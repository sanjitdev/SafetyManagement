/**
 * Screenshot the HTML deck preview so the layout can be eyeballed.
 *
 * The .pptx itself cannot be rendered here (no LibreOffice / PowerPoint
 * on this machine), so this captures the browser re-draw of the SAME
 * declarative spec that produces the deck. It verifies layout — overflow,
 * collisions, balance — not PowerPoint's exact text metrics.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const OUT = 'presentation/preview/shots';
mkdirSync(OUT, { recursive: true });

const url = pathToFileURL(resolve('presentation/preview/index.html')).href;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const slides = await page.locator('.slide').all();
console.log(`slides found: ${slides.length}`);

for (let i = 0; i < slides.length; i++) {
  const n = String(i + 1).padStart(2, '0');
  await slides[i].screenshot({ path: `${OUT}/slide-${n}.png` });
  console.log(`  slide-${n}.png`);
}

await browser.close();
console.log('\ndone →', OUT);
