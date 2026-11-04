---
unit: 007-admin-console
intent: 009-ui-redesign
status: not-started
created: 2026-11-02T18:45:00Z
updated: 2026-11-02T18:45:00Z
---

# Unit 007 — Admin Console (unit-brief)

## Goal

Redesign the admin surfaces — ten routes, the densest data work in the
product. The admin is the "silent enabler": every ticket that reaches
a ward depends on the city configuration being correct, and the audit
trail is the trust record that says it was.

## Scope

### Mockups (approval gate)

| Mockup | Surface | Pattern |
|--------|---------|---------|
| `24-admin-console.html` | `/admin` | KPI row + recent activity + quick links |
| `25-admin-tickets.html` | `/admin/tickets` | Sortable data table + bulk selection + CSV export |
| `26-admin-audit.html` | `/admin/audit` | Audit stream with actor + action chips |
| `27-admin-city-setup.html` | `/admin/cities/[id]/setup` | City configuration wizard |
| `28-admin-adoption.html` | `/admin/cities/[id]/adoption` | KPI row + trend + category bar + SLA bullet |

### Implementation

`/admin`, `/admin/tickets`, `/admin/tickets/[id]`, `/admin/audit`,
`/admin/cities`, `/admin/cities/[id]/{setup,wards,taxonomy,users,adoption}`.

## Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/24-admin-console.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/25-admin-tickets.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/26-admin-audit.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/27-admin-city-setup.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/28-admin-adoption.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html`
- `tests/01-mockups.spec.ts` + 10 new baselines (5 × 2 viewports)
- `app/admin/**` — the 10 routes
- `tests/36-ui-redesign-admin.spec.ts`

## Stories

### 015-admin-mockups

**As a** city administrator
**I want** the admin mockups to show real configuration density
**So that** I can approve a console that reflects the work, not a
sparse marketing page.

### 016-admin-page-implementation

**As a** city administrator reviewing tickets
**I want** to sort by any column, select several rows and export them
**So that** I can hand the ward teams an accurate list.

**Given** the tickets table is rendered
**When** I focus a column header
**Then** it is a focusable button
**And** it carries `aria-sort="ascending" | "descending" | "none"`
matching the current sort
**And** activating it re-sorts the rows without a full page reload.

**Given** I select two or more rows
**When** I choose "Export CSV"
**Then** the export contains exactly the selected rows.

## Acceptance

- The five mockups are approved, token-pure and wired into the gallery
  + baseline spec; 10 new committed baselines.
- Data tables carry sortable + focusable headers with `aria-sort`.
- Bulk selection works and the CSV export honours it.
- The audit stream shows actor + action chips; admin names stay
  hidden in the *citizen* trail (Intent 008 rule) but are visible in
  the admin audit stream, which is the admin's own record.
- The adoption dashboard carries a KPI row + trend + category bar +
  SLA bullet, each with a visible data table.
- Route spec + baselines committed.

### Exit gate

The Unit 003 exit gate, plus `tests/36-ui-redesign-admin.spec.ts` green
and `tests/29-admin-dark-theme.spec.ts` green.

## Status

Not started. The Wave 2 mockups (`08`–`12`) must be approved first.

## Notes

The admin's `WebAuthn`-mandatory write path is unchanged — the
redesign is chrome only. `next.config.js`'s CSP already allows the
mockup hosts.

The adoption dashboard is the one place where the `recharts`
dependency earns its keep: a trend line, a category bar and an SLA
bullet. `SlaBullet` is hand-rolled SVG because Recharts has no
bullet chart.
