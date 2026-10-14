---
story: 001-dedupe-header-chrome-on-ticket-detail-pages
unit: 002-visible-chrome
intent: 008-ux-polish-from-demo
status: ready
created: 2026-10-14T18:45:00Z
---

# Story 001 — Dedupe Header Chrome on Ticket-detail Pages

## User Story

**As a** crew member / dispatcher reviewing a ticket
**I want** a single, clean header on the ticket-detail
page
**So that** I don't see two stacked back links or two
language / theme toggle rows.

## Acceptance Criteria

- **Given** the page currently renders a local
  sub-header row *and* the global `HeaderBar`
- **When** I open `/crew/tickets/[id]` or
  `/dispatcher/tickets/[id]`
- **Then** I see exactly one back link, one language
  toggle, and one theme toggle in the visible chrome

- **And** the new chrome matches the new visual baseline
  in `tests-mockups/baselines/01-mockups.spec.ts/`
- **And** the old baselines are updated (per
  `team.md` Forbidden — every chrome change ships a new
  baseline)

## BDD Scenarios

### Scenario 1: Crew ticket-detail page

```gherkin
Given I am a crew member with the dev role "crew"
When I open /crew/tickets/<a-routed-ticket>
Then I see exactly one "← আভ্যন্তরীণ কাজে ফিরে যান" link
  And I see exactly one language toggle
  And I see exactly one theme toggle
```

### Scenario 2: Dispatcher ticket-detail page

```gherkin
Given I am a dispatcher with the dev role "dispatcher"
When I open /dispatcher/tickets/<a-submitted-ticket>
Then I see exactly one "← ট্র্যাশড সারিতে ফিরে যান" link
  And I see exactly one language toggle
  And I see exactly one theme toggle
```

## Out of Scope

- i18n key registration — Bolt 008-001.
- Display-name rendering on the H1 / metadata / trail
  actor — Story 002.
- The crew after-photo file upload — Bolt 008-003.
- The admin ticket-detail page (different header).

## Linked Files

- `app/crew/tickets/[id]/page.tsx`
- `app/dispatcher/tickets/[id]/page.tsx`
- `tests-mockups/baselines/01-mockups.spec.ts/` (new
  baselines)
