# CityFix

A citizen-powered city issue reporting and tracking platform. People report
problems like potholes, broken streetlights, garbage, waterlogging, and open
drains with photos and location. The system routes reports to the responsible
authority, detects duplicate complaints, tracks resolution status, and lets
citizens see whether and when the issue was fixed.

The repository folder is named `SafetyManagement`; the product name is
**CityFix** (see `docs/idea.md` for the full problem statement).

## Stack

- Next.js 14 (App Router) + TypeScript strict + Tailwind v3 + `tokens.css`
- Prisma + PostgreSQL 16 (production); an in-memory dev store for local +
  Playwright runs
- MapLibre GL JS + OpenStreetMap raster tiles (dev) with a paid provider
  upgrade path for production
- Playwright (visual baselines + per-WO route specs) + Vitest (unit)
- i18n: Bangla-first, English-secondary; typed key registry at
  `lib/i18n/keys.ts`

## Local development

```sh
npm install
npm run dev:feat     # dev store in memory (no Postgres required)
npm run typecheck    # tsc --noEmit
npm run test:unit    # vitest
npm run test:mockups # playwright visual baselines
npm run test         # full playwright suite
```

The construction verification command (per
`aidlc/spaces/default/memory/project.md`) is:

```sh
npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/
```

## Project layout

| Path | Contents |
|---|---|
| `app/` | Next.js App Router routes (citizen / dispatcher / crew / admin) |
| `components/` | Shared React components (admin audit, dispatcher map, etc.) |
| `lib/` | Service layer + serializers + i18n + auth guards + db switch |
| `prisma/` | Production schema + migrations |
| `tests/` | Playwright route specs (one per WO Bolt) |
| `tests/unit/` | Vitest unit tests |
| `tests-mockups/baselines/` | Playwright visual regression baselines (gating) |
| `design-artifacts/` | WDS product brief, trigger map, UX scenarios, design system, PRDs |
| `_progress/00-design-log.md` | Per-Bolt design log (the project's progress record) |
| `aidlc/` | AI-DLC memory bank (intents, units, stories, bolts) |
| `docs/idea.md` | CityFix problem statement and idea |
| `AGENTS.md` | WDS / agent skill setup for this project |

## Construction loop

This project is built via the AI-DLC Construction loop. Each unit ships as one
Bolt — a single commit on `main` named by the Bolt slug. The current
intents are tracked under `aidlc/spaces/default/memory/intents/`. The design
log at `_progress/00-design-log.md` records every Bolt as it ships.

## License

Private project; all rights reserved.
