---
name: CityFix UI Redesign
overview: Full-surface UI redesign for CityFix (31 routes across public, citizen, dispatcher, crew, admin) in an Accessible + Swiss/Minimal civic direction, with a real logo mark, Phosphor icon family, Recharts dashboards, and a mockup-approval gate before each implementation wave. Delivered through the specsmd master-agent AIDLC flow as Intent 009, with CI unblocked first so every wave has a working gate.
isProject: false
---

# CityFix UI Redesign — Comprehensive Plan

## Objective

Redesign the entire CityFix surface set — from `/login` through every citizen, dispatcher, crew and admin page — so the product reads as a modern, professional civic platform rather than a set of inline-styled screens. Deliverables: a real brand mark, a coherent token system, an icon family, professional status/indicator language, redesigned charts on the ops dashboards, and refreshed HTML mockups that gate each implementation wave.

## Locked decisions (from your answers)

| Decision | Choice |
|---|---|
| Visual direction | **Accessible + Swiss/Minimal** — civic trust, high-contrast navy/blue, flat, dense-but-calm |
| Dependencies | **Add `@phosphor-icons/react` + `recharts`** (only two new runtime deps) |
| Sequencing | **Waves** — foundation + auth → citizen → dispatcher → crew → admin; mockup approval gate per wave |
| Brand | **New CityFix logo mark + wordmark** as in-repo SVG (favicon, header, app icon) |

## Design system — ui-ux-pro-max output

Reproduce with (Python 3.12 confirmed present):

```
python scripts/search.py "civic government SaaS operations dashboard modern professional trustworthy" --design-system -p "CityFix" -f markdown
python scripts/search.py "government public service login form trust" --domain product -n 5
python scripts/search.py "government civic public service" --domain color -n 6
python scripts/search.py "accessible high contrast minimal swiss government" --domain style -n 8
python scripts/search.py "status indicator alert warning success badge" --domain icons -n 12
python scripts/search.py "login form error validation accessibility" --domain ux -n 8
python scripts/search.py "operations dashboard sla trend comparison" --domain chart -n 8
python scripts/search.py "server components hydration performance" --stack nextjs
```

**Style:** Minimalism & Swiss + Accessible & Ethical. Flat surfaces, 1px borders, no decorative shadow stacks, 8px rhythm, hairline dividers, tabular numerals on data.

**Palette** (skill's Government/Public Service + Government Portal rows, reconciled with the existing token file):

| Token | Now | New | Note |
|---|---|---|---|
| `--color-primary` | `#2C5282` | `#1E40AF` | Civic blue, AA on white |
| `--color-primary-hover` / `-pressed` | — | `#1D3FA1` / `#173285` | |
| `--color-primary-soft` | `#EBF2F8` | `#EFF6FF` | selected/active fill |
| `--color-ink` | `#0F1419` | `#020617` | near-black navy |
| `--color-ink-secondary` | `#4A5568` | `#475569` | |
| `--color-ink-tertiary` | `#718096` | `#64748B` | |
| `--color-surface-page` | `#FAFAF7` | `#F8FAFC` | cool off-white |
| `--color-surface-raised` | `#F2F2F2` | `#F1F5F9` | inputs, fills |
| `--color-surface-sunken` | `#EDEDE8` | `#E8ECF1` | |
| `--color-border` / `-strong` | `#E2E8F0` / `#CBD5E0` | `#E2E8F0` / `#CBD5E1` | |
| `--color-success` | `#15803D` | `#16A34A` | service green — success only, never CTA |
| `--color-danger` | `#B91C1C` | `#DC2626` | |
| `--color-accent` (new) | — | `#0369A1` | skill's civic accent; link + focus accent |
| Dark `--color-primary` | `#14B8A6` | `#60A5FA` | fill with near-black text (no teal clash) |

Status + category semantic tokens keep their meaning but move to AA contrast. `.theme-outdoor` (Rashid high-contrast black/white) is preserved and re-verified.

**Typography:** keep **Noto Sans Bengali** for both Bangla and Latin (it is the only face in the stack that renders Bangla; Poppins/Open Sans do not, so the skill's suggestion is rejected here). Add `font-variant-numeric: tabular-nums` and `line-height 1.6` on Bangla body text — Bangla glyphs clip at the old 1.5 leading in pills and buttons.

**Icons:** Phosphor, Outline weight, one family across the app. Central registry `lib/ui/icon-map.ts` mapping category slugs → icons, replacing the ad-hoc `categoryIcon` glyphs and the 12px header dot.

| Surface | Phosphor icon |
|---|---|
| Home / Activity / Map | `House`, `MapTrifold` |
| My reports / Queue / Audit | `ClipboardText`, `ListChecks`, `Scroll` |
| New report / Users / Add user | `PlusCircle`, `Users`, `UserPlus` |
| Monitor / Performance | `Pulse`, `ChartLineUp` |
| Dedup / Taxonomy / Wards / City | `Copy`, `TreeStructure`, `Polygon`, `Buildings` |
| Status set | `CheckCircle`, `WarningCircle`, `XCircle`, `Info`, `Clock`, `CircleNotch` |
| Auth set | `SignIn`, `SignOut`, `LockKey`, `ArrowLeft`, `ArrowSquareOut` |
| Media / location | `Camera`, `Image`, `MapPin`, `Crosshair` |
| Categories | streetlight `Lightbulb`, pothole `RoadHorizon`, garbage `Trash`, drainage `Drop`, sanitation `SprayBottle`, other `DotsThree` |

**Charts (Recharts + hand-rolled SVG):**

| Chart | Type | Surface |
|---|---|---|
| Tickets/day trend | Line (solid/dashed series, direct labels) | `/dispatcher/performance`, `/admin/cities/[id]/adoption` |
| Reports by category | Horizontal bar, sorted desc | `/dispatcher/performance`, `/admin/tickets` |
| SLA vs target | Bullet (custom SVG — Recharts has no bullet) | `/admin/cities/[id]/adoption` |
| Live counters | Stat cards, no chart | `/dispatcher/monitor` |

Every chart ships a visible sortable data-table fallback and never encodes a series by hue alone (skill a11y rule). Recharts is `dynamic()`-imported so server components stay server components.

## Brand assets — `design-artifacts/D-Design-System/02-Assets/` (currently empty)

- `logo/cityfix-mark.svg` — map-pin silhouette whose negative space forms a check: "reported → resolved". Navy `#0F172A` body, civic-blue `#1E40AF` accent, service-green `#16A34A` check. 24×24 grid.
- `logo/cityfix-wordmark.svg` — mark + "CityFix" lockup, `tracking-tight`, for the header.
- `logo/favicon.svg`, `logo/app-icon-512.png` — monogram "CF" variant; wired to `app/layout.tsx` metadata + `public/`.
- `logo/og-image.svg` — social card for shared report links.
- `NOTICE.md` — OFL notice for Noto Sans Bengali, MIT note for Phosphor, OSM + MapLibre attribution requirements.

**Third-party marks are authentic or absent — never fabricated.** OSM attribution must appear on every map (licence requirement, audited in this plan); MapLibre logo per its terms. A Dhaka North City Corporation seal is **not** drawn — a neutral `Buildings` placeholder ships, with a documented swap slot in `02-Assets/README.md`.

## Invariants that must survive the redesign

| Invariant | Source |
|---|---|
| All copy via `lib/i18n/keys.ts` (718 keys), `bn` + `en` together | `npm run check:i18n` |
| Components use `var(--color-*)` only — no hard-coded hex/px | `components/ui/index.ts` header rule |
| Tokens live in `design-artifacts/.../tokens.css`, imported by `app/globals.css` | `app/globals.css` |
| Visual baselines are gating (15 committed PNGs) | `team.md`; `npm run test:update-baselines` |
| Role-scoped routing at `/`, `/splash`, `/login` via `lib/role-home.ts` | `tests/unit/role-redirect-call-sites.test.ts` |
| Dark mode + `.theme-outdoor` both render correctly | `tests/29-admin-dark-theme.spec.ts` |
| New primitive ⇒ unit test in `tests/unit/components/` + barrel export | `components/ui/index.ts` |
| Playwright specs must wait for hydration before filling controlled inputs | `tests/30-role-redirect.spec.ts` (measured 47–1745 ms) |

---

## Wave 0 — Unblock CI (prerequisite; no design work)

CI has failed **18/18 runs** since it landed, so it is currently useless as a gate. Two root causes, both confirmed by reproduction:

1. `tests/28-role-walkthrough.spec.ts:242` — `let streetlightCategoryId` never reassigned → `prefer-const` error.
2. `lib/db.ts:22` — `assertProductionDatabaseConfig()` runs at **module load**. CI sets `DATABASE_URL` to a loopback URL, so (a) the unit step fails — `tests/unit/webauthn-prod-guard.test.ts` flips `NODE_ENV=production` and re-imports `lib/auth/webauthn → lib/db-switch → lib/db`, tripping the guard (5 failures, reproduced locally), and (b) the build fails collecting page data for `/api/dev/list-users`. This contradicts the guard's own docstring ("a module-load throw would fail the build before the app ever serves a request"). Vercel escapes it only because its `DATABASE_URL` is the Neon host.

Fix: assert on **first real DB use** (lazy proxy over the Prisma client) instead of at import — loud-fail on the first request, never on the build. The guard is not weakened.

**Exit:** lint 0 errors · `tsc --noEmit` clean · `test:unit` 1142/1142 · coverage ≥80% · `test:mockups` 15/15 · `npm run build` green · CI run green on `main`.

---

## Wave 1 — Design foundation (no page changes yet)

**Tokens** — rewrite `tokens.css` to the palette above; add `--color-accent`, `--shadow-focus`, `--icon-size-{sm,md,lg}`, tabular-num utility; re-verify all three theme contexts (`:root`, `.theme-dark`, `.theme-outdoor`) at AA contrast; update `themeColor` in `app/layout.tsx`.

**Global CSS** — `app/globals.css`: focus-visible ring, reduced-motion block, 8px rhythm utilities, Bangla line-height correction, `.sr-only`, print styles for audit/export.

**Icons** — `npm i @phosphor-icons/react`; `lib/ui/icon-map.ts` registry (category slug → icon, per-icon imports for tree-shaking).

**Charts** — `npm i recharts`; `components/ui/charts/` — `TrendLine`, `CategoryBar`, `SlaBullet`, `StatCard`, each with `data-table` fallback and `aria` labelling.

**Primitives** — `components/ui/`: `Button`, `IconButton`, `Field` (label + hint + error + `aria-describedby`), `Input`, `Select`, `Textarea`, `Card`, `Panel`, `Badge`, `StatusPill` (upgrade: icon + label, never colour alone), `Avatar`, `Toolbar`, `FilterBar`, `DataTable`, `EmptyState`, `ErrorState`, `LoadingState` (`CircleNotch` spinner), `Breadcrumb`, `SideNav`, `Tabs`, `Modal`, `Toast`, `KpiRow`, `Timeline` (status trail).

**Brand** — the SVG set above; `public/favicon.svg`; header wordmark swap in `components/AppHeader.tsx`.

**Component gallery** — rewrite `01-Visual-Design/components.html` + `gallery.html` to the new system.

**Exit:** unit tests per primitive (happy path + 2 edge cases each) · coverage ≥80% · gallery renders · `check:i18n` green · baselines regenerated (tokens moved → all 15 shift) and committed.

---

## Wave 2 — Auth + public surfaces

**Mockups (5, approval gate):** `08-login`, `09-register`, `10-verify-otp`, `11-public-landing`, `12-feed`. Static HTML + tailwind CDN + new `tokens.css` — no app build needed, minutes each.

**Implement:** `/login`, `/register`, `/verify-otp`, `/` (public landing), `/feed`, `/splash`.

Auth specifics from the skill's UX rules: focusable error summary linked to each invalid field, `role="alert"` on errors, `<label for>` on every input (no placeholder-only), inline validation on blur, explicit loading → success/error on submit, clear recovery path on 423 lockout. Bangla-first copy, professional bilingual register, "trusted by Dhaka North City Corporation" trust line.

**Exit:** mockups approved → pages implemented → new Playwright route specs + baselines → full gate green.

---

## Wave 3 — Citizen surfaces

**Mockups (4):** `13-home-city-activity` (map + activity panel + KPI strip), `14-report-shell` (5-step flow shell + one step detail), `15-my-reports`, `16-report-detail-trail`.

**Implement:** `/home`, `/report/(create)/{category,location,photo,note,summary}`, `/report/[id]/submitted`, `/reports`, `/reports/[id]`.

Includes the report flow's photo capture (progress ring, cap indicator `0 / 3 ছবি`), dedup prompt, and the citizen status trail as a vertical `Timeline` with per-step icons + timestamps.

---

## Wave 4 — Dispatcher console

**Mockups (5):** `17-triage-queue`, `18-dispatcher-ticket-detail`, `19-dispatcher-map`, `20-dispatcher-monitor` (dark ops board), `21-dispatcher-performance` (charts).

**Implement:** `/dispatcher`, `/dispatcher/tickets/[id]`, `/dispatcher/map`, `/dispatcher/dedup`, `/dispatcher/monitor`, `/dispatcher/performance`.

Dense 3-region layout (filter rail / list / detail), sticky action bar, SLA countdown chip, crew picker as a searchable combobox, Recharts trend + category bars.

---

## Wave 5 — Crew field app

**Mockups (2):** `22-crew-assignments`, `23-crew-ticket-detail` (outdoor high-contrast).

**Implement:** `/crew`, `/crew/tickets/[id]`. Large 48px+ targets, one-thumb capture, before/after photo cards, big status action buttons, `.theme-outdoor` preserved.

---

## Wave 6 — Admin console

**Mockups (5):** `24-admin-console`, `25-admin-tickets`, `26-admin-audit`, `27-admin-city-setup`, `28-admin-adoption` (charts + users).

**Implement:** `/admin`, `/admin/tickets`, `/admin/tickets/[id]`, `/admin/audit`, `/admin/cities`, `/admin/cities/[id]/{setup,wards,taxonomy,users,adoption}`.

Admin gets the densest treatment: data tables with sortable/focusable headers + `aria-sort`, bulk selection, CSV export affordance, audit stream with actor + action chips, adoption dashboard with KPI row + trend + category bar + SLA bullet.

---

## Wave 7 — Verification & sign-off

- Regenerate all 15 committed baselines + capture the ~28 new mockup baselines.
- Full gate: `tsc --noEmit` · `lint` (0 errors) · `test:unit` (≥1142 + new) · `test:unit:coverage` (≥80% lines/branches/functions/statements) · `test:mockups` · `check:i18n` · `npm run build` · targeted Playwright route specs · CI green.
- Accessibility pass: contrast audit on every token pair in both themes, keyboard walk on login + triage queue, `prefers-reduced-motion`, screen-reader labels on every icon-only control, no colour-only status encoding.
- Update `README.md` (Shipped state + screenshots), `_progress/00-design-log.md`, `_progress/wds-project-outline.yaml` (currently stale: says *development: in-progress*), `design-artifacts/D-Design-System/00-design-system.md`.

---

## AIDLC / specsmd master-agent integration

Process spine (`.puku-cli/agents/specsmd-master-agent.md` → `.specsmd/aidlc/agents/master-agent.md`):

1. `/specsmd-master-agent` → `analyze` → route to **Inception** (project initialized: `memory-bank/standards/` present).
2. `intent-create` → **Intent 009 `009-ui-redesign`**, brown-field, type "frontend feature", status `draft`.
3. `requirements.md` — the 8 waves above become FR-1…FR-8; the invariants table becomes the Constraints section; explicit "no new roles / no new endpoints / no new transports" out-of-scope.
4. `units.md` — 8 units, one per wave, with the dependency graph (Wave 0 → Wave 1 → Waves 2–6 in any order → Wave 7).
5. `story-create` — 1–3 stories per wave, each with acceptance criteria naming the mockup, the pages, and the gate.
6. `bolt-plan` — 8 bolts, one per wave; each bolt's exit criteria = the wave's gate.
7. `/specsmd-construction-agent` per bolt → `bolt-start` → ship → `bolt-status` → close.
8. Maintain `.specsmd/aidlc/memory-bank/intents/index.md`, `story-index.md`, `maintenance-log.md`.

The AIDLC artifacts are the audit trail; they do not replace the repo's own `design-artifacts/` source of truth. **One** design system lives in `design-artifacts/D-Design-System/` — the skill's `--persist` output (`design-system/<slug>/MASTER.md`) is deliberately **not** written, to avoid two competing design systems.

---

## Risks

| Risk | Mitigation |
|---|---|
| Baseline churn — the first token change shifts all 15 committed PNGs | Regenerate + commit in Wave 1, not at the end; keep the mockup→build parity helper (`tests/helpers/compare.ts`) as the gate |
| Recharts bundle + client boundaries | `dynamic()` import charts; keep pages server components; import Phosphor icons per-icon |
| Bangla clipping at new type sizes | 1.6 leading on Bangla body; pill/button truncation audit per wave |
| Dark mode + outdoor regression | Every token change re-verified in all 3 theme contexts; `tests/29-admin-dark-theme.spec.ts` runs in every wave's gate |
| Hydration flakes in Playwright | Reuse the `window.next.router` hydration wait; never `networkidle` |
| i18n drift on new copy | New keys ship `bn` + `en` in the same commit; `npm run check:i18n` in the gate |
| CI red masks regressions | Wave 0 first; no wave starts until CI is green |
| Scope creep past the 31 routes | Wave boundaries are route lists; anything else is out of scope |

## Out of scope

Backend/API changes · new roles · new endpoints · push/VAPID wiring · Twilio OTP · multi-city tenancy · native mobile · new analytics tracking · page-content/copy rewrites beyond chrome, labels and indicators · redesigning the MapLibre map internals (chrome only).

## Definition of done

Every one of the 31 routes renders on the new system with Phosphor icons, token-driven colors, labelled status indicators, professional chart/indicator language, and the CityFix mark in the chrome — in light, dark and outdoor themes, in Bangla and English — with `main` green on CI, all baselines regenerated, and Intent 009 closed in the AIDLC memory bank.
