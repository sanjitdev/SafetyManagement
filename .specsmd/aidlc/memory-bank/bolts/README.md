---
standard: bolt-folder
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Bolts Folder

This folder is the Construction Agent's working
directory. The Inception Agent captures intent +
unit + story artifacts in `intents/`; the
Construction Agent then plans bolts here, executes
the 5-stage DDD process per bolt, and writes the
artifacts (`ddd-01-domain-model.md`,
`ddd-02-technical-design.md`, `adr-*.md`,
`ddd-03-test-report.md`) per bolt.

## Layout

```text
bolts/
├── README.md                      ← this file
├── plan.md                        ← overall plan (units → bolts)
├── 002-001-auth-and-profile/      ← bolt 1 of intent 002
│   ├── bolt.md                    ← bolt instance
│   ├── ddd-01-domain-model.md
│   ├── ddd-02-technical-design.md
│   ├── ddd-03-test-report.md
│   └── adr-*.md                   ← zero or more ADRs
├── 002-002-home-and-activity/
│   ├── bolt.md
│   └── ...
├── 002-003-submit-report-flow/
│   ├── bolt.md
│   └── ...
├── 002-004-my-reports/
│   ├── bolt.md
│   └── ...
└── 002-005-theme-and-i18n/
    ├── bolt.md
    └── ...
```

## Bolt naming

`{intent-slug}-{unit-slug}` — e.g.,
`002-001-auth-and-profile` for the first unit of
intent 002. Intent 001's bolts are **not** created
(WO-000 predates the specsmd bolt convention; the
implementation is in the repo).

## Status

The Construction Agent is responsible for creating
bolt folders + their artifacts. The Inception
Agent's job stops at the unit-briefs; the bolt plan
in `plan.md` is the bridge.
