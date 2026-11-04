---
unit: 008-verification-and-signoff
intent: 009-ui-redesign
status: not-started
created: 2026-11-02T18:50:00Z
updated: 2026-11-02T18:50:00Z
---

# Unit 008 — Verification & Sign-off (unit-brief)

## Goal

Prove the redesign holds together, then write down what changed.

## Scope

### Baselines

- Regenerate every committed baseline affected by the token rewrite
  and by the wave implementations.
- Capture the ~43 new baselines across waves 2–6 (10 auth/public + 8
  citizen + 10 dispatcher + 6 crew + 10 admin).
- Retire the superseded baselines (`02-home-city-activity`,
  `05-daily-queue-dashboard`, `06-field-app-home`,
  `07-status-in-progress`) rather than leaving two competing designs
  in the gallery.

### Full gate

| Gate | Command | Target |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | 0 errors |
| Unit | `npm run test:unit` | green |
| Coverage | `npm run test:unit:coverage` | ≥80% lines / branches / functions / statements |
| Visual | `npm run test:mockups` | green |
| i18n | `npm run check:i18n` | green |
| Build | `npm run build` | green |
| Route specs | `tests/32`–`tests/36` | green |
| CI | — | green on `main` |

### Accessibility pass

- Contrast audit on every token pair in all three theme contexts.
- Keyboard walk on `/login` and `/dispatcher` (tab order, focus
  visibility, focusable error summaries, no keyboard trap).
- `prefers-reduced-motion` honoured.
- Screen-reader label on every icon-only control.
- No colour-only status encoding anywhere.

### Documentation

- `_progress/00-design-log.md` — a dated entry per wave.
- `_progress/wds-project-outline.yaml` — `development:` status and the
  visual-design counts.
- `design-artifacts/D-Design-System/00-design-system.md` — the folder
  structure, the status section and the cross-references.
- `design-artifacts/D-Design-System/01-Visual-Design/README.md` — the
  mockup list and the coverage rationale.
- `README.md` (repo root) — the shipped state.

## Files

- `tests-mockups/baselines/01-mockups.spec.ts/**` — regenerated +
  new.
- `tests/01-mockups.spec.ts` — the final viewport map.
- `_progress/00-design-log.md`
- `_progress/wds-project-outline.yaml`
- `design-artifacts/D-Design-System/00-design-system.md`
- `design-artifacts/D-Design-System/01-Visual-Design/README.md`
- `README.md`

## Stories

### 017-full-gate-and-accessibility-pass

**As a** reviewer of the redesign
**I want** the full gate green and an explicit accessibility pass
**So that** "modern and professional" is a verified claim rather than
an opinion.

### 018-project-documentation-refresh

**As a** teammate picking this up cold
**I want** the design log, the WDS outline and the design-system hub
to reflect the redesign
**So that** the documentation does not describe a product that no
longer exists.

## Acceptance

- The gate table above is green, with CI green on `main`.
- The accessibility pass is complete and recorded in the design log.
- The documentation files describe the shipped state, including the
  new mockup count and baseline count.
- The AIDLC memory-bank index, story index and maintenance log are
  updated; Intent 009 is closed.

## Status

Not started. Depends on units 003–007.

## Notes

The baseline drift recorded in Unit 003 (web-font metric variance)
should be resolved before the final regeneration: self-hosting
Noto Sans Bengali makes the baselines deterministic instead of
occasionally flaky.
