---
story: 003-chrome-polish-status-pill-assignedcrew-icon-buttonlabel
unit: 002-visible-chrome
intent: 008-ux-polish-from-demo
status: ready
created: 2026-10-14T18:45:00Z
---

# Story 003 — Chrome Polish (Status Pill, Assigned Crew, Icon, Button Label, Photo Card)

## User Story

**As a** dispatcher / crew member
**I want** every chrome element to be properly labelled
**So that** I can rely on the page as the canonical view
of the ticket.

## Acceptance Criteria

- **Given** the ticket is in the `submitted` state
- **When** the dispatcher opens the page
- **Then** the status pill shows
  `জমা দেওয়া হয়েছে` (Bangla) or `Submitted` (English),
  not an empty black bar

- **Given** `assignedCrewId` is null
- **When** the dispatcher opens the page
- **Then** the assigned-crew field shows
  `কোনো কর্মী নিযুক্ত নয়` (Bangla) or `Not assigned`
  (English), not a `—` em-dash

- **Given** the ticket has `categoryId = cat_streetlight`
- **When** the dispatcher or crew opens the page
- **Then** a category-specific icon (the same icon set
  used in the citizen category picker) is rendered next
  to the H1, not a generic `?` icon

- **Given** the dispatcher opens the page
- **When** they look at the "Change ward / department"
  button
- **Then** the button label is
  `ওয়ার্ড ও বিভাগ পরিবর্তন` (Bangla) or
  `Change ward and department` (English) — clearer scope
  than the previous `ওয়ার্ড / বিভাগ পরিবর্তন`

- **Given** the crew member has uploaded an after-photo
- **When** they view the photo card
- **Then** the card has a `Before` / `After` label and
  the alt text uses the localized label, not a numeric
  `photo 2` index

## BDD Scenarios

### Scenario 1: Status pill always labelled

```gherkin
Given a ticket in state "submitted"
When the dispatcher opens /dispatcher/tickets/<id>
Then the status pill is labelled
  And it reads "জমা দেওয়া হয়েছে" (Bangla locale)
  And it is not empty
```

### Scenario 2: Empty assignedCrew

```gherkin
Given a ticket with assignedCrewId = null
When the dispatcher opens /dispatcher/tickets/<id>
Then the assigned-crew field reads "কোনো কর্মী নিযুক্ত নয়"
  And it is not a "—" em-dash
```

### Scenario 3: Category icon

```gherkin
Given a ticket with categoryId = cat_streetlight
When the dispatcher / crew opens the page
Then a category-specific icon is rendered next to the H1
  And it is not a generic "?" icon
```

### Scenario 4: Photo card label

```gherkin
Given the crew has uploaded one after-photo
When the crew views the photo card
Then the card has a "After photo" label above the image
  And the alt text is "After photo", not "photo 2"
```

## Out of Scope

- i18n key registration — Bolt 008-001 (the keys
  `dispatcher.assignCrew.none`, `ticket.status.submitted`,
  `photo.before`, `photo.after`, `dispatcher.changeWard`
  are registered in 008-001).
- Header chrome dedup — Story 001.
- Display-name rendering — Story 002.
- The crew after-photo file upload — Bolt 008-003.

## Linked Files

- `app/crew/tickets/[id]/page.tsx`
- `app/dispatcher/tickets/[id]/page.tsx`
- `components/StatusPill.tsx` (add `submitted` case)
