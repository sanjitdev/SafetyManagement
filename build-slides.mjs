/**
 * Build the CityFix presentation deck.
 *
 * Consumes the 15 screenshots in `presentation/screenshots/` (captured by
 * `capture-slides.mjs` as the four real personas) and emits a 16:9 `.pptx`
 * styled from the project's own design tokens — the same palette the app
 * ships, so the deck and the product read as one system.
 *
 * Run with:  node build-slides.mjs
 */

import pptxgen from 'pptxgenjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SHOTS = 'presentation/screenshots';
const OUT = 'presentation/CityFix.pptx';

// ---------------------------------------------------------------------------
// Design tokens — mirrored from design-artifacts/D-Design-System/01-Visual-
// Design/tokens.css. Keeping them literal here means the deck is buildable
// without a CSS parser; they are the same values, not approximations.
// ---------------------------------------------------------------------------
const T = {
  primary: '2C5282',
  primaryHover: '2A4E73',
  primarySoft: 'EBF2F8',
  onPrimary: 'FFFFFF',
  ink: '0F1419',
  inkSecondary: '4A5568',
  inkTertiary: '718096',
  inkOnDark: 'F7FAFC',
  surfacePage: 'FAFAF7',
  surfaceCard: 'FFFFFF',
  surfaceRaised: 'F2F2F2',
  surfaceSunken: 'EDEDE8',
  surfaceInverse: '0F1419',
  border: 'E2E8F0',
  borderStrong: 'CBD5E0',
  success: '15803D',
  warning: 'B45309',
  danger: 'B91C1C',
  catStreetlight: 'B7791F',
  catPothole: '4A5568',
  catGarbage: '2F7A4F',
  catDrain: '2C5282',
  catSanitation: '805AD5',
};

const FONT = 'Segoe UI';
const MONO = 'Consolas';

// 16:9 at 13.333in x 7.5in
const W = 13.333;
const H = 7.5;

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_16x9';
pptx.author = 'CityFix';
pptx.company = 'CityFix';
pptx.title = 'CityFix — Citizen-powered city issue reporting & tracking';
pptx.subject = 'CityFix product presentation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shot(name) {
  const p = join(SHOTS, `${name}.png`);
  if (!existsSync(p)) {
    throw new Error(`Missing screenshot: ${p}`);
  }
  return p;
}

/**
 * A screenshot scaled to fit a box, centred, preserving 1440x900 aspect.
 *
 * The box is the FULL region the image may occupy. Centring inside it
 * means a narrow screenshot (a tall app page cropped to 16:10) sits
 * against the vertical middle rather than floating at the top.
 */
function imageFit(slide, path, box) {
  const AR = 1440 / 900;
  let w = box.w;
  let h = w / AR;
  if (h > box.h) {
    h = box.h;
    w = h * AR;
  }
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  slide.addImage({ path, x, y, w, h });
  // A hairline frame so a light screenshot does not dissolve into the
  // warm off-white slide background.
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { type: 'none' },
    line: { color: T.border, width: 1 },
  });
  return { x, y, w, h };
}

/** Slide with the standard light background and an eyebrow + title header. */
function contentSlide({ eyebrow, title, subtitle }) {
  const slide = pptx.addSlide();
  slide.background = { color: T.surfacePage };

  // Top accent rule
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: W,
    h: 0.09,
    fill: { color: T.primary },
    line: { type: 'none' },
  });

  if (eyebrow) {
    slide.addText(eyebrow.toUpperCase(), {
      x: 0.72,
      y: 0.42,
      w: 9,
      h: 0.3,
      fontFace: FONT,
      fontSize: 11,
      bold: true,
      color: T.primary,
      charSpacing: 2,
    });
  }

  if (title) {
    slide.addText(title, {
      x: 0.72,
      y: eyebrow ? 0.7 : 0.5,
      w: 11.9,
      h: 0.62,
      fontFace: FONT,
      fontSize: 28,
      bold: true,
      color: T.ink,
    });
  }

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.72,
      y: eyebrow ? 1.3 : 1.12,
      w: 11.9,
      h: 0.4,
      fontFace: FONT,
      fontSize: 14,
      color: T.inkSecondary,
    });
  }

  return slide;
}

/** Small rounded card used for stat + bullet blocks. */
function card(slide, { x, y, w, h, fill = T.surfaceCard, border = T.border }) {
  slide.addShape('roundRect', {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: fill },
    line: { color: border, width: 1 },
  });
}

/** Slide-number footer on content slides. */
function footer(slide, n) {
  slide.addText('CityFix', {
    x: 0.72,
    y: H - 0.52,
    w: 3,
    h: 0.28,
    fontFace: FONT,
    fontSize: 9,
    color: T.inkTertiary,
  });
  slide.addText(String(n), {
    x: W - 1.3,
    y: H - 0.52,
    w: 0.6,
    h: 0.28,
    align: 'right',
    fontFace: FONT,
    fontSize: 9,
    color: T.inkTertiary,
  });
}

/** Caption under a screenshot. */
function caption(slide, text, x, y, w) {
  slide.addText(text, {
    x,
    y,
    w,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    color: T.inkSecondary,
    align: 'center',
  });
}

/**
 * Place a screenshot with its caption directly beneath it.
 *
 * The caption rides the IMAGE's bottom edge rather than a fixed y, so a
 * short screenshot (the login page, which is mostly white space) does
 * not leave its caption stranded far below the picture.
 */
function shotWithCaption(slide, file, box, cap) {
  const placed = imageFit(slide, shot(file), box);
  caption(slide, cap, box.x, placed.y + placed.h + 0.1, box.w);
  return placed;
}

// ---------------------------------------------------------------------------
// 1 — Title
// ---------------------------------------------------------------------------
{
  const slide = pptx.addSlide();
  slide.background = { color: T.surfaceInverse };

  // Soft primary wash behind the wordmark
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.32,
    h: H,
    fill: { color: T.primary },
    line: { type: 'none' },
  });

  slide.addText('CITYFIX', {
    x: 1.15,
    y: 1.55,
    w: 10,
    h: 0.42,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color: T.primarySoft,
    charSpacing: 6,
  });

  slide.addText('Citizen-powered city issue\nreporting & tracking', {
    x: 1.1,
    y: 2.05,
    w: 11,
    h: 1.9,
    fontFace: FONT,
    fontSize: 44,
    bold: true,
    color: T.inkOnDark,
    lineSpacing: 50,
  });

  slide.addShape('rect', {
    x: 1.15,
    y: 4.15,
    w: 1.5,
    h: 0.045,
    fill: { color: T.primary },
    line: { type: 'none' },
  });

  slide.addText(
    'One platform where a citizen photographs a pothole, the authority routes it, the crew fixes it, and the citizen can see that it was actually resolved.',
    {
      x: 1.15,
      y: 4.5,
      w: 8.6,
      h: 0.9,
      fontFace: FONT,
      fontSize: 16,
      color: 'A0AEC0',
      lineSpacing: 23,
    },
  );

  slide.addText(
    [
      { text: 'Next.js 14', options: { bold: true } },
      { text: '  ·  ' },
      { text: 'TypeScript strict', options: { bold: true } },
      { text: '  ·  ' },
      { text: 'PostgreSQL 16 + Prisma', options: { bold: true } },
      { text: '  ·  ' },
      { text: 'MapLibre + OSM', options: { bold: true } },
      { text: '  ·  ' },
      { text: 'Playwright + Vitest', options: { bold: true } },
    ],
    {
      x: 1.15,
      y: 6.15,
      w: 11,
      h: 0.35,
      fontFace: FONT,
      fontSize: 12,
      color: '718096',
    },
  );
}

// ---------------------------------------------------------------------------
// 2 — The problem
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'The problem',
    title: 'A broken streetlight is reported to nobody',
    subtitle:
      'There is no single place to report a city problem, no way to know who owns it, and no way to know if it was ever fixed.',
  });

  const problems = [
    {
      h: 'No single front door',
      b: 'Reports scatter across phone calls, Facebook, Messenger and different government channels. Citizens do not know where to file.',
    },
    {
      h: 'No ownership',
      b: 'A complaint arrives with no ward, no responsible agency and no priority. It sits in a list nobody owns.',
    },
    {
      h: 'No trail',
      b: 'Once filed, the citizen has no visibility. Submitted → fixed? Or silently dropped?',
    },
    {
      h: 'No dedup',
      b: 'Forty people report the same pothole. Without proximity detection the agency sees forty issues instead of one.',
    },
  ];

  problems.forEach((p, i) => {
    const x = 0.72 + (i % 2) * 6.05;
    const y = 2.0 + Math.floor(i / 2) * 1.62;
    card(slide, { x, y, w: 5.75, h: 1.42 });
    slide.addShape('rect', {
      x,
      y,
      w: 0.055,
      h: 1.42,
      fill: { color: T.danger },
      line: { type: 'none' },
    });
    slide.addText(p.h, {
      x: x + 0.28,
      y: y + 0.18,
      w: 5.2,
      h: 0.3,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      color: T.ink,
    });
    slide.addText(p.b, {
      x: x + 0.28,
      y: y + 0.55,
      w: 5.2,
      h: 0.75,
      fontFace: FONT,
      fontSize: 12,
      color: T.inkSecondary,
      lineSpacing: 17,
    });
  });

  slide.addText(
    'CityFix closes every one of those gaps — not with a bigger phone tree, but with one traceable pipeline.',
    {
      x: 0.72,
      y: 5.5,
      w: 11.9,
      h: 0.4,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      color: T.primary,
    },
  );

  footer(slide, 2);
}

// ---------------------------------------------------------------------------
// 3 — The solution / four roles
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'The solution',
    title: 'Four roles, one ticket, one trail',
    subtitle:
      'A single report is threaded through the chain: filed by a citizen, triaged by a dispatcher, resolved by a crew, governed by an admin.',
  });

  const roles = [
    {
      role: 'Citizen',
      who: 'Rahim',
      home: '/home',
      does: 'Photograph a problem, drop a pin, follow the status trail, confirm the fix.',
      color: T.catDrain,
    },
    {
      role: 'Dispatcher',
      who: 'Habib',
      home: '/dispatcher',
      does: 'Triage the queue, dedup near-identical reports, set priority, assign a crew, route it.',
      color: T.catStreetlight,
    },
    {
      role: 'Crew',
      who: 'Rashid',
      home: '/crew',
      does: 'See only their assigned ward, work the job, prove it with a photo, resolve it.',
      color: T.catGarbage,
    },
    {
      role: 'Admin',
      who: 'Anwar',
      home: '/admin',
      does: 'Configure cities, wards and taxonomy, oversee tickets, and audit every mutation.',
      color: T.catSanitation,
    },
  ];

  roles.forEach((r, i) => {
    const x = 0.72 + i * 3.03;
    const y = 1.95;
    card(slide, { x, y, w: 2.78, h: 3.1 });
    slide.addShape('rect', {
      x,
      y,
      w: 2.78,
      h: 0.09,
      fill: { color: r.color },
      line: { type: 'none' },
    });
    slide.addText(r.role, {
      x: x + 0.22,
      y: y + 0.3,
      w: 2.4,
      h: 0.32,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: T.ink,
    });
    slide.addText(r.who, {
      x: x + 0.22,
      y: y + 0.63,
      w: 2.4,
      h: 0.26,
      fontFace: FONT,
      fontSize: 11,
      color: T.inkTertiary,
    });
    slide.addText(r.home, {
      x: x + 0.22,
      y: y + 0.92,
      w: 2.4,
      h: 0.26,
      fontFace: MONO,
      fontSize: 10,
      color: r.color,
    });
    slide.addShape('rect', {
      x: x + 0.22,
      y: y + 1.3,
      w: 2.34,
      h: 0.012,
      fill: { color: T.border },
      line: { type: 'none' },
    });
    slide.addText(r.does, {
      x: x + 0.22,
      y: y + 1.48,
      w: 2.36,
      h: 1.45,
      fontFace: FONT,
      fontSize: 11.5,
      color: T.inkSecondary,
      lineSpacing: 16,
    });
  });

  // The chain
  const chain = ['Submitted', 'Routed', 'In progress', 'Resolved'];
  const chainY = 5.42;
  chain.forEach((c, i) => {
    const x = 0.72 + i * 3.03;
    slide.addShape('roundRect', {
      x,
      y: chainY,
      w: 2.78,
      h: 0.46,
      rectRadius: 0.08,
      fill: { color: T.primarySoft },
      line: { color: T.primary, width: 1 },
    });
    slide.addText(c, {
      x,
      y: chainY + 0.08,
      w: 2.78,
      h: 0.3,
      align: 'center',
      fontFace: FONT,
      fontSize: 12,
      bold: true,
      color: T.primary,
    });
    if (i < chain.length - 1) {
      slide.addText('→', {
        x: x + 2.79,
        y: chainY + 0.06,
        w: 0.24,
        h: 0.32,
        align: 'center',
        fontFace: FONT,
        fontSize: 15,
        bold: true,
        color: T.inkTertiary,
      });
    }
  });

  slide.addText(
    'One status vocabulary, shared by every surface — the citizen and the agency read the same trail.',
    {
      x: 0.72,
      y: 6.05,
      w: 11.9,
      h: 0.35,
      fontFace: FONT,
      fontSize: 12,
      italic: true,
      color: T.inkSecondary,
      align: 'center',
    },
  );

  footer(slide, 3);
}

// ---------------------------------------------------------------------------
// 4 — Citizen journey (landing + home)
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Citizen journey',
    title: 'One tap from the street to a tracked report',
    subtitle:
      'The public landing explains the civic promise; the citizen home is a live map of real reports around Dhaka.',
  });

  shotWithCaption(
    slide,
    '01-public-landing',
    { x: 0.72, y: 1.8, w: 6.0, h: 4.7 },
    'Public landing — the citizen promise',
  );
  shotWithCaption(
    slide,
    '04-citizen-home',
    { x: 6.95, y: 1.8, w: 5.65, h: 4.7 },
    'Citizen home — live MapLibre map with real seeded reports',
  );

  footer(slide, 4);
}

// ---------------------------------------------------------------------------
// 5 — Citizen: report + my reports
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Citizen journey',
    title: 'Report it with a photo and a pin — then watch it move',
    subtitle:
      'Category and location are captured with the report; "My reports" is the citizen’s own view of the trail.',
  });

  shotWithCaption(
    slide,
    '06-citizen-report-location',
    { x: 0.72, y: 1.8, w: 6.0, h: 4.7 },
    'Report flow — category, photo, map pin',
  );
  shotWithCaption(
    slide,
    '05-citizen-my-reports',
    { x: 6.95, y: 1.8, w: 5.65, h: 4.7 },
    'My reports — the citizen’s own trail',
  );

  footer(slide, 5);
}

// ---------------------------------------------------------------------------
// 6 — Dispatcher
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Dispatcher',
    title: 'The triage queue: priority, dedup and assignment in one view',
    subtitle:
      'Habib sees every open ticket with its ward, priority badge and assignment state — then routes it.',
  });

  shotWithCaption(
    slide,
    '08-dispatcher-triage-queue',
    { x: 0.72, y: 1.8, w: 7.6, h: 4.7 },
    'Triage queue — Ward 14, 30 open tickets',
  );
  shotWithCaption(
    slide,
    '09-dispatcher-monitor',
    { x: 8.55, y: 1.8, w: 4.05, h: 4.7 },
    'Monitor — live status view',
  );

  footer(slide, 6);
}

// ---------------------------------------------------------------------------
// 7 — Crew
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Crew',
    title: 'The field surface: only my ward, only my work',
    subtitle:
      'A crew member is not a dispatcher with fewer buttons — the surface is scoped to the assignments they can actually act on.',
  });

  // The crew LIST is wide-and-sparse (one open job, so most of the page
  // is empty). The DETAIL is tall-and-dense. The list gets the top band;
  // the detail is inset below it at a smaller size, side by side with
  // the explanation cards.
  const crewList = imageFit(slide, shot('10-crew-assignments'), {
    x: 0.72,
    y: 1.8,
    w: 5.6,
    h: 2.3,
  });
  caption(
    slide,
    'Crew assignments — one open job in Ward 14',
    0.72,
    crewList.y + crewList.h + 0.08,
    5.6,
  );
  const crewDetail = imageFit(slide, shot('10b-crew-ticket-detail'), {
    x: 0.72,
    y: crewList.y + crewList.h + 0.52,
    w: 3.35,
    h: 2.15,
  });
  caption(
    slide,
    'The job itself',
    4.25,
    crewDetail.y + crewDetail.h / 2 - 0.3,
    2.07,
  );

  const items = [
    ['Scoped by ward', 'Rashid works Ward 14 — not the whole city.'],
    ['Actionable only', 'The API returns only `routed` and `in_progress`.'],
    ['Proof required', 'Resolution needs a photo before the ticket closes.'],
    ['Role-enforced', 'The API refuses a crew session on dispatcher routes.'],
  ];
  items.forEach(([h, b], i) => {
    const y = 1.95 + i * 1.15;
    card(slide, { x: 6.6, y, w: 6.0, h: 0.98 });
    slide.addText(h, {
      x: 6.85,
      y: y + 0.13,
      w: 5.5,
      h: 0.28,
      fontFace: FONT,
      fontSize: 13,
      bold: true,
      color: T.primary,
    });
    slide.addText(b, {
      x: 6.85,
      y: y + 0.44,
      w: 5.5,
      h: 0.42,
      fontFace: FONT,
      fontSize: 11.5,
      color: T.inkSecondary,
      lineSpacing: 15,
    });
  });

  slide.addText(
    'The crew surface is deliberately sparse: it shows work, not everything the city knows about.',
    {
      x: 6.6,
      y: 6.62,
      w: 6.0,
      h: 0.35,
      fontFace: FONT,
      fontSize: 11.5,
      italic: true,
      color: T.inkSecondary,
    },
  );

  footer(slide, 7);
}

// ---------------------------------------------------------------------------
// 8 — Admin console
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Admin',
    title: 'The console that governs the platform',
    subtitle:
      'Anwar configures the city, watches the ticket estate and reads the audit trail — and every write is WebAuthn-gated.',
  });

  // The admin console is the hero of this slide, so it gets the width.
  // The other two are supporting detail and sit beneath it.
  const console_ = imageFit(slide, shot('11-admin-console'), {
    x: 0.72,
    y: 1.8,
    w: 5.6,
    h: 3.3,
  });
  caption(
    slide,
    'Admin console',
    0.72,
    console_.y + console_.h + 0.06,
    5.6,
  );
  shotWithCaption(
    slide,
    '12-admin-tickets',
    { x: 6.6, y: 1.8, w: 6.0, h: 2.1 },
    'Ticket estate',
  );
  shotWithCaption(
    slide,
    '13-admin-cities',
    { x: 6.6, y: 4.35, w: 6.0, h: 2.1 },
    'City setup — wards, taxonomy, adoption',
  );

  // The admin console page is sparse, so the space under it carries the
  // three guarantees the admin surface makes.
  const guarantees = [
    ['Scoped, not global', 'A city admin governs one city.'],
    ['WebAuthn on writes', 'A passkey signs every mutation.'],
    ['Audit on every change', 'Who, what, when — recorded.'],
  ];
  const guaranteeTop = 5.62;
  guarantees.forEach(([h, b], i) => {
    const y = guaranteeTop + i * 0.42;
    slide.addShape('rect', {
      x: 0.72,
      y: y + 0.06,
      w: 0.04,
      h: 0.26,
      fill: { color: T.primary },
      line: { type: 'none' },
    });
    slide.addText(
      [
        { text: `${h} — `, options: { bold: true, color: T.ink } },
        { text: b, options: { color: T.inkSecondary } },
      ],
      {
        x: 0.9,
        y,
        w: 5.7,
        h: 0.38,
        fontFace: FONT,
        fontSize: 10.5,
        lineSpacing: 14,
      },
    );
  });

  footer(slide, 8);
}

// ---------------------------------------------------------------------------
// 9 — Dark theme + public transparency
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Admin',
    title: 'One design system — light, dark, and public by default',
    subtitle:
      "The admin console honours the shared theme system rather than hardcoding a palette, and the public feed shows the city's progress without an account.",
  });

  shotWithCaption(
    slide,
    '15-admin-dark-theme',
    { x: 0.72, y: 1.8, w: 5.9, h: 4.7 },
    'Admin console in dark theme — same design tokens, inverted',
  );
  shotWithCaption(
    slide,
    '07-city-activity-feed',
    { x: 6.85, y: 1.8, w: 5.75, h: 4.7 },
    "Public activity feed — the city's progress, visible to anyone",
  );

  footer(slide, 9);
}

// ---------------------------------------------------------------------------
// 10 — Architecture
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Under the hood',
    title: 'Architecture',
    subtitle:
      'A conventional, deliberately boring stack — chosen for the audit trail it produces, not for novelty.',
  });

  const layers = [
    {
      h: 'Client',
      items: [
        'Next.js 14 App Router',
        'React 18 + TypeScript strict',
        'Tailwind v3 + CSS custom properties',
        'MapLibre GL JS + OSM raster',
      ],
      color: T.catDrain,
    },
    {
      h: 'Server',
      items: [
        'Route handlers + Zod at every boundary',
        'Signed HTTP-only session cookies',
        'Rate limiting + login lockout',
        'Web Push (VAPID)',
      ],
      color: T.catStreetlight,
    },
    {
      h: 'Domain',
      items: [
        'Service layer returning Result<T, E>',
        'Ticket transitions + dedup (50 m)',
        'City / ward / taxonomy model',
        'WebAuthn for admin writes',
      ],
      color: T.catGarbage,
    },
    {
      h: 'Data',
      items: [
        'PostgreSQL 16',
        'Prisma 5 — typed client only',
        'Raw SQL forbidden in app code',
        'Platform audit log',
      ],
      color: T.catSanitation,
    },
  ];

  layers.forEach((l, i) => {
    const x = 0.72 + i * 3.03;
    const y = 1.95;
    card(slide, { x, y, w: 2.78, h: 3.5 });
    slide.addShape('rect', {
      x,
      y,
      w: 2.78,
      h: 0.09,
      fill: { color: l.color },
      line: { type: 'none' },
    });
    slide.addText(l.h, {
      x: x + 0.22,
      y: y + 0.3,
      w: 2.4,
      h: 0.32,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: T.ink,
    });
    slide.addText(
      l.items.map((t) => ({ text: t, options: { bullet: { code: '2022' } } })),
      {
        x: x + 0.22,
        y: y + 0.75,
        w: 2.4,
        h: 2.6,
        fontFace: FONT,
        fontSize: 11.5,
        color: T.inkSecondary,
        lineSpacing: 20,
        paraSpaceAfter: 6,
      },
    );
  });

  slide.addShape('roundRect', {
    x: 0.72,
    y: 5.72,
    w: 11.9,
    h: 0.62,
    rectRadius: 0.08,
    fill: { color: T.primarySoft },
    line: { color: T.primary, width: 1 },
  });
  slide.addText(
    'Every service-layer call returns Result<T, E> — no exception crosses a boundary, and every state change is written to the audit log.',
    {
      x: 1.0,
      y: 5.87,
      w: 11.35,
      h: 0.34,
      align: 'center',
      fontFace: FONT,
      fontSize: 12,
      bold: true,
      color: T.primary,
    },
  );

  footer(slide, 10);
}

// ---------------------------------------------------------------------------
// 11 — Quality gates
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Evidence',
    title: 'The claims are measured, not asserted',
    subtitle:
      'Every number below comes from a command in this repository that runs against the real database.',
  });

  const stats = [
    ['1142', 'unit tests', 'Vitest — domain, services, auth, serializers'],
    ['15 / 15', 'visual baselines', 'Playwright pixel baselines, gating on merge'],
    ['45', 'role & theme specs', 'Playwright against a live app + Postgres'],
    ['53 / 53', 'walkthrough observations', 'One ticket threaded through all four roles'],
  ];

  stats.forEach(([big, label, sub], i) => {
    const x = 0.72 + (i % 2) * 6.05;
    const y = 1.9 + Math.floor(i / 2) * 1.62;
    card(slide, { x, y, w: 5.75, h: 1.42 });
    slide.addText(big, {
      x: x + 0.28,
      y: y + 0.16,
      w: 2.1,
      h: 0.66,
      fontFace: FONT,
      fontSize: 34,
      bold: true,
      color: T.primary,
      valign: 'middle',
    });
    slide.addText(label, {
      x: x + 2.35,
      y: y + 0.28,
      w: 3.2,
      h: 0.32,
      fontFace: FONT,
      fontSize: 14,
      bold: true,
      color: T.ink,
    });
    slide.addText(sub, {
      x: x + 2.35,
      y: y + 0.65,
      w: 3.2,
      h: 0.6,
      fontFace: FONT,
      fontSize: 11,
      color: T.inkSecondary,
      lineSpacing: 15,
    });
  });

  slide.addShape('roundRect', {
    x: 0.72,
    y: 5.25,
    w: 11.9,
    h: 0.95,
    rectRadius: 0.08,
    fill: { color: T.surfaceInverse },
    line: { type: 'none' },
  });
  slide.addText('Recorded Construction Verification Command', {
    x: 1.05,
    y: 5.4,
    w: 11.2,
    h: 0.28,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: '718096',
    charSpacing: 1.5,
  });
  slide.addText(
    'npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/',
    {
      x: 1.05,
      y: 5.72,
      w: 11.2,
      h: 0.32,
      fontFace: MONO,
      fontSize: 12,
      color: T.inkOnDark,
    },
  );

  footer(slide, 11);
}

// ---------------------------------------------------------------------------
// 12 — What's next
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: "What's next",
    title: 'The pipeline is proven; the city is next',
    subtitle:
      'The platform layer, the four-role chain and the audit trail are complete. What remains is deployment and real-world scale.',
  });

  const next = [
    {
      h: 'Ship the pilot',
      b: 'Hosting target is still open — Vercel vs Cloudflare vs Railway is the one decision left to ratify.',
      t: 'Deployment',
    },
    {
      h: 'Real SMS provider',
      b: 'The OTP provider is a stub from the platform layer; WO-004 selects and wires the production provider.',
      t: 'Citizen onboarding',
    },
    {
      h: 'Scale the map',
      b: 'OSM raster tiles are dev-grade. Mapbox or a self-hosted tile server is the production path past pilot volume.',
      t: 'Infrastructure',
    },
    {
      h: 'More cities',
      b: 'The city / ward / taxonomy model is data-driven from day one — a new city is configuration, not a fork.',
      t: 'Growth',
    },
  ];

  next.forEach((n, i) => {
    const x = 0.72 + (i % 2) * 6.05;
    const y = 1.95 + Math.floor(i / 2) * 1.62;
    card(slide, { x, y, w: 5.75, h: 1.42 });
    slide.addText(n.t.toUpperCase(), {
      x: x + 0.28,
      y: y + 0.16,
      w: 3.2,
      h: 0.26,
      fontFace: FONT,
      fontSize: 10,
      bold: true,
      color: T.primary,
      charSpacing: 1.5,
    });
    slide.addText(n.h, {
      x: x + 0.28,
      y: y + 0.45,
      w: 5.2,
      h: 0.32,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      color: T.ink,
    });
    slide.addText(n.b, {
      x: x + 0.28,
      y: y + 0.82,
      w: 5.2,
      h: 0.5,
      fontFace: FONT,
      fontSize: 11.5,
      color: T.inkSecondary,
      lineSpacing: 16,
    });
  });

  slide.addText('Thank you — questions welcome.', {
    x: 0.72,
    y: 5.6,
    w: 11.9,
    h: 0.5,
    align: 'center',
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: T.ink,
  });
  slide.addText('cityfix · Next.js 14 · PostgreSQL 16 · Prisma · MapLibre', {
    x: 0.72,
    y: 6.15,
    w: 11.9,
    h: 0.32,
    align: 'center',
    fontFace: FONT,
    fontSize: 12,
    color: T.inkTertiary,
  });

  footer(slide, 12);
}

// ---------------------------------------------------------------------------
// 13 — Appendix: the login surface + activity feed
// ---------------------------------------------------------------------------
{
  const slide = contentSlide({
    eyebrow: 'Appendix',
    title: 'Entry points and the public activity feed',
    subtitle:
      'Every entry point routes by role: the site root, the splash and a `?next=` deep link all resolve the same way.',
  });

  shotWithCaption(
    slide,
    '02-login',
    { x: 0.72, y: 1.8, w: 4.55, h: 4.7 },
    'Login',
  );
  shotWithCaption(
    slide,
    '03-splash',
    { x: 5.5, y: 1.8, w: 3.6, h: 4.7 },
    'Splash',
  );
  shotWithCaption(
    slide,
    '14-admin-audit',
    { x: 9.35, y: 1.8, w: 3.27, h: 4.7 },
    'Audit trail',
  );

  footer(slide, 13);
}

await pptx.writeFile({ fileName: OUT });
console.log(`deck written → ${OUT}`);
