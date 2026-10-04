# AGENTS.md — CityFix (SafetyManagement)

Whiteport Design Studio (WDS) skill locations for this project. Two WDS distributions are
installed. **Prefer the standalone install** — it is coherent end-to-end. See Caveats.

Product name is **CityFix** (`docs/idea.md`); the repo folder is named `SafetyManagement`.

---

## 1. Standalone WDS v1.0.0 — preferred

Repo: `C:\Users\BS707\.claude\wds\` (git clone of
`https://github.com/whiteport-collective/whiteport-design-studio`, branch `main`)

Invoke by reading the target `SKILL.md` at its absolute path and following it.

| Slash command | SKILL.md to read |
|---|---|
| `/saga` — strategic analyst (Product Brief, Trigger Map) | `C:\Users\BS707\.claude\wds\src\skills\saga\SKILL.md` |
| `/freya` — UX designer (scenarios, specs, design system) | `C:\Users\BS707\.claude\wds\src\skills\freya\SKILL.md` |
| `/mimir` — implementation (tech audit, PRD, build) | `C:\Users\BS707\.claude\wds\src\skills\mimir\SKILL.md` |
| `/sync` — update WDS from source | `C:\Users\BS707\.claude\wds\src\tools\sync\SKILL.md` |

Command wrappers live in `C:\Users\BS707\.claude\commands\{saga,freya,mimir,sync}.md`.

Skills root: `C:\Users\BS707\.claude\wds\src\skills\`
— `saga`, `freya`, `mimir`, `feedback`

Tools root: `C:\Users\BS707\.claude\wds\src\tools\`
— `design-delivery`, `git`, `handoff`, `memory`, `persona-page`, `prd-workflow`,
`prd-writer`, `social-publish`, `sync`, `wireframe`

Shared agent startup sequence (sync → state → scan → select → brownfield-detect):
`C:\Users\BS707\.claude\wds\src\data\shared-activation.md`

Sync source config: `C:\Users\BS707\.claude\wds-config.yaml`

### Path-resolution gotcha

The command wrappers declare `WDS base: C:\Users\BS707\.claude\wds`, but relative references
inside a skill (`workflows/`, `agents/`, `references/`) resolve against **that skill's own
directory**, not the repo root. Example: `workflows/product-brief.md` in Saga's SKILL.md means
`...\wds\src\skills\saga\workflows\product-brief.md` — not `...\wds\workflows\`.

---

## 2. BMad WDS module v0.4.3 — phase skills

Installed as 13 individually invocable skills in `C:\Users\BS707\.claude\skills\`.
Invoke **by name** via the Skill tool. Do not drive them through the agent menus (see Caveats).

Agents: `wds-agent-saga-analyst`, `wds-agent-freya-ux`, `wds-agent-mimir-builder`

Phase workflows:

| Skill | Purpose |
|---|---|
| `wds-0-project-setup` | Onboarding — project type, complexity, tech stack, routing |
| `wds-0-alignment-signoff` | Stakeholder alignment before project start |
| `wds-1-project-brief` | Project context — foundation for all design work |
| `wds-2-trigger-mapping` | Business goals → user psychology workshops |
| `wds-3-scenarios` | UX scenario outlines from the Trigger Map |
| `wds-4-ux-design` | Scenario-driven visual specifications |
| `wds-5-agentic-development` | AI-assisted build, test, reverse engineering |
| `wds-6-asset-generation` | Visual and text assets from specifications |
| `wds-7-design-system` | Components and design tokens |
| `wds-8-product-evolution` | Brownfield improvements — pipeline in miniature |

Module source cache: `C:\Users\BS707\.bmad\cache\external-modules\wds\src\`
Project module config: `_bmad\wds\config.yaml`

These skills read `_bmad/wds/config.yaml` and are otherwise self-contained (no `{{config.*}}`
tokens), so they run without a BMad render pass.

---

## 3. Project layout

Project follows the WDS folder template (`.wds/src/workflows/0-project-setup/templates/folder-guides/`).

| Path | Contents |
|---|---|
| `docs\idea.md` | CityFix problem statement and idea — discovery input |
| `design-artifacts\A-Product-Brief\` | Product Brief suite (Saga) — `00-…` hub + numbered docs |
| `design-artifacts\B-Trigger-Map\` | Business goals, personas, trigger map (Saga) — `00-…` index + numbered docs |
| `design-artifacts\C-UX-Scenarios\` | Scenarios + page specs (Freya). Scenario outlines at root (4 files); each scenario also has a subfolder with nested page folders `N.M-page/N.M-page.md` + `Sketches/`. `Components/` and `Features\Storyboards/` reserved. |
| `design-artifacts\D-Design-System\` | Design system (Freya) — `00-…` hub + `01-Visual-Design\` (tokens, components, gallery, mockups), `02-Assets\`, `components\` |
| `design-artifacts\E-Development\` | PRDs, delivery packages (Mimir) — empty until Phase 5 |
| `_progress\00-design-log.md` | Design log — single source of truth for project progress |
| `_progress\wds-project-outline.yaml` | Phase status (machine-readable) |
| `_progress\agent-experiences\` | Compressed insights from design discussions (per WDS template) |

`{output_folder}` in WDS skill docs resolves to `design-artifacts\` for this project — that is
where the `A-` through `E-` folders live.

Session state: the memory tool writes `progress\<agent_id>.md` (no leading underscore), while
the scan step looks for project markers under `_progress\`. Both directories are in play.

---

## Caveats

**BMad agent menus are broken.** `wds-agent-saga-analyst`, `wds-agent-freya-ux` and
`wds-agent-mimir-builder` activate correctly, but 14 of their menu targets point at
`bmad-wds-*` skill names that do not exist anywhere (upstream `module-help.csv` advertises 18
skills the module never shipped). Only cross-module targets resolve — `bmad-brainstorming`,
`bmad-market-research`, `bmad-document-project`. Invoke the `wds-*` phase skills directly instead.

**BMad help catalog lists phantom skills.** `_bmad\_config\bmad-help.csv` still contains the 18
`bmad-wds-*` rows. Cosmetic, and installer-managed — do not hand-edit; it is regenerated on
every BMad install.

**`sync` and `memory` were deliberately not installed** from the BMad module: `sync` collides
with the standalone `/sync` command, and `memory` is too generic for a global skill name. The
standalone install covers both.

**The 13 `wds-*` skills were installed by hand**, outside the BMad installer, because the
installer renders only from `src/skills/` and the module ships its content under `src/agents/`,
`src/tools/` and `src/workflows/`. A future `npx bmad-method install` will not know about them.
Remove with `rm -rf ~/.claude/skills/wds-*`.

**Do not mix the two stacks mid-project.** Both write into `design-artifacts\`, so interleaving
them will fork your artifacts. Pick one lane.
