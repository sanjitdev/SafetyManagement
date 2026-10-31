/**
 * Render a visual proof of the deck geometry.
 *
 * There is no LibreOffice/PowerPoint on this machine, so instead of
 * converting the .pptx, this script re-draws every slide in a browser
 * from the SAME declarative spec the .pptx is built from. The point is
 * to eyeball layout — overflow, collisions, balance — not to produce a
 * pixel-exact PowerPoint preview.
 *
 * Run: node preview-slides.mjs
 * Then open presentation/preview/index.html
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SHOTS = 'presentation/screenshots';
const OUT = 'presentation/preview';
mkdirSync(OUT, { recursive: true });

const T = {
  primary: '#2C5282',
  primarySoft: '#EBF2F8',
  onPrimary: '#FFFFFF',
  ink: '#0F1419',
  inkSecondary: '#4A5568',
  inkTertiary: '#718096',
  inkOnDark: '#F7FAFC',
  surfacePage: '#FAFAF7',
  surfaceCard: '#FFFFFF',
  surfaceRaised: '#F2F2F2',
  surfaceSunken: '#EDEDE8',
  surfaceInverse: '#0F1419',
  border: '#E2E8F0',
  borderStrong: '#CBD5E0',
  success: '#15803D',
  warning: '#B45309',
  danger: '#B91C1C',
  catStreetlight: '#B7791F',
  catPothole: '#4A5568',
  catGarbage: '#2F7A4F',
  catDrain: '#2C5282',
  catSanitation: '#805AD5',
};

const FONT = "'Segoe UI', system-ui, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";

/** px per inch at 96dpi. */
const PX = 96;
const W = 13.333;
const H = 7.5;

let slides = [];

function s() {
  slides.push({ bg: T.surfacePage, els: [] });
  return slides[slides.length - 1];
}

function rect(sl, x, y, w, h, fill, opts = {}) {
  sl.els.push(
    `<div class="el rect" style="left:${x * PX}px;top:${y * PX}px;width:${w * PX}px;height:${h * PX}px;background:${fill};${opts.radius ? `border-radius:${opts.radius * PX}px;` : ''}${opts.border ? `border:1px solid ${opts.border};` : ''}"></div>`,
  );
}

function text(sl, str, x, y, w, h, opts = {}) {
  const fs = opts.size ?? 12;
  const style = [
    `left:${x * PX}px`,
    `top:${y * PX}px`,
    `width:${w * PX}px`,
    `height:${h * PX}px`,
    `font-size:${fs}px`,
    `color:${opts.color ?? T.ink}`,
    opts.bold ? 'font-weight:700' : '',
    opts.italic ? 'font-style:italic' : '',
    opts.align ? `text-align:${opts.align}` : '',
    opts.font ? `font-family:${opts.font}` : '',
    opts.spacing ? `letter-spacing:${opts.spacing}px` : '',
    opts.lh ? `line-height:${opts.lh}px` : '',
    opts.mt ? `margin-top:${opts.mt}px` : '',
  ]
    .filter(Boolean)
    .join(';');
  const cls = opts.bullet ? 'bul' : '';
  sl.els.push(`<div class="el txt ${cls}" style="${style}">${str}</div>`);
}

function img(sl, file, box) {
  const AR = 1440 / 900;
  let w = box.w;
  let h = w / AR;
  if (h > box.h) {
    h = box.h;
    w = h * AR;
  }
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  sl.els.push(
    `<div class="el img" style="left:${x * PX}px;top:${y * PX}px;width:${w * PX}px;height:${h * PX}px"><img src="../../${SHOTS}/${file}.png" style="width:100%;height:100%;object-fit:contain;border:1px solid ${T.border}"></div>`,
  );
  return { x, y, w, h };
}

/** Screenshot with its caption riding directly beneath the image. */
function shotCap(sl, file, box, cap) {
  const placed = img(sl, file, box);
  text(sl, cap, box.x, placed.y + placed.h + 0.1, box.w, 0.3, {
    size: 11,
    color: T.inkSecondary,
    align: 'center',
  });
  return placed;
}

function contentSlide({ eyebrow, title, subtitle, n }) {
  const sl = s();
  rect(sl, 0, 0, W, 0.09, T.primary);
  if (eyebrow)
    text(sl, eyebrow.toUpperCase(), 0.72, 0.42, 9, 0.3, {
      size: 11,
      bold: true,
      color: T.primary,
      spacing: 2,
    });
  if (title)
    text(sl, title, 0.72, eyebrow ? 0.7 : 0.5, 11.9, 0.62, {
      size: 28,
      bold: true,
    });
  if (subtitle)
    text(sl, subtitle, 0.72, eyebrow ? 1.3 : 1.12, 11.9, 0.4, {
      size: 14,
      color: T.inkSecondary,
    });
  text(sl, 'CityFix', 0.72, H - 0.52, 3, 0.28, { size: 9, color: T.inkTertiary });
  text(sl, String(n), W - 1.3, H - 0.52, 0.6, 0.28, {
    size: 9,
    color: T.inkTertiary,
    align: 'right',
  });
  return sl;
}

// --- 1 title
{
  const sl = s();
  sl.bg = T.surfaceInverse;
  rect(sl, 0, 0, 0.32, H, T.primary);
  text(sl, 'CITYFIX', 1.15, 0.85, 10, 0.42, {
    size: 15,
    bold: true,
    color: T.primarySoft,
    spacing: 6,
  });
  text(
    sl,
    'Citizen-powered city issue<br>reporting &amp; tracking',
    1.1,
    1.45,
    11,
    1.9,
    { size: 44, bold: true, color: T.inkOnDark, lh: 50 },
  );
  rect(sl, 1.15, 3.62, 1.5, 0.045, T.primary);
  text(
    sl,
    'One platform where a citizen photographs a pothole, the authority routes it, the crew fixes it, and the citizen can see that it was actually resolved.',
    1.15,
    3.95,
    8.6,
    0.9,
    { size: 16, color: '#A0AEC0', lh: 23 },
  );
  rect(sl, 1.15, 5.05, 11, 0.62, T.primary);
  text(
    sl,
    'Planned, specified and executed end-to-end by AI agents — BMAD &nbsp;·&nbsp; WDS &nbsp;·&nbsp; AIDLC &nbsp;·&nbsp; Specsmd',
    1.35,
    5.2,
    10.6,
    0.32,
    { size: 13.5, bold: true, color: T.onPrimary, align: 'center' },
  );
  text(
    sl,
    '<b>Next.js 14</b> &nbsp;·&nbsp; <b>TypeScript strict</b> &nbsp;·&nbsp; <b>PostgreSQL 16 + Prisma</b> &nbsp;·&nbsp; <b>MapLibre + OSM</b> &nbsp;·&nbsp; <b>Playwright + Vitest</b>',
    1.15,
    6.1,
    11,
    0.35,
    { size: 12, color: '#718096' },
  );
}

// --- 2 how this was built
{
  const sl = contentSlide({
    eyebrow: 'How this was built',
    title: 'The project was planned, specified and executed by AI agents',
    subtitle:
      'Four agentic methodologies were chained — each one owning a different layer — and every artefact they produced is still in the repository.',
    n: 2,
  });
  const chain = [
    ['BMAD', 'Agent library &amp; method', 'Mary · John · Sally · Winston · Amelia', 'Supplied the specialist agent roles and the method modules the other lanes compose.', '15 agent personas, 7 method modules', T.catStreetlight],
    ['WDS', 'Design &amp; spec lane', 'Saga · Freya · Mimir', 'Turned the idea into a product brief, personas, 33 page specs, a design system and 5 work orders.', '69 design artefacts · 8,294 lines', T.catDrain],
    ['AIDLC', 'Delivery lifecycle', 'Product · Architect · Dev · QA agents', 'Ran the intent through ideation, inception and construction as guarded, gated stages.', '23 staged pipeline · 4 phases', T.catGarbage],
    ['Specsmd', 'AI-DLC orchestration', 'Master · Inception · Construction · Ops', 'Orchestrated the intent, dispatched the stages, and enforced the human checkpoints.', '14 agents · 4 phase agents', T.catSanitation],
  ];
  chain.forEach(([tag, role, who, did, out, color], i) => {
    const x = 0.72 + i * 3.03;
    const y = 1.95;
    rect(sl, x, y, 2.78, 3.35, T.surfaceCard, { radius: 0.08, border: T.border });
    rect(sl, x, y, 2.78, 0.09, color);
    text(sl, tag, x + 0.22, y + 0.26, 2.4, 0.34, { size: 18, bold: true, color });
    text(sl, role, x + 0.22, y + 0.62, 2.4, 0.26, { size: 10, bold: true, color: T.inkTertiary, spacing: 0.5 });
    text(sl, who, x + 0.22, y + 0.92, 2.4, 0.44, { size: 10, color: T.inkSecondary, lh: 13 });
    rect(sl, x + 0.22, y + 1.42, 2.34, 0.012, T.border);
    text(sl, did, x + 0.22, y + 1.56, 2.36, 1.05, { size: 11, color: T.inkSecondary, lh: 15 });
    text(sl, out, x + 0.22, y + 2.78, 2.36, 0.44, { size: 10, bold: true, lh: 13 });
    if (i < 3)
      text(sl, '→', x + 2.78, y + 1.45, 0.26, 0.36, {
        size: 17, bold: true, color: T.inkTertiary, align: 'center',
      });
  });
  rect(sl, 0.72, 5.55, 11.9, 0.78, T.primarySoft, { radius: 0.08, border: T.primary });
  text(
    sl,
    'The output of one lane is the input of the next. BMAD supplies the roles, WDS writes the specification, AIDLC runs the lifecycle against it, and Specsmd orchestrates the agents that do the work.',
    1.02,
    5.72,
    11.3,
    0.5,
    { size: 12, bold: true, color: T.primary, align: 'center', lh: 16 },
  );
}

// --- 3 BMAD
{
  const sl = contentSlide({
    eyebrow: 'BMAD · the agent library',
    title: 'Specialist agents, each with a narrow job and a point of view',
    subtitle:
      'BMAD supplied the role roster that every other lane draws on. They are not chat personas — each carries a method, a checklist and a definition of done.',
    n: 3,
  });
  const roster = [
    ['Mary', 'BUSINESS ANALYST', 'Channels Porter and Minto. Grounds every finding in verifiable evidence and represents every stakeholder voice.'],
    ['John', 'PRODUCT MANAGER', 'Drives Jobs-to-be-Done over template filling. User value first; technical feasibility is a constraint, not the driver.'],
    ['Sally', 'UX DESIGNER', 'Balances empathy with edge-case rigor. Starts simple, evolves through feedback, and serves a genuine user need.'],
    ['Winston', 'SYSTEM ARCHITECT', 'Favours boring technology for stability. Ties every architectural decision back to business value.'],
    ['Amelia', 'SENIOR ENGINEER', 'Test-first discipline. 100% pass before review. Every statement citable, every path exact.'],
    ['Murat', 'TEST ARCHITECT', 'Risk-based strategy, ATDD, contract and performance testing. Strong opinions, weakly held.'],
  ];
  roster.forEach(([name, title, body], i) => {
    const x = 0.72 + (i % 3) * 4.03;
    const y = 1.95 + Math.floor(i / 3) * 1.72;
    rect(sl, x, y, 3.73, 1.52, T.surfaceCard, { radius: 0.08, border: T.border });
    text(sl, name, x + 0.24, y + 0.16, 3.3, 0.3, { size: 15, bold: true, color: T.primary });
    text(sl, title, x + 0.24, y + 0.46, 3.3, 0.24, { size: 9, bold: true, color: T.inkTertiary, spacing: 1 });
    text(sl, body, x + 0.24, y + 0.76, 3.28, 0.66, { size: 11, color: T.inkSecondary, lh: 15 });
  });
  text(
    sl,
    'Alongside the software crew, BMAD also ships a creative module — Sophia the storyteller, Maya the design-thinking coach, Carson the brainstorming specialist, Dr. Quinn the problem solver, Victor the innovation strategist — and Caravaggio, the presentation expert.',
    0.72,
    5.5,
    11.9,
    0.5,
    { size: 11.5, italic: true, color: T.inkSecondary, lh: 16 },
  );
  text(sl, '15 agent personas across 7 modules — installed in-repo at _bmad/.', 0.72, 6.1, 11.9, 0.3, {
    size: 12, bold: true, color: T.primary,
  });
}

// --- 4 WDS
{
  const sl = contentSlide({
    eyebrow: 'WDS · the design lane',
    title: 'The idea became a specification before a line of code was written',
    subtitle:
      'WDS ran the project through five design phases. Each phase left an artefact on disk that the next phase consumed — and that the build later consumed too.',
    n: 4,
  });
  const phases = [
    ['A', 'Product Brief', '4 files', 'The civic problem, the make-or-break constraint, and the headline finding: authority onboarding gates success, not citizen acquisition.', T.catDrain],
    ['B', 'Trigger Map', '7 files', 'Four personas scored on 16 driving forces. Result: process-integrity forces dominate — success is gated by operational clarity, not emotional design.', T.catStreetlight],
    ['C', 'UX Scenarios', '38 files', '33 screens specified as spec-as-contract. Every screen carries its own route, states, data and acceptance criteria.', T.catGarbage],
    ['D', 'Design System', '12 files', 'Tokens, components and hero mockups. These tokens are the literal source of the palette this very deck is built from.', T.catSanitation],
    ['E', 'Development', '8 files', 'Tech audit, master PRD and 5 work orders with an explicit dependency graph — WO-000 first, then the four personas.', T.catPothole],
  ];
  phases.forEach(([code, name, files, body, color], i) => {
    const x = 0.72 + i * 2.42;
    const y = 1.95;
    rect(sl, x, y, 2.22, 3.3, T.surfaceCard, { radius: 0.08, border: T.border });
    rect(sl, x, y, 2.22, 0.09, color);
    rect(sl, x + 0.2, y + 0.28, 0.42, 0.42, color, { radius: 0.21 });
    text(sl, code, x + 0.2, y + 0.36, 0.42, 0.28, { size: 14, bold: true, color: T.onPrimary, align: 'center' });
    text(sl, name, x + 0.2, y + 0.82, 1.9, 0.5, { size: 13, bold: true, lh: 16 });
    text(sl, files, x + 0.2, y + 1.36, 1.9, 0.24, { size: 10, bold: true, color: T.inkTertiary });
    rect(sl, x + 0.2, y + 1.66, 1.82, 0.012, T.border);
    text(sl, body, x + 0.2, y + 1.8, 1.86, 1.36, { size: 10, color: T.inkSecondary, lh: 14 });
  });
  rect(sl, 0.72, 5.5, 11.9, 0.82, T.surfaceSunken, { radius: 0.08, border: T.border });
  text(
    sl,
    '<b>69 artefacts &nbsp;·&nbsp; 8,294 lines of specification &nbsp;·&nbsp; 33 screens &nbsp;·&nbsp; 4 personas &nbsp;·&nbsp; 5 work orders</b>',
    1.02,
    5.64,
    11.3,
    0.3,
    { size: 13, align: 'center' },
  );
  text(
    sl,
    'Every number here is a file count in design-artifacts/ — the specification is not a claim, it is a directory.',
    1.02,
    5.98,
    11.3,
    0.26,
    { size: 11, italic: true, color: T.inkSecondary, align: 'center' },
  );
}

// --- 5 AIDLC + Specsmd
{
  const sl = contentSlide({
    eyebrow: 'AIDLC · Specsmd · the engine room',
    title: 'The plan was executed as guarded stages, not improvised',
    subtitle:
      'AIDLC defined the lifecycle and its gates. Specsmd supplied the orchestrator that dispatches the agents, holds the context and enforces the human checkpoints.',
    n: 5,
  });
  text(sl, 'THE PIPELINE', 0.72, 1.9, 6, 0.26, {
    size: 10, bold: true, color: T.inkTertiary, spacing: 1.5,
  });
  const stages = [
    ['Ideation', 'Intent, feasibility, market research, scope, rough mockups', T.catDrain],
    ['Inception', 'Requirements, stories, architecture, units, bolts', T.catGarbage],
    ['Construction', 'Code generation, build and test, delivery planning', T.catStreetlight],
    ['Operation', 'Deploy, observe, validate performance', T.catSanitation],
  ];
  stages.forEach(([name, body, color], i) => {
    const y = 2.24 + i * 1.02;
    rect(sl, 0.72, y, 6.1, 0.9, T.surfaceCard, { radius: 0.08, border: T.border });
    rect(sl, 0.72, y, 0.09, 0.9, color);
    text(sl, name, 0.98, y + 0.13, 1.5, 0.28, { size: 13, bold: true });
    text(sl, body, 0.98, y + 0.45, 5.7, 0.3, { size: 10.5, color: T.inkSecondary });
    if (i < 3)
      text(sl, '▼', 3.5, y + 0.87, 0.4, 0.18, { size: 7, color: T.inkTertiary, align: 'center' });
  });
  text(sl, 'WHAT THE ENGINE ENFORCES', 7.2, 1.9, 5.4, 0.26, {
    size: 10, bold: true, color: T.inkTertiary, spacing: 1.5,
  });
  const guarantees = [
    ['Guard policy', 'Strict. The engine refuses a step that would skip a required gate — refusals are recorded, not argued with.'],
    ['Human checkpoints', 'Plan approval, assumption confirmation and verification-command selection are human stops. Auto mode never touches them.'],
    ['Persistent context', 'Org, team, project and phase rules are re-resolved every session, so the agents never drift from the contract.'],
    ['Full trace', 'Every stage writes an artefact, a review and an audit shard. The build log is reconstructible after the fact.'],
  ];
  guarantees.forEach(([h, b], i) => {
    const y = 2.24 + i * 1.02;
    rect(sl, 7.2, y, 5.42, 0.9, T.surfaceCard, { radius: 0.08, border: T.border });
    text(sl, h, 7.44, y + 0.1, 5.0, 0.26, { size: 12.5, bold: true, color: T.primary });
    text(sl, b, 7.44, y + 0.38, 5.0, 0.46, { size: 10.5, color: T.inkSecondary, lh: 14 });
  });
  text(
    sl,
    '23 stages configured for this intent · 14 specialised agents · 4 phase orchestrators · guard refusals logged, not hidden.',
    0.72,
    6.22,
    11.9,
    0.3,
    { size: 11.5, bold: true, color: T.primary },
  );
}

// --- 6 problem
{
  const sl = contentSlide({
    eyebrow: 'The problem',
    title: 'A broken streetlight is reported to nobody',
    subtitle:
      'There is no single place to report a city problem, no way to know who owns it, and no way to know if it was ever fixed.',
    n: 6,
  });
  const problems = [
    ['No single front door', 'Reports scatter across phone calls, Facebook, Messenger and different government channels. Citizens do not know where to file.'],
    ['No ownership', 'A complaint arrives with no ward, no responsible agency and no priority. It sits in a list nobody owns.'],
    ['No trail', 'Once filed, the citizen has no visibility. Submitted → fixed? Or silently dropped?'],
    ['No dedup', 'Forty people report the same pothole. Without proximity detection the agency sees forty issues instead of one.'],
  ];
  problems.forEach(([h, b], i) => {
    const x = 0.72 + (i % 2) * 6.05;
    const y = 2.0 + Math.floor(i / 2) * 1.62;
    rect(sl, x, y, 5.75, 1.42, T.surfaceCard, { radius: 0.08, border: T.border });
    rect(sl, x, y, 0.055, 1.42, T.danger);
    text(sl, h, x + 0.28, y + 0.18, 5.2, 0.3, { size: 15, bold: true });
    text(sl, b, x + 0.28, y + 0.55, 5.2, 0.75, {
      size: 12,
      color: T.inkSecondary,
      lh: 17,
    });
  });
  text(
    sl,
    'CityFix closes every one of those gaps — not with a bigger phone tree, but with one traceable pipeline.',
    0.72,
    5.5,
    11.9,
    0.4,
    { size: 15, bold: true, color: T.primary },
  );
}

// --- 7 solution
{
  const sl = contentSlide({
    eyebrow: 'The solution',
    title: 'Four roles, one ticket, one trail',
    subtitle:
      'A single report is threaded through the chain: filed by a citizen, triaged by a dispatcher, resolved by a crew, governed by an admin.',
    n: 7,
  });
  const roles = [
    ['Citizen', 'Rahim', '/home', 'Photograph a problem, drop a pin, follow the status trail, confirm the fix.', T.catDrain],
    ['Dispatcher', 'Habib', '/dispatcher', 'Triage the queue, dedup near-identical reports, set priority, assign a crew, route it.', T.catStreetlight],
    ['Crew', 'Rashid', '/crew', 'See only their assigned ward, work the job, prove it with a photo, resolve it.', T.catGarbage],
    ['Admin', 'Anwar', '/admin', 'Configure cities, wards and taxonomy, oversee tickets, and audit every mutation.', T.catSanitation],
  ];
  roles.forEach(([role, who, home, does, color], i) => {
    const x = 0.72 + i * 3.03;
    const y = 1.95;
    rect(sl, x, y, 2.78, 3.1, T.surfaceCard, { radius: 0.08, border: T.border });
    rect(sl, x, y, 2.78, 0.09, color);
    text(sl, role, x + 0.22, y + 0.3, 2.4, 0.32, { size: 16, bold: true });
    text(sl, who, x + 0.22, y + 0.63, 2.4, 0.26, { size: 11, color: T.inkTertiary });
    text(sl, home, x + 0.22, y + 0.92, 2.4, 0.26, { size: 10, color, font: MONO });
    rect(sl, x + 0.22, y + 1.3, 2.34, 0.012, T.border);
    text(sl, does, x + 0.22, y + 1.48, 2.36, 1.45, {
      size: 11.5,
      color: T.inkSecondary,
      lh: 16,
    });
  });
  const chain = ['Submitted', 'Routed', 'In progress', 'Resolved'];
  chain.forEach((c, i) => {
    const x = 0.72 + i * 3.03;
    const y = 5.42;
    rect(sl, x, y, 2.78, 0.46, T.primarySoft, {
      radius: 0.08,
      border: T.primary,
    });
    text(sl, c, x, y + 0.08, 2.78, 0.3, {
      size: 12,
      bold: true,
      color: T.primary,
      align: 'center',
    });
    if (i < 3)
      text(sl, '→', x + 2.79, y + 0.06, 0.24, 0.32, {
        size: 15,
        bold: true,
        color: T.inkTertiary,
        align: 'center',
      });
  });
  text(
    sl,
    'One status vocabulary, shared by every surface — the citizen and the agency read the same trail.',
    0.72,
    6.05,
    11.9,
    0.35,
    { size: 12, italic: true, color: T.inkSecondary, align: 'center' },
  );
}

// --- 8 citizen journey A
{
  const sl = contentSlide({
    eyebrow: 'Citizen journey',
    title: 'One tap from the street to a tracked report',
    subtitle:
      'The public landing explains the civic promise; the citizen home is a live map of real reports around Dhaka.',
    n: 8,
  });
  shotCap(sl, '01-public-landing', { x: 0.72, y: 1.8, w: 6.0, h: 4.7 }, 'Public landing — the citizen promise');
  shotCap(sl, '04-citizen-home', { x: 6.95, y: 1.8, w: 5.65, h: 4.7 }, 'Citizen home — live MapLibre map with real seeded reports');
}

// --- 9 citizen journey B
{
  const sl = contentSlide({
    eyebrow: 'Citizen journey',
    title: 'Report it with a photo and a pin — then watch it move',
    subtitle:
      'Category and location are captured with the report; "My reports" is the citizen’s own view of the trail.',
    n: 9,
  });
  shotCap(sl, '06-citizen-report-location', { x: 0.72, y: 1.8, w: 6.0, h: 4.7 }, 'Report flow — category, photo, map pin');
  shotCap(sl, '05-citizen-my-reports', { x: 6.95, y: 1.8, w: 5.65, h: 4.7 }, 'My reports — the citizen’s own trail');
}

// --- 10 dispatcher
{
  const sl = contentSlide({
    eyebrow: 'Dispatcher',
    title: 'The triage queue: priority, dedup and assignment in one view',
    subtitle:
      'Habib sees every open ticket with its ward, priority badge and assignment state — then routes it.',
    n: 10,
  });
  shotCap(sl, '08-dispatcher-triage-queue', { x: 0.72, y: 1.8, w: 7.6, h: 4.7 }, 'Triage queue — Ward 14, 30 open tickets');
  shotCap(sl, '09-dispatcher-monitor', { x: 8.55, y: 1.8, w: 4.05, h: 4.7 }, 'Monitor — live status view');
}

// --- 11 crew
{
  const sl = contentSlide({
    eyebrow: 'Crew',
    title: 'The field surface: only my ward, only my work',
    subtitle:
      'A crew member is not a dispatcher with fewer buttons — the surface is scoped to the assignments they can actually act on.',
    n: 11,
  });
  const crewList = img(sl, '10-crew-assignments', { x: 0.72, y: 1.8, w: 5.6, h: 2.3 });
  text(sl, 'Crew assignments — one open job in Ward 14', 0.72, crewList.y + crewList.h + 0.08, 5.6, 0.3, {
    size: 11, color: T.inkSecondary, align: 'center',
  });
  const crewDetail = img(sl, '10b-crew-ticket-detail', {
    x: 0.72, y: crewList.y + crewList.h + 0.52, w: 3.35, h: 2.15,
  });
  text(sl, 'The job itself', 4.25, crewDetail.y + crewDetail.h / 2 - 0.3, 2.07, 0.3, {
    size: 11, color: T.inkSecondary, align: 'center',
  });
  const items = [
    ['Scoped by ward', 'Rashid works Ward 14 — not the whole city.'],
    ['Actionable only', 'The API returns only `routed` and `in_progress`.'],
    ['Proof required', 'Resolution needs a photo before the ticket closes.'],
    ['Role-enforced', 'The API refuses a crew session on dispatcher routes.'],
  ];
  items.forEach(([h, b], i) => {
    const y = 1.95 + i * 1.15;
    rect(sl, 6.6, y, 6.0, 0.98, T.surfaceCard, { radius: 0.08, border: T.border });
    text(sl, h, 6.85, y + 0.13, 5.5, 0.28, {
      size: 13,
      bold: true,
      color: T.primary,
    });
    text(sl, b, 6.85, y + 0.44, 5.5, 0.42, {
      size: 11.5,
      color: T.inkSecondary,
      lh: 15,
    });
  });
  text(
    sl,
    'The crew surface is deliberately sparse: it shows work, not everything the city knows about.',
    6.6,
    6.62,
    6.0,
    0.35,
    { size: 11.5, italic: true, color: T.inkSecondary },
  );
}

// --- 12 admin
{
  const sl = contentSlide({
    eyebrow: 'Admin',
    title: 'The console that governs the platform',
    subtitle:
      'Anwar configures the city, watches the ticket estate and reads the audit trail — and every write is WebAuthn-gated.',
    n: 12,
  });
  // (shots added below)
  const consoleImg = img(sl, '11-admin-console', { x: 0.72, y: 1.8, w: 5.6, h: 3.3 });
  text(sl, 'Admin console', 0.72, consoleImg.y + consoleImg.h + 0.06, 5.6, 0.3, {
    size: 11, color: T.inkSecondary, align: 'center',
  });
  shotCap(sl, '12-admin-tickets', { x: 6.6, y: 1.8, w: 6.0, h: 2.1 }, 'Ticket estate');
  shotCap(sl, '13-admin-cities', { x: 6.6, y: 4.35, w: 6.0, h: 2.1 }, 'City setup — wards, taxonomy, adoption');

  const guarantees = [
    ['Scoped, not global', 'A city admin governs one city.'],
    ['WebAuthn on writes', 'A passkey signs every mutation.'],
    ['Audit on every change', 'Who, what, when — recorded.'],
  ];
  guarantees.forEach(([h, b], i) => {
    const y = 5.62 + i * 0.42;
    rect(sl, 0.72, y + 0.06, 0.04, 0.26, T.primary);
    text(
      sl,
      `<b style="color:${T.ink}">${h} — </b><span style="color:${T.inkSecondary}">${b}</span>`,
      0.9,
      y,
      5.7,
      0.38,
      { size: 10.5, lh: 14 },
    );
  });
}

// --- 13 audit + dark
{
  const sl = contentSlide({
    eyebrow: 'Admin',
    title: 'One design system — light, dark, and public by default',
    subtitle:
      "The admin console honours the shared theme system rather than hardcoding a palette, and the public feed shows the city's progress without an account.",
    n: 13,
  });
  shotCap(sl, '15-admin-dark-theme', { x: 0.72, y: 1.8, w: 5.9, h: 4.7 }, 'Admin console in dark theme — same design tokens, inverted');
  shotCap(sl, '07-city-activity-feed', { x: 6.85, y: 1.8, w: 5.75, h: 4.7 }, "Public activity feed — the city's progress, visible to anyone");
}

// --- 14 architecture
{
  const sl = contentSlide({
    eyebrow: 'Under the hood',
    title: 'Architecture',
    subtitle:
      'A conventional, deliberately boring stack — chosen for the audit trail it produces, not for novelty.',
    n: 14,
  });
  const layers = [
    ['Client', ['Next.js 14 App Router', 'React 18 + TypeScript strict', 'Tailwind v3 + CSS custom properties', 'MapLibre GL JS + OSM raster'], T.catDrain],
    ['Server', ['Route handlers + Zod at every boundary', 'Signed HTTP-only session cookies', 'Rate limiting + login lockout', 'Web Push (VAPID)'], T.catStreetlight],
    ['Domain', ['Service layer returning Result&lt;T, E&gt;', 'Ticket transitions + dedup (50 m)', 'City / ward / taxonomy model', 'WebAuthn for admin writes'], T.catGarbage],
    ['Data', ['PostgreSQL 16', 'Prisma 5 — typed client only', 'Raw SQL forbidden in app code', 'Platform audit log'], T.catSanitation],
  ];
  layers.forEach(([h, items, color], i) => {
    const x = 0.72 + i * 3.03;
    const y = 1.95;
    rect(sl, x, y, 2.78, 3.5, T.surfaceCard, { radius: 0.08, border: T.border });
    rect(sl, x, y, 2.78, 0.09, color);
    text(sl, h, x + 0.22, y + 0.3, 2.4, 0.32, { size: 16, bold: true });
    text(
      sl,
      items.map((t) => `<div>• ${t}</div>`).join(''),
      x + 0.22,
      y + 0.75,
      2.4,
      2.6,
      { size: 11.5, color: T.inkSecondary, lh: 20, bullet: true },
    );
  });
  rect(sl, 0.72, 5.72, 11.9, 0.62, T.primarySoft, {
    radius: 0.08,
    border: T.primary,
  });
  text(
    sl,
    'Every service-layer call returns Result&lt;T, E&gt; — no exception crosses a boundary, and every state change is written to the audit log.',
    1.0,
    5.87,
    11.35,
    0.34,
    { size: 12, bold: true, color: T.primary, align: 'center' },
  );
}

// --- 15 evidence
{
  const sl = contentSlide({
    eyebrow: 'Evidence',
    title: 'The claims are measured, not asserted',
    subtitle:
      'Every number below comes from a command in this repository that runs against the real database.',
    n: 15,
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
    rect(sl, x, y, 5.75, 1.42, T.surfaceCard, { radius: 0.08, border: T.border });
    text(sl, big, x + 0.28, y + 0.16, 2.1, 0.66, {
      size: 34,
      bold: true,
      color: T.primary,
    });
    text(sl, label, x + 2.35, y + 0.28, 3.2, 0.32, { size: 14, bold: true });
    text(sl, sub, x + 2.35, y + 0.65, 3.2, 0.6, {
      size: 11,
      color: T.inkSecondary,
      lh: 15,
    });
  });
  rect(sl, 0.72, 5.25, 11.9, 0.95, T.surfaceInverse, { radius: 0.08 });
  text(sl, 'RECORDED CONSTRUCTION VERIFICATION COMMAND', 1.05, 5.4, 11.2, 0.28, {
    size: 10,
    bold: true,
    color: '#718096',
    spacing: 1.5,
  });
  text(
    sl,
    'npx tsc --noEmit &amp;&amp; npm run test:unit &amp;&amp; npm run test:mockups &amp;&amp; curl -fs http://localhost:3000/',
    1.05,
    5.72,
    11.2,
    0.32,
    { size: 12, color: T.inkOnDark, font: MONO },
  );
}

// --- 16 next
{
  const sl = contentSlide({
    eyebrow: "What's next",
    title: 'The pipeline is proven; the city is next',
    subtitle:
      'The platform layer, the four-role chain and the audit trail are complete. What remains is deployment and real-world scale.',
    n: 16,
  });
  const next = [
    ['Deployment', 'Ship the pilot', 'Hosting target is still open — Vercel vs Cloudflare vs Railway is the one decision left to ratify.'],
    ['Citizen onboarding', 'Real SMS provider', 'The OTP provider is a stub from the platform layer; WO-004 selects and wires the production provider.'],
    ['Infrastructure', 'Scale the map', 'OSM raster tiles are dev-grade. Mapbox or a self-hosted tile server is the production path past pilot volume.'],
    ['Growth', 'More cities', 'The city / ward / taxonomy model is data-driven from day one — a new city is configuration, not a fork.'],
  ];
  next.forEach(([tag, h, b], i) => {
    const x = 0.72 + (i % 2) * 6.05;
    const y = 1.95 + Math.floor(i / 2) * 1.62;
    rect(sl, x, y, 5.75, 1.42, T.surfaceCard, { radius: 0.08, border: T.border });
    text(sl, tag.toUpperCase(), x + 0.28, y + 0.16, 3.2, 0.26, {
      size: 10,
      bold: true,
      color: T.primary,
      spacing: 1.5,
    });
    text(sl, h, x + 0.28, y + 0.45, 5.2, 0.32, { size: 15, bold: true });
    text(sl, b, x + 0.28, y + 0.82, 5.2, 0.5, {
      size: 11.5,
      color: T.inkSecondary,
      lh: 16,
    });
  });
  text(sl, 'Thank you — questions welcome.', 0.72, 5.6, 11.9, 0.5, {
    size: 20,
    bold: true,
    align: 'center',
  });
  text(
    sl,
    'cityfix · Next.js 14 · PostgreSQL 16 · Prisma · MapLibre',
    0.72,
    6.15,
    11.9,
    0.32,
    { size: 12, color: T.inkTertiary, align: 'center' },
  );
}

// --- 17 appendix
{
  const sl = contentSlide({
    eyebrow: 'Appendix',
    title: 'Entry points and the public activity feed',
    subtitle:
      'Every entry point routes by role: the site root, the splash and a `?next=` deep link all resolve the same way.',
    n: 17,
  });
  shotCap(sl, '02-login', { x: 0.72, y: 1.8, w: 4.55, h: 4.7 }, 'Login');
  shotCap(sl, '03-splash', { x: 5.5, y: 1.8, w: 3.6, h: 4.7 }, 'Splash');
  shotCap(sl, '14-admin-audit', { x: 9.35, y: 1.8, w: 3.27, h: 4.7 }, 'Audit trail');
}

// --- render
const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>CityFix — deck preview</title>
<style>
  body { margin:0; background:#2D3748; font-family:${FONT}; }
  .wrap { padding:24px; }
  .slide { position:relative; width:${W * PX}px; height:${H * PX}px; margin:0 auto 24px; overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,.45); }
  .el { position:absolute; box-sizing:border-box; }
  /* Block layout, NOT flex: PowerPoint stacks paragraphs vertically.
     With display:flex the <div> children of a multi-paragraph run were
     laid out side by side, which made bullet lists look interleaved. */
  .txt { overflow:hidden; display:block; }
  .txt > div { display:block; }
  /* PowerPoint bullet geometry: marL=342900 indent=-342900 => a hanging
     indent of 0.375in with the glyph in the indent gutter. */
  .bul { padding-left:0.375in; }
  .bul > div { padding-left:0.375in; text-indent:-0.375in; margin-bottom:7px; }
  .bul > div:last-child { margin-bottom:0; }
  .img { overflow:hidden; }
  h1 { color:#fff; font-size:18px; margin:0 0 16px; font-family:${FONT}; }
</style></head>
<body><div class="wrap">
<h1>CityFix deck preview — ${slides.length} slides</h1>
${slides
  .map(
    (sl) =>
      `<div class="slide" style="background:${sl.bg}">${sl.els.join('\n')}</div>`,
  )
  .join('\n')}
</div></body></html>`;

writeFileSync(join(OUT, 'index.html'), html, 'utf8');
console.log(`preview written → ${OUT}/index.html (${slides.length} slides)`);
