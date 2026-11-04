---
story: 018-project-documentation-refresh
unit: 008-verification-and-signoff
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:50:00Z
updated: 2026-11-02T18:50:00Z
implemented: false
---

# Story 018 — Project Documentation Refresh

## User Story

**As a** teammate picking this up cold
**I want** the design log, the WDS outline and the design-system hub
to reflect the redesign
**So that** the documentation does not describe a product that no
longer exists.

## Acceptance Criteria

- **Given** the redesign is complete
- **When** I read `_progress/00-design-log.md`
- **Then** it carries a dated entry per wave, with what changed, the
  files, and the verification output

- **And** **when** I read `_progress/wds-project-outline.yaml`
- **Then** `development:` reflects the shipped state (not
  `in-progress`)
- **And** `visual-design.mockups` is 28 and `visual-design.baseline-count`
  matches the committed PNG count

- **And** **when** I read
  `design-artifacts/D-Design-System/00-design-system.md`
- **Then** the folder structure lists the mockups and the populated
  `02-Assets/`
- **And** the status section no longer says the assets folder is empty

- **And** **when** I read
  `design-artifacts/D-Design-System/01-Visual-Design/README.md`
- **Then** the file table, the tree and the coverage rationale match
  the shipped mockups

- **And** the repo `README.md` describes the shipped state

- **And** the AIDLC memory-bank index, story index and maintenance log
  are updated, and Intent 009 is closed

## BDD Scenarios

### Scenario 1: The counts are true

```gherkin
Given the mockups folder
When I count the HTML files
Then the number matches the count in the WDS outline
  And the number matches the count in the README
```

### Scenario 2: The design log tells the story

```gherkin
Given the redesign is complete
When I read the design log
Then each wave has a dated entry
  And each entry records the verification output
```

## Out of Scope

- Rewriting the product brief or the trigger map.

## Linked Files

- `_progress/00-design-log.md`
- `_progress/wds-project-outline.yaml`
- `design-artifacts/D-Design-System/00-design-system.md`
- `design-artifacts/D-Design-System/01-Visual-Design/README.md`
- `README.md`
- `.specsmd/aidlc/memory-bank/intents/index.md`
- `.specsmd/aidlc/memory-bank/story-index.md`
- `.specsmd/aidlc/memory-bank/maintenance-log.md`

## Status

Draft.
