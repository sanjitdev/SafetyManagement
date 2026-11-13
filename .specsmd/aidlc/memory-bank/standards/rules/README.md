# Standing Rules — preserved from the retired AIDLC lane

These three files are the **standing org / team / project rules** that governed
this repo from the AIDLC era. They were preserved verbatim when the AIDLC lane
was removed on 2026-11-13.

| File | Layer | Scope |
|---|---|---|
| `org.md` | Org | Framework defaults — trunk-based development, commit hygiene, review posture |
| `team.md` | Team | Testing posture, visual-baseline fidelity, mandated practices |
| `project.md` | Project | CityFix-specific scope, corrections, hosting/gating decisions |

## Provenance

Copied from `aidlc/spaces/default/memory/{org,team,project}.md` (SHA-256
verified byte-identical) on **2026-11-13**, immediately before the source tree
was deleted.

## Why keep them

`standards/coding-standards.md` and `standards/decision-index.md` cite these
files as the authority for their content — testing posture, the 0.005 visual
baseline tolerance, and the WO scoping decisions all trace back here. Deleting
them would have left those standards citing nothing.

## Status

**Reference only.** No engine reads these paths any more. The AIDLC resolver
(`aidlc-state.ts`) and its `@`-import stub (`.puku-cli/rules/aidlc.md`) are both
gone, so nothing loads these automatically.

They remain the written record of *why* the standards say what they say. If you
change a standard, update the cited rule here too, or the traceability breaks
again.

## Not preserved

`phases/{ideation,inception,construction,operation}.md` were **not** copied.
They described AIDLC phase mechanics (stage gates, directives) rather than
standing engineering rules, and no specsmd artifact cites them. They remain
retrievable from git history at the commit before 2026-11-13.
