---
standard: index
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Standards Index

The CityFix memory-bank's standards layer. Every standard is
authoritative for the work that follows; later layers (intents,
units, bolts, stories) cite the standards they consume.

## Standards

| Slug | Title | Status |
|------|-------|--------|
| [tech-stack](tech-stack.md) | Tech Stack (TypeScript, Next.js 14, Prisma, PostgreSQL, etc.) | complete |
| [data-stack](data-stack.md) | Data Stack (Prisma 5.22, schema rules, indexes) | complete |
| [coding-standards](coding-standards.md) | Coding Standards (TS strict, testing strategy, error handling) | complete |
| [system-architecture](system-architecture.md) | System Architecture (modular monolith, layered) | complete |
| [api-conventions](api-conventions.md) | API Conventions (REST/JSON, response formats) | complete |
| [decision-index](decision-index.md) | Decision Index (ADR-001 through ADR-008) | complete |

## How standards are referenced

Every standard carries frontmatter with:
- `standard` — the slug used in cross-references.
- `phase: standards` — every file at this level shares the phase.
- `status: complete` — gated until the project's Practices
  Discovery re-affirms or supersedes the standard.

Standards are **additive**: a more-specific standard cannot
contradict a more-general one. If a Bolt needs to deviate, the
deviation is recorded in that Bolt's `bolt-decisions.md`, not
by editing the standard.

## Order of authorship (if rebuilding from scratch)

1. `project.yaml` (the project's profile, scope, intent, and
   team).
2. `tech-stack.md` (the technology choices).
3. `data-stack.md` (the schema and persistence choices;
   derives from tech-stack).
4. `system-architecture.md` (the modular-monolith and
   layered-architecture pattern; derives from tech-stack).
5. `api-conventions.md` (the REST/JSON contract conventions;
   derives from system-architecture).
6. `coding-standards.md` (the code style, testing strategy,
   error handling, security patterns; cross-cuts the
   others).
7. `decision-index.md` (the ADR register; cross-references
   the others).

For CityFix, all seven already exist and are committed as of
2026-10-11.

## Cross-references

- **Project profile**: `../project.yaml`.
- **Intents that consume these standards**:
  `../intents/` (Intent 001 through 005).
- **Source artifacts** (the project's pre-specsmd planning
  that was rebased into these standards):
  - `design-artifacts/E-Development/000-tech-audit.md`.
  - `aidlc/spaces/default/memory/{org,team,project}.md`.
  - `_progress/00-design-log.md`.
