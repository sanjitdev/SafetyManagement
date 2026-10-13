---
standard: memory-bank-root
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# CityFix Memory-Bank

The specsmd memory-bank for the CityFix project. This
folder is the single source of truth for the project's
intent + unit + story + bolt + decision artifacts, used
by the Master, Inception, and Construction agents.

## Layout

```text
memory-bank/
├── README.md                  ← this file
├── project.yaml               ← project metadata
├── standards/                 ← cross-cutting project rules
│   ├── index.md
│   ├── tech-stack.md
│   ├── coding-standards.md
│   ├── api-conventions.md
│   ├── system-architecture.md
│   ├── data-stack.md
│   └── decision-index.md      ← ADRs (8 captured so far)
├── intents/                   ← one folder per WO
│   ├── index.md
│   ├── 001-platform-foundation/    ← WO-000 (complete)
│   ├── 002-citizen-report-flow/    ← WO-001 (active)
│   ├── 003-dispatcher-queue/       ← WO-002 (draft)
│   ├── 004-field-crew-app/         ← WO-003 (draft)
│   └── 005-admin-city-setup/       ← WO-004 (draft)
├── bolts/                     ← Construction Agent's working dir
│   ├── README.md
│   ├── plan.md                ← units → bolts decomposition
│   └── 002-001-.../           ← per-Bolt folders (Construction creates)
│       ├── bolt.md
│       ├── ddd-01-domain-model.md
│       ├── ddd-02-technical-design.md
│       ├── ddd-03-test-report.md
│       └── adr-*.md
├── story-index.md             ← every story, by intent × unit × status
├── REFINEMENT.md              ← code-reality audit (brownfield baseline)
└── HANDOFF.md                 ← Inception → Construction handoff note
```

## How an agent opens this folder

1. **Master Agent** — `cd .specsmd/aidlc/memory-bank && cat
   project.yaml` for project metadata, then read this
   README for the layout.
2. **Inception Agent** — read `standards/`, then
   `intents/<active>/`, then `story-index.md`. Writes
   new unit-briefs and stories under
   `intents/<intent>/<unit>/`.
3. **Construction Agent** — read `HANDOFF.md` and
   `REFINEMENT.md` first, then `bolts/plan.md`, then
   per-Bolt `bolts/<id>/bolt.md`. Produces DDD artifacts
   (`ddd-01/02/03` + `adr-*.md`) per Bolt.

## Phase rules

- `standards/` is `phase: standards` — cross-cutting,
  long-lived.
- `intents/` is `phase: inception` — unit-briefs +
  stories + requirements. The Inception Agent writes
  here; the Construction Agent reads from here.
- `bolts/` is `phase: construction` — DDD artifacts +
  ADRs + test reports. The Construction Agent writes
  here.
- Operations artifacts (deferred; for v1.1) will live
  under `intents/<intent>/operations/` or a top-level
  `operations/` once the deployment target is decided.

## Brownfield baseline

This project was bootstrapped through the AIDLC pipeline
+ WDS design pipeline, then re-homed into specsmd on
2026-10-11. WO-000 (Platform Foundation) is **complete** in
the repo; WO-001 (Citizen Report Flow) is **mid-build** —
see `REFINEMENT.md` for the per-story reality matrix
and the 6 open gaps.

## Status legend

| Status | Meaning |
|--------|---------|
| `draft` | Captured, not yet reviewed; not ready for Build |
| `in-progress` | Actively being implemented |
| `done` | All acceptance criteria met + tests green |
| `pending` | Deferred (e.g., 016-push-subscribe is v1.1) |
| `complete` | Intent is fully shipped (all units done) |

## Cross-references

- **AIDLC memory** (project's older layer):
  `aidlc/spaces/default/memory/{org,team,project}.md`.
- **Design artifacts** (WDS pipeline):
  `design-artifacts/`.
- **Design log**: `_progress/00-design-log.md`.
