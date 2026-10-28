# UI Audit — Fixes Log

**Scope:** every user flow (citizen/reporter, dispatcher, crew, admin) and every
shared surface, walked at three breakpoints — 390×844 (mobile), 1024×768
(tablet), 1440×900 (desktop).

**Method:** `ui-audit.mjs` screenshots every surface per role per viewport;
`flow-walk.mjs` drives the citizen flow end-to-end (register → OTP → home →
report → submit → track → feedback) asserting on **visible copy**, not pixels.

**Screenshots:** `ui-audit-shots/` (202 files — `{role}-{viewport}-{surface}.png`
and `flow-{viewport}-NN-{step}.png`).

**Final verification:** `npx tsc --noEmit` clean · `npm run test:unit` 60/60
files, 865/865 tests pass · `npm run test:mockups` 15/15 visual-regression
baselines pass · all 12 role×viewport audits report **zero console errors and
zero page errors** · `flow-walk.mjs` **PASSED** at both mobile and desktop
(18 steps, zero assertion failures).

---

## Responsive / layout defects

| # | What | Where |
|---|---|---|
| 1 | Admin tickets filter rail was a fixed 288px sidebar — it crushed the table to a ~100px sliver on a phone | `app/admin/tickets/page.tsx` |
| 2 | Same fixed-288px sidebar defect on the admin audit page | `app/admin/audit/page.tsx` |
| 3 | Dispatcher ticket detail's 320px sidebar rendered **over** the main content on mobile, hiding it entirely (the `dispatcher-detail-grid` class had no CSS rule at all) | `app/dispatcher/tickets/[id]/page.tsx` |
| 4 | Dispatcher queue + map used a fixed `240px 1fr` grid with no mobile override (`dispatcher-grid` had no CSS rule) | `app/globals.css` (+ `app/dispatcher/page.tsx`, `app/dispatcher/map/page.tsx`) |
| 5 | Admin audit table had `width: 100%` inside a scroll wrapper — the browser squeezed the columns instead of scrolling, breaking the Bangla timestamp across 5 lines | `components/AdminAuditTable.tsx` |
| 6 | Admin tickets table (7 columns) had the same squeeze defect | `components/AdminTicketsTable.tsx` |
| 7 | Dispatcher performance crew table + long-tail table had the same squeeze defect | `app/dispatcher/performance/page.tsx` |
| 8 | Admin cities table (7 columns) had no scroll wrapper at all | `app/admin/cities/page.tsx` |
| 9 | Admin wards table squeezed the Bangla ward name to a few characters per line | `app/admin/cities/[id]/wards/page.tsx` |
| 10 | Admin taxonomy panels were `grid-cols-2` — neither fit a 390px phone; both tables also squeezed | `app/admin/cities/[id]/taxonomy/page.tsx` |
| 11 | Admin adoption funnel / daily / heatmap tables had no scroll wrapper | `app/admin/cities/[id]/adoption/page.tsx` |
| 12 | Admin ticket-detail meta list was a fixed `160px 1fr` grid — the value column was too narrow for Bangla on a phone | `app/admin/tickets/[id]/page.tsx` |
| 13 | Taxonomy "new department" / "new category" buttons were pushed off the right edge — the `flex-1` inputs had no `min-w-0` so they refused to shrink | `app/admin/cities/[id]/taxonomy/page.tsx` |
| 14 | The header's Report CTA overflowed a 390px phone onto the brand logo — the CSS rule targeted `.appheader-cta span` but the label was a **bare text node**, so the selector matched nothing and the label never collapsed | `components/AppHeader.tsx` |
| 15 | The header's `<style>` block caused a **hydration mismatch on every page that renders it** (`/home`, `/reports`, `/feed`) once the CSS contained a quote character — React escapes a `<style>` text child | `components/AppHeader.tsx` (now `dangerouslySetInnerHTML` with a static literal) |

---

## Data / copy defects

| # | What | Where |
|---|---|---|
| 16 | Raw ticket ids (`ticket_seed_routed_1`) shown to citizens and staff on 6 surfaces | NEW `lib/format/ticket-id.ts` + `app/reports/[id]/page.tsx`, `app/crew/tickets/[id]/page.tsx`, `app/dispatcher/tickets/[id]/page.tsx`, `app/dispatcher/dedup/page.tsx`, `app/dispatcher/performance/page.tsx`, `components/AdminTicketsTable.tsx` |
| 17 | Serializer dropped `cityName`/`cityNameBn`, so every surface showed the raw `city_dhaka_north` | `lib/serializers/ticket.ts` (both role branches + the interface) + `app/dispatcher/tickets/[id]/page.tsx` |
| 18 | **The citizen's own report detail page never rendered the description they typed** — the note was accepted and then never seen again, which reads as the report having been dropped | `app/reports/[id]/page.tsx` + `lib/i18n/keys.ts` (`detail.section.description`) |
| 19 | Audit table rendered a raw orphan actor id **and mislabelled it `citizen`** — misattributing admin actions in the audit trail | `lib/admin/audit-query.ts` (new `roleFromActorId`) + `tests/unit/admin/audit-query-list.test.ts` |

---

## Harnesses added

| # | What | Where |
|---|---|---|
| 20 | Citizen end-to-end interaction walk — clicks through register → OTP → home → report → submit → track → feedback, asserting on visible copy | NEW `flow-walk.mjs` |
| 21 | Per-role, per-viewport screenshot walk | `ui-audit.mjs` |

---

## Notes for future audits

- **An inline `style` out-prioritises any plain class rule.** Every responsive
  override for an inline `gridTemplateColumns` needs `!important` (fixes #3, #4,
  #12) — a plain class rule silently does nothing.
- **A `width: 100%` table inside an `overflow-x: auto` wrapper does not
  scroll** — it shrinks. A `minWidth` larger than the phone viewport is what
  makes the wrapper scroll (fixes #5–#11).
- **A flex item with `flex-1` will not shrink below its content width** unless
  it also has `min-w-0` (fix #13).
- **A JSX comment cannot sit before an element inside a ternary branch** — it
  must be the first child *inside* the element, or the branch fails to parse.
- **A comment inside a `<style>` element's text child is HTML-escaped by
  React**, which causes a hydration mismatch. Use `dangerouslySetInnerHTML`
  with a static literal (fix #3) or `<style jsx>`. **A backtick inside a
  template-literal `<style>` also terminates the literal** — do not put
  backticks in CSS comments (fix #14).
- **A CSS rule that targets a `span` will not match a bare text node.** The
  header's CTA rule looked correct but silently did nothing, because the
  label it targeted was never wrapped in an element (fix #14).
- **Read the DOM, not the screenshot**, when checking Bangla copy — a
  low-resolution glyph (`৭` vs `৪`) is easy to misread. Two "defects" in this
  audit turned out to be misread pixels, not real bugs.
