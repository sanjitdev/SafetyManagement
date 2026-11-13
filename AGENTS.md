# AGENTS.md — CityFix (SafetyManagement)

Product name is **CityFix** (`docs/idea.md`); the repo folder is named `SafetyManagement`.

## Current lane — specsmd

New work in this repo is driven by **specsmd** (`.specsmd/`). It is the only sanctioned
workflow. The AIDLC lane (`aidlc/`, `.puku-cli/`, `.puku/`) was removed on 2026-11-13.

| Path | Role |
|---|---|
| `.specsmd/aidlc/agents/` | The four agents: `master`, `inception`, `construction`, `operations` |
| `.specsmd/aidlc/skills/` | 26 skills, grouped `master/`, `inception/`, `construction/`, `operations/` |
| `.specsmd/aidlc/memory-bank/` | The work: `intents/`, `bolts/`, `standards/`, `operations/` |
| `.specsmd/aidlc/memory-bank/standards/rules/` | Standing org/team/project rules, preserved from the retired AIDLC lane |
| `.specsmd/aidlc/templates/` | Standards, inception, and bolt-type templates |
| `.specsmd/aidlc/scripts/` | `bolt-complete.cjs`, `status-integrity.cjs`, `artifact-validator.cjs` |
| `design-artifacts/` | Design contract — the source of truth the build uses; UI/UX requirements live here |
| `docs/` | Project documentation, including `idea.md` (product brief input) |

Only `.specsmd/aidlc/memory-bank/` is committed. `agents/`, `skills/`, `templates/`, and
`scripts/` are a per-developer runtime cache the specsmd installer recreates — so a fresh
clone has the memory bank but **not** `bolt-complete.cjs`. Re-install specsmd before running
the bolt-complete gate.

Entry point is the Master Agent:

```
/specsmd-master-agent
```

Then route by phase — `/specsmd-inception-agent`, `/specsmd-construction-agent`,
`/specsmd-operations-agent` (each takes `--unit="{name}"`, and Construction takes
`--bolt-id="{id}"`).

Invariants that matter more than the file layout:

- **Never auto-select a bolt.** `bolt-list` must ask which one to work on.
- **Final bolt stage runs `node .specsmd/aidlc/scripts/bolt-complete.cjs {bolt-id}`.** Never
  hand-edit story files — the script cascades bolt → stories → unit → intent status.
- **A bolt's `bolt.md` flips to `in-progress` before any stage work begins.**
- **Checkpoints stop the turn.** Everything not marked a checkpoint auto-continues; nothing
  else does.

---

## Removed lanes

**AIDLC** — `aidlc/`, `.puku-cli/`, and `.puku/` were deleted on 2026-11-13. The standing
org/team/project rules survived: they now live at
`.specsmd/aidlc/memory-bank/standards/rules/`. Do not re-introduce AIDLC or `.puku-cli/`;
specsmd owns the workflow.

**Whiteport Design Studio (WDS)** — the repo-local tooling trees (`_bmad/`, `.wds/`) were
removed on 2026-11-09, along with the 13 `wds-*` skill installs in
`C:\Users\BS707\.claude\skills\`. They were untracked, installer-generated, and superseded.
The `wds-*` skills hard-read `_bmad/wds/config.yaml`, so they could not be removed
piecemeal.

The WDS lane produced `design-artifacts/` and `_progress/` during the 2026-09-18 discovery
pass. Those artifacts **remain the contract the build uses** and are still tracked — do not
delete them.

**Do not run the WDS lane against `design-artifacts/` again** — specsmd writes there too, and
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
