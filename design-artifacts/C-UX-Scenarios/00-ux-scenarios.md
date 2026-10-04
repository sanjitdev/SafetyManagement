# UX Scenarios — CityFix

2026-09-18 · 4 scenarios · 33 screens

| # | Scenario | Archetype | Screens | Entry |
|---|----------|-----------|--------:|-------|
| 1 | Rahim the Reporter — Reports a broken streetlight | Rahim the Reporter (priority 02 — primary citizen) | 14 | Installs app after seeing it on Facebook; spots broken streetlight on evening commute |
| 2 | Habib the Handler — Runs his ward's morning queue | Habib the Handler (priority 03 — authority dispatcher) | 7 | Opens admin console at shift start on desktop/tablet |
| 3 | Rashid the Resolver — Fixes his first job of the day | Rashid the Resolver (priority 04 — field crew) | 5 | Opens PWA on phone, push notification for new assignment |
| 4 | Aamir the Administrator — Sets up Chattogram | Aamir the Administrator (priority 05 — administrative) | 7 | Opens Admin Console to onboard city #2 |

---

## All screens (design inventory)

### Citizen flow (Rahim) — 14 screens
1. App Open / Splash
2. Welcome (first run only)
3. Registration
4. Verification (OTP)
5. Login (returning users)
6. Home / City Activity
7. Report Flow — Location Confirm
8. Report Flow — Photo Capture
9. Report Flow — Category Pick
10. Report Flow — Note (optional)
11. Report Submitted — Confirmation with Status Trail
12. My Reports Detail
13. City Activity Feed (return visit / power-user)
14. Resolution Notification (push)

### Authority dispatcher flow (Habib) — 7 screens
1. Login (Web / Desktop)
2. Daily Queue Dashboard
3. Ticket Detail
4. Assign to Crew (modal)
5. Monitor / Updates (refreshed dashboard)
6. Resolve Confirmation
7. Ward Performance Snapshot (end of shift)

### Field crew flow (Rashid) — 5 screens (PWA, no native app in v1)
1. Field App Home (My Assignments)
2. Assignment Detail
3. Status — In Progress
4. Resolve — Before/After Capture
5. Confirmation / Mark Resolved

### Administrator flow (Aamir) — 7 screens
1. Admin Console Login
2. Cities Overview / Dashboard
3. City Setup — Basic Info
4. Departments & Categories
5. Wards & Boundaries
6. User Provisioning
7. Post-Launch Adoption Dashboard

---

## Cross-screen inventory notes

- **Login** appears in three scenarios with different surfaces: citizen (mobile, OTP-anchored), dispatcher/admin (web, password + OTP), field crew (mobile, persistent).
- **Map view** appears in three scenarios with different filters: citizen (citywide, pin-based), dispatcher (per-ward queue map), admin (ward-boundary editor).
- **Photo capture** appears in three scenarios with different intents: citizen (before), field crew (after), admin (no capture, but manages photo-storage settings).
- **Status trail / timeline** is the connective tissue across all four scenarios — same data model expressed differently per role.

---

## Architectural implications surfaced

1. **Single responsive web app** for citizens, dispatchers, field crew, and admins — no native apps in v1. PWA install for field crew; admin and dispatch on desktop browsers; citizen on mobile browsers.
2. **Shared data model for tickets**, with role-specific views: citizen sees public + own; dispatcher sees ward queue; field crew sees own assignments; admin sees cross-city analytics.
3. **Configurable per city:** categories, departments, wards, language defaults — managed by Aamir (admin).
4. **Bangla-first, English-secondary** across all screens; toggleable per user account.
5. **Offline behavior limited in v1:** photo capture saves locally and uploads on reconnect for field crew; new assignments cannot be pulled while offline.

---

_Produced by Freya — 2026-09-18_
_Source: All scenario files in C-UX-Scenarios/_
