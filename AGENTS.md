# AGENTS.md — CityFix (SafetyManagement)

Product name is **CityFix** (`docs/idea.md`); the repo folder is named `SafetyManagement`.

## Current lane — AIDLC + specsmd

New work in this repo is driven by **AIDLC** (the `aidlc/` space, the `.puku-cli/` AIDLC
engine and tools) and **specsmd** (`.specsmd/`). Both are the only sanctioned workflow.

| Path | Role |
|---|---|
| `.puku-cli/` | AIDLC engine, agents, hooks, sensors, rules, tools — the CLI launcher is `.puku-cli/tools/aidlc.ts` (Bun runtime) |
| `aidlc/` | AIDLC space state: `spaces/default/memory/` (org/team/project rules), `spaces/default/intents/` |
| `.specsmd/` | specsmd memory bank: `aidlc/memory-bank/` (bolts, ADRs, handoffs) and `aidlc/agents/` |
| `design-artifacts/` | Design contract — the source of truth Mimir builds against; UI/UX requirements live here |
| `docs/` | Project documentation, including `idea.md` (product brief input) |

Invoke the AIDLC CLI with the project default scope:

```
AWS_AIDLC_DEFAULT_SCOPE=feature bun .puku-cli/tools/aidlc.ts <command>
```

Never invoke the framework files with Node — they use Bun-specific runtime features.

---

## Legacy lane — Whiteport Design Studio (WDS)

The WDS lane produced `design-artifacts/` and `_progress/` during the 2026-09-18 discovery
pass. Those artifacts **remain the contract the build uses** and are still tracked — do not
delete them.

The repo-local WDS/BMad tooling trees (`_bmad/`, `.wds/`) were removed on 2026-11-09, along
with the 13 `wds-*` skill installs in `C:\Users\BS707\.claude\skills\`. They were untracked,
installer-generated, and superseded by AIDLC/specsmd. The `wds-*` skills hard-read
`_bmad/wds/config.yaml`, so they could not be removed piecemeal.

**Do not run the WDS lane against `design-artifacts/` again** — AIDLC writes there too, and
interleaving the two forks the artifacts.

### Project layout (WDS-produced, still live)

| Path | Contents |
|---|---|
| `docs\idea.md` | CityFix problem statement and idea — discovery input |
| `design-artifacts\A-Product-Brief\` | Product Brief suite (Saga) — `00-…` hub + numbered docs |
| `design-artifacts\B-Trigger-Map\` | Business goals, personas, trigger map (Saga) — `00-…` index + numbered docs |
| `design-artifacts\C-UX-Scenarios\` | Scenarios + page specs (Freya). Scenario outlines at root (4 files); each scenario also has a subfolder with nested page folders `N.M-page/N.M-page.md` + `Sketches\`. `Components\` and `Features\Storyboards\` reserved. |
| `design-artifacts\D-Design-System\` | Design system (Freya) — `00-…` hub + `01-Visual-Design\` (tokens, components, gallery, mockups), `02-Assets\`, `components\` |
| `design-artifacts\E-Development\` | PRDs, delivery packages (Mimir) |
| `_progress\00-design-log.md` | Design log — single source of truth for project progress |
| `_progress\wds-project-outline.yaml` | Phase status (machine-readable) |

### Standalone WDS install (home directory — still present)

A separate distribution lives outside the repo and was **not** removed. It is a git clone of
`https://github.com/whiteport-collective/whiteport-design-studio`, branch `main`.

| Slash command | SKILL.md to read |
|---|---|
| `/saga` — strategic analyst (Product Brief, Trigger Map) | `C:\Users\BS707\.claude\wds\src\skills\saga\SKILL.md` |
| `/freya` — UX designer (scenarios, specs, design system) | `C:\Users\BS707\.claude\wds\src\skills\freya\SKILL.md` |
| `/mimir` — implementation (tech audit, PRD, build) | `C:\Users\BS707\.claude\wds\src\skills\mimir\SKILL.md` |
| `/sync` — update WDS from source | `C:\Users\BS707\.claude\wds\src\tools\sync\SKILL.md` |

Skills root: `C:\Users\BS707\.claude\wds\src\skills\` — `saga`, `freya`, `mimir`, `feedback`
Tools root: `C:\Users\BS707\.claude\wds\src\tools\` — `design-delivery`, `git`, `handoff`,
`memory`, `persona-page`, `prd-workflow`, `prd-writer`, `social-publish`, `sync`, `wireframe`

**Path-resolution gotcha:** the command wrappers declare `WDS base: C:\Users\BS707\.claude\wds`,
but relative references inside a skill (`workflows/`, `agents/`, `references/`) resolve against
**that skill's own directory**, not the repo root. Example: `workflows/product-brief.md` in
Saga's SKILL.md means `...\wds\src\skills\saga\workflows\product-brief.md` — not
`...\wds\workflows\`.

---

## Caveats

**The `bmad-*` skills in `C:\Users\BS707\.claude\skills\` are a different module family** from
the removed `wds-*` skills — cross-module targets like `bmad-brainstorming`,
`bmad-market-research` and `bmad-document-project` still resolve. Do not confuse the two
families when cleaning up.

**`C:\Users\BS707\.bmad\`** holds the BMad installer's module cache (external modules and
shims). It is outside the repo and was not removed.

**Session state paths differ.** The WDS memory tool writes `progress\<agent_id>.md` (no
leading underscore), while the scan step looks for project markers under `_progress\`. Both
directories were in play; `_progress\` is the tracked one.
