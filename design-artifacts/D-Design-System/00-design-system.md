# Design System: CityFix

> Components, tokens, and patterns that grow from actual usage — not upfront planning.

**Created:** 2026-09-18 (initial visual design), 2026-10-04 (reorganised into WDS template), 2026-11-02 (UI redesign Waves 1–2)
**Phase:** 7 — Design System (crystallises during Phase 4)
**Agent:** Freya (Designer)

---

## What Belongs Here

The Design System captures reusable patterns that emerged during UX Design (Phase 4). It is not designed upfront — it crystallizes from real page specifications under `C-UX-Scenarios/`.

**What goes here:**
- **Design Tokens** — Colors, spacing, typography, shadows (`01-Visual-Design/tokens.css`)
- **Components** — Buttons, inputs, cards, navigation elements (`01-Visual-Design/components.html`)
- **Patterns** — Layouts, form structures, content blocks
- **Visual Design** — Mood boards, design concepts, color and typography explorations (`01-Visual-Design/`)
- **Assets** — Logos, icons, images, graphics (`02-Assets/`)
- **Components library** — Reusable component specifications (`components/`)

**What does NOT go here:**
- Page-specific content (that lives in `C-UX-Scenarios/`)
- Business logic or API specs (that's E-Development territory)
- Aspirational components nobody uses yet

**When to skip this phase:**
- Using shadcn/ui or Material UI → the library IS your design system
- Simple sites with Tailwind → tokens in `tailwind.config` are enough

---

## Folder Structure

```
D-Design-System/
├── 00-design-system.md          ← This file (hub + guide)
├── 01-Visual-Design/            [Visual exploration + tokens + components + mockups]
│   ├── tokens.css               [Mechanical token definitions]
│   ├── components.html          [Component library reference]
│   ├── gallery.html             [Mockup gallery]
│   ├── README.md                [Visual design conventions]
│   └── mockups/                 [The 5 hero mockups]
└── 02-Assets/                   [Final production assets — empty until Phase 6]
└── components/                  [Emerged components — empty until Phase 4 patterns stabilise]
```

---

## Status for CityFix

- ✅ **01-Visual-Design/** populated with tokens.css + components.html + 5 hero mockups + gallery + README.
- ⏳ **02-Assets/** empty — awaiting Phase 6 (logo, icon set, illustrations).
- ⏳ **components/** empty — components are still embedded in `01-Visual-Design/components.html`; will be broken out as the build phase stabilises component contracts.

---

## For Agents

**Workflow:** `skill:wds-freya` (capability: `DS`)
**Agent trigger:** `DS` (Freya)
**Templates:** `skill:wds-freya`
**Guide:** `skill:wds-freya`

**Before creating any component:**
1. Check if it already exists in the chosen component library
2. Look at actual usage in `C-UX-Scenarios/` page specs — extract, don't invent
3. Load the component template from the workflow templates folder

**File naming:** Number all documents with a two-digit prefix: `01-design-tokens.md`, `02-button.md`, etc. Update the sections below as each file is created.

**Harm:** Designing an abstract component library before any pages exist. Components without real usage are decoration. They waste time and create maintenance burden for patterns nobody needs.

**Help:** Extracting patterns from real page specs. When three pages use similar card layouts, that's a component. The design system documents what emerged, making future pages faster and more consistent.

---

## Cross-references

- `A-Product-Brief/03-visual-direction.md` — the *intent* behind every token (brand personality, voice dimensions → typography mapping, layout breakpoints)
- `C-UX-Scenarios/**/N.M-page.md` — page specifications that drove the design system
- `E-Development/` — what the build phase will reference
- `components/ui/` + `components/ui/charts/` — the implementation of this design system
- `lib/ui/icon-map.ts` — the Phosphor icon registry
- `.specsmd/aidlc/memory-bank/intents/009-ui-redesign/` — the redesign's requirements, units, stories and bolts
- `_progress/00-design-log.md` — the dated record of every wave

---

_Created using Whiteport Design Studio (WDS) methodology_