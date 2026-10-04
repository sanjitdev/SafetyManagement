# Work Order — WO-000 Platform Foundation

**Created:** 2026-10-04
**Author:** Freya (from approved Phase 2/3/4 artifacts)
**Status:** Ready for PRD
**Priority:** Critical (gating — every persona Work Order depends on this)

---

## Objective

Build the cross-cutting platform layer that every persona Work Order sits on top of: shared data model, authentication, per-city configuration, dedup engine, status trail, push notifications, and audit log. No user-facing persona flow can be built before this is in place.

This Work Order deliberately covers **no UI**. It produces APIs, data models, and platform services that the persona WOs consume.

---

## Why This Matters

From the Product Brief and Feature Impact Analysis:

- CityFix's make-or-break constraint is that the platform has **visibility but no enforcement power**. Authority onboarding is the gating factor. The platform layer is what makes every authority and citizen action trustworthy and reversible.
- 22 high-priority features were scored against the four personas. **9 of them (#2, #3, #5, #6, #10, #11, #16, #22 — plus the dedup/audit/polling foundations) cannot exist without this platform layer.**
- Without dedup, the trust loop fails — five citizens reporting the same pothole produces five tickets and Habib drowns (Feature #3, FIA score 24, the highest in the project).
- Without per-city configuration, Aamir rebuilds the platform for every city (Feature #11, FIA 15).
- Without the audit log, Aamir cannot defend setup decisions when incidents happen (Feature #22, FIA 12).

---

## Scope

### In scope

1. **Data model** — shared entities, single ticket schema used by all roles
2. **Authentication & roles** — registration, OTP, login, WebAuthn for admins
3. **Per-city configuration** — categories, departments, wards, language defaults; Dhaka template
4. **Dedup engine** — raw reports collapse to one ticket per physical problem
5. **Status trail** — submitted → routed → in progress → resolved, with timestamps
6. **Push notifications** — wired but unconsumed by UI (consumed in WO-001 and WO-002)
7. **Audit log** — every ticket transition + every config change recorded with actor, before/after, timestamp
8. **Polling infrastructure** — 10–30s interval polling (WebSocket deferred to v1.1)
9. **Bangla-first i18n framework** — per-user toggle, per-city default

### Out of scope (handled in persona WOs)

- Any UI page (no mockup-driven work here)
- Map rendering, photo capture, file storage UX
- Dispatcher queue, citizen home, field crew, admin console pages

---

## Specs & Scenarios Affected

**Scenarios:** All four (`01-rahim-the-reporter`, `02-habib-the-handler`, `03-rashid-the-resolver`, `04-aamir-the-administrator`) — but only their **non-UI** portions.

**Specs referenced (for behavior contracts, not visual):**
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.3-registration/1.3-registration.md` — registration fields (phone, NID, name, password)
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.4-verification-otp/1.4-verification-otp.md` — OTP verification contract
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.11-report-submitted-confirmation/1.11-report-submitted-confirmation.md` — status trail visibility contract
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.6-resolve-confirmation/2.6-resolve-confirmation.md` — status transitions
- `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver/3.3-status-in-progress/3.3-status-in-progress.md` — status enum
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.6-user-provisioning/4.6-user-provisioning.md` — role definitions, WebAuthn policy
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.4-departments-categories/4.4-departments-categories.md` — per-city config schema

**Strategic inputs:**
- `design-artifacts/A-Product-Brief/01-product-brief.md` — vision, business customers, three-population model
- `design-artifacts/A-Product-Brief/02-content-language.md` — Bangla-first language strategy
- `design-artifacts/B-Trigger-Map/06-feature-impact.md` — Features #2, #3, #5, #6, #10, #11, #16, #22

---

## Dependencies

**This WO is the root of the dependency tree.** No persona Work Order can start before this is complete.

| Downstream WO | What it consumes from WO-000 |
|---|---|
| WO-001 Citizen | Auth (citizen role), status trail, push notifications, dedup, audit log, i18n |
| WO-002 Dispatcher | Auth (dispatcher role), ticket schema, audit log, status transitions |
| WO-003 Field crew | Auth (crew role), status trail, offline queue contract |
| WO-004 Admin | Per-city config, WebAuthn, role provisioning |

---

## Acceptance Criteria

Verifiable criteria Mimir must satisfy before this WO is marked done.

### Data model (PLAT-REQ-001)

- [ ] Single `Ticket` entity shared by all roles, with explicit fields: id, city_id, category_id, ward_id, reporter_id, assigned_crew_id, status (enum), photo_urls (array, ordered), location (lat/lng + reverse-geocoded label), note, created_at, status_trail (array of {status, actor_id, timestamp, note?})
- [ ] Status enum: `submitted` → `routed` → `in_progress` → `resolved`. Closed/cancelled is terminal.
- [ ] Ticket schema enforces `internal_only` fields hidden from citizen queries (assigned_crew_id, internal notes, before-photo URLs from Rashid's perspective)
- [ ] Per-city config entities: City, Ward (with polygon), Category, Department, Language

### Authentication & roles (PLAT-REQ-002)

- [ ] Four roles enforced: `citizen`, `dispatcher`, `crew`, `admin`. No custom-role builder in v1.
- [ ] Citizen registration: phone (unique, validated), NID (validated), name, password (min-length policy), OTP verification step
- [ ] OTP: SMS-based, time-limited (≤ 5 min), single-use, retry-cap policy documented
- [ ] WebAuthn mandatory for any admin write action; optional for dispatcher and crew in v1
- [ ] Dispatcher and crew sessions bind to a specific (city, ward, department) — they cannot see tickets outside their scope

### Per-city configuration (PLAT-REQ-003)

- [ ] `City` is a first-class entity. Every ticket, user, category, and ward belongs to a city.
- [ ] Dhaka template pre-populates categories, departments, ward template, language defaults on city creation (handled in WO-004 admin UI)
- [ ] Language default per city; per-user override allowed
- [ ] Ward polygons stored as GeoJSON; consumed by all map surfaces

### Dedup engine (PLAT-REQ-004)

- [ ] When a new report is submitted within X meters of an existing open ticket of the same category, the API returns the existing ticket and a `dedup_match: true` flag instead of creating a duplicate
- [ ] Dedup radius and category-match logic are configurable per city (Aamir sets in WO-004)
- [ ] Dedup is a **prompt**, not an auto-merge (Feature #3, design rationale): citizen sees "Looks similar to an existing report — link to it instead?" and decides
- [ ] Internal: every dedup attempt is logged (actor, both ticket IDs, distance, category, accepted/rejected)

### Status trail (PLAT-REQ-005)

- [ ] Every status transition records {from_status, to_status, actor_id, timestamp, optional note} on the ticket
- [ ] Citizen query returns trail with internal actors anonymized (e.g., "City corporation" not a specific dispatcher name)
- [ ] Status transitions are atomic — no partial writes

### Push notifications (PLAT-REQ-006)

- [ ] Notification subscription is per-citizen, per-their-own-tickets only (privacy)
- [ ] Triggered on every transition that affects a citizen's own ticket
- [ ] Subscribed at splash (Feature #3 context: deferral rationale). Notification opt-in endpoint exists; UI consumption lives in WO-001
- [ ] Delivery guarantees documented: at-least-once with idempotency token

### Audit log (PLAT-REQ-007)

- [ ] Every ticket transition and every per-city config change is written to an append-only audit log
- [ ] Audit records: {entity_type, entity_id, action, actor_id, before_value (jsonb), after_value (jsonb), timestamp}
- [ ] Audit log is queryable by entity and by actor; not user-deletable
- [ ] Lives inside the same system as the data; no separate service in v1

### Polling infrastructure (PLAT-REQ-008)

- [ ] Ticket status endpoint returns `{ticket, trail, last_poll_cursor}`
- [ ] Clients poll every 10–30s; WebSocket deferred to v1.1
- [ ] Polling rate-limited per actor and per ticket

### i18n framework (PLAT-REQ-009)

- [ ] All user-facing strings live in a translation key registry
- [ ] Per-user language preference stored on the user; falls back to city default
- [ ] Bangla is the default for the Dhaka city; English secondary

---

## Do Not Change

- The four-role model. Custom-role builder is **explicitly deprioritized** per Feature #18 gap analysis.
- WebAuthn-only-for-admin-writes policy. Any relaxation needs Saga re-review.
- The Dhaka-template-as-pre-population pattern. Goal 3 (operate leanly across cities) depends on it.
- Auto-merge on dedup. Dedup must remain a **prompt** to preserve citizen agency (Feature #3 design rationale).
- Internal-fields-hidden-from-citizens boundary. Any field an admin or dispatcher adds that shouldn't be citizen-visible must default to `internal_only: true`.

---

## Reference Files

**Spec files (read for behavior contracts):**
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.3-registration/1.3-registration.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.4-verification-otp/1.4-verification-otp.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.11-report-submitted-confirmation/1.11-report-submitted-confirmation.md`
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.6-resolve-confirmation/2.6-resolve-confirmation.md`
- `design-artifacts/C-UX-Scenarios/03-rashid-the-resolver/3.3-status-in-progress/3.3-status-in-progress.md`
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.6-user-provisioning/4.6-user-provisioning.md`
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.4-departments-categories/4.4-departments-categories.md`

**Strategy files:**
- `design-artifacts/A-Product-Brief/01-product-brief.md`
- `design-artifacts/A-Product-Brief/02-content-language.md`
- `design-artifacts/B-Trigger-Map/06-feature-impact.md` — Features #2, #3, #5, #6, #10, #11, #16, #22

**Design system:**
- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` (color, type, motion — applies to error states)

---

## Open Questions for Mimir

1. **OTP provider.** SMS gateway for Bangladesh is a deployment concern. Does this WO include choosing a provider, or does Aamir (admin) configure it in WO-004? Recommendation: stubbed in WO-000 with provider abstraction; provider chosen in WO-004.
2. **Photo storage.** S3-compatible blob storage or local filesystem for v1? Recommendation: blob storage with local-filesystem fallback for dev.
3. **Dedup radius default.** Feature #3 says "tight radius" — propose 50m for v1, configurable per city. Confirm before locking.
4. **WebAuthn library choice.** `@simplewebauthn/server` is the de-facto Node option; confirm before committing.

---

## Next

Run `/mimir` with this Work Order. Mimir will write `000-PRD.md` (master) + `000-platform-foundation.xml` (feature PRD), then build platform requirements one at a time with browser verification. Persona WOs (001–004) become unblocked once WO-000's PRD is signed off.