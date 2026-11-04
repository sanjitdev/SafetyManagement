---
standard: intent-index
phase: standards
status: in-progress
created: 2026-11-02T18:00:00Z
updated: 2026-11-02T19:10:00Z
---

# Intent 009 — UI Redesign

Full-surface redesign of CityFix in the locked **Accessible +
Swiss/Minimal** civic direction: a real brand mark, an AA-verified
token system, a Phosphor icon family, professional status/indicator
language, redesigned ops charts, and refreshed HTML mockups that gate
each implementation wave.

**Type:** brown-field (frontend feature). The backend, the API
surface, the roles and the transports are unchanged.

**Source plan:** `.puku/plans/cityfix_ui_redesign_90b7624c.plan.md`

## Status

| Wave | Unit | State |
|------|------|-------|
| 0 | 001-ci-unblock | shipped (`45062d1`) |
| 1 | 002-design-foundation | shipped (`b279228`) |
| 2 | 003-auth-and-public-surfaces | mockups shipped; page implementation pending |
| 3 | 004-citizen-surfaces | not started |
| 4 | 005-dispatcher-console | not started |
| 5 | 006-crew-field-app | not started |
| 6 | 007-admin-console | not started |
| 7 | 008-verification-and-signoff | not started |

## Artifacts

| Artifact | File |
|----------|------|
| Requirements | `requirements.md` |
| System context | `system-context.md` |
| Units | `units.md` |
| Unit briefs | `units/<NN-slug>/unit-brief.md` |
| Stories | `units/<NN-slug>/stories/*.md` |
| Inception log | `inception-log.md` |

## Bolts

| Bolt | Unit | State |
|------|------|-------|
| `009-001-ci-unblock` | 001 | complete |
| `009-002-design-foundation` | 002 | complete |
| `009-003-auth-and-public-surfaces` | 003 | in-progress |
| `009-004-citizen-surfaces` | 004 | planned |
| `009-005-dispatcher-console` | 005 | planned |
| `009-006-crew-field-app` | 006 | planned |
| `009-007-admin-console` | 007 | planned |
| `009-008-verification-and-signoff` | 008 | planned |

## Approval gates

Each wave's mockups are a **human** approval gate. The approval is
recorded in `_progress/00-design-log.md` under the wave's dated entry.
No page in a wave is implemented before its mockups are approved.

## Cross-references

- The visual source of truth is `design-artifacts/D-Design-System/`.
  The skill's `--persist` output is deliberately not written, so there
  is exactly one design system.
- The shipped v1 invariants (i18n registry, token-only styling,
  visual baselines, role-scoped routing, dark + outdoor themes) are
  listed in `requirements.md` under Constraints.
