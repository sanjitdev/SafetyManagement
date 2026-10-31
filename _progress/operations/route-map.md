# CityFix — Route Map

> Reference doc — every page and API endpoint in the CityFix app,
> grouped by audience, with the entry point for each.

**Base URL**: `http://localhost:3000` (dev) or the Vercel host (prod,
currently `cityfix-bd.vercel.app`). The most recent dev:feat build
runs on `http://localhost:3200`.

---

## Public (no auth)

| URL | File | How to get there |
|---|---|---|
| `/` | `app/page.tsx` | Direct URL, or the "Back" link from any error state. The public landing for return visitors. |
| `/splash` | `app/splash/page.tsx` | Direct URL, or the brand link in the header. Routes to `/` or `/home` after 1.5s depending on auth state. |
| `/feed` | `app/feed/page.tsx` | Direct URL. The public city activity feed (no citizen identity required). |
| `/login` | `app/login/page.tsx` | Direct URL, or the "Sign in" CTA from `/`, or auto-redirect via `/login?next=<path>`. |
| `/register` | `app/register/page.tsx` | Direct URL, or the "Create account" link from `/login`. |
| `/verify-otp` | `app/verify-otp/page.tsx` | Auto-redirect from `/register` after phone+NID submission, or direct URL. |
| `/report/category` | `app/report/(create)/category/page.tsx` | The "Report an issue" CTA from `/` or `/home`. First step of the citizen submit flow. |
| `/report/location` | `app/report/(create)/location/page.tsx` | Step 2 of submit. Reached after category is picked. |
| `/report/photo` | `app/report/(create)/photo/page.tsx` | Step 3 of submit. Reached after location pin is set. |
| `/report/note` | `app/report/(create)/note/page.tsx` | Step 4 of submit. Reached after at least one photo is uploaded. |
| `/report/summary` | `app/report/(create)/summary/page.tsx` | Step 5 of submit. The review-before-confirm screen. |
| `/report/[id]/submitted` | `app/report/[id]/submitted/page.tsx` | Auto-redirect after a successful submit. The "thanks, ticket #abc" confirmation. |

---

## Citizen (signed in, `role: citizen`)

| URL | File | How to get there |
|---|---|---|
| `/home` | `app/home/page.tsx` | Auto-redirect from splash when authed. The citizen home with their tickets + the city activity side panel. |
| `/reports` | `app/reports/page.tsx` | The "My reports" link in the home top bar. Lists tickets where `reporterId === userId`. |
| `/reports/[id]` | `app/reports/[id]/page.tsx` | Click any row in `/home` or `/reports`. The full report view: status pill, full trail, after-photo, feel-heard feedback, delete. |

---

## Dispatcher (signed in, `role: dispatcher`, scoped to a ward)

| URL | File | How to get there |
|---|---|---|
| `/dispatcher` | `app/dispatcher/page.tsx` | Auto-redirect from `/api/dev/login?role=dispatcher`. The triage queue (list of in-scope tickets). |
| `/dispatcher/tickets/[id]` | `app/dispatcher/tickets/[id]/page.tsx` | Click any row in `/dispatcher` (queue) or the pin label on the map. The full ticket view with the crew-picker + transition buttons. |
| `/dispatcher/dedup` | `app/dispatcher/dedup/page.tsx` | The "Dedup flags" CTA from `/dispatcher`. Shows the duplicate-review queue surfaced by the post-pin policy. |
| `/dispatcher/map` | `app/dispatcher/map/page.tsx` | The "Map view" CTA from `/dispatcher`. MapLibre canvas with status-colored pins, click → side panel → "View ticket" link. |

Dedup-flag resolve is server-only (not a page):

- `POST /api/v1/dispatcher/dedup-flags/[id]/confirm`
- `POST /api/v1/dispatcher/dedup-flags/[id]/dismiss`

---

## Crew (signed in, `role: crew`)

| URL | File | How to get there |
|---|---|---|
| `/crew` | `app/crew/page.tsx` | Auto-redirect from `/api/dev/login?role=crew`. Today's assignments list. |
| `/crew/tickets/[id]` | `app/crew/tickets/[id]/page.tsx` | Click any row in `/crew`. The full ticket view with status-transition buttons + the after-photo uploader (file picker + URL override). |

---

## Admin (signed in, `role: admin`)

| URL | File | How to get there |
|---|---|---|
| `/admin` | `app/admin/page.tsx` | The admin console — the admin's home surface (`ROLE_HOME.admin`). A card grid over every admin surface plus the live-city drill-downs. |
| `/admin/cities` | `app/admin/cities/page.tsx` | From `/admin` → "Cities" card. The list of cities the admin can manage. |
| `/admin/cities/[id]/setup` | `app/admin/cities/[id]/setup/page.tsx` | From `/admin/cities` → click a city → "Setup" tab. Also reachable from the `/admin` city strip. |
| `/admin/cities/[id]/wards` | `app/admin/cities/[id]/wards/page.tsx` | Same city page → "Wards" tab. |
| `/admin/cities/[id]/taxonomy` | `app/admin/cities/[id]/taxonomy/page.tsx` | Same city page → "Taxonomy" tab. |
| `/admin/tickets` | `app/admin/tickets/page.tsx` | From `/admin` → "Reports" card. Cross-city ticket list. |
| `/admin/tickets/[id]` | `app/admin/tickets/[id]/page.tsx` | Click any row in `/admin/tickets`. The admin read-only ticket view. |
| `/admin/audit` | `app/admin/audit/page.tsx` | From `/admin` → "Audit log" card. Read-only stream of every `AuditEntry`. |

---

## Dev tooling (gated by `CITYFIX_DEV_PROMOTE_SECRET`)

| URL | File | How to get there |
|---|---|---|
| `/dev/login?secret=<X>&next=/reports` | `app/dev/login/page.tsx` | Bookmark the URL with the secret pre-filled. One click mints a session and redirects. |
| `POST /api/dev/issue-session` | `app/api/dev/issue-session/route.ts` | Direct API call from `curl` or from `/dev/login`. Body: `{ userId }`. |
| `POST /api/dev/list-users` | `app/api/dev/list-users/route.ts` | Used by `/dev/login` to populate the `<select>`. |
| `POST /api/dev/login?role=citizen\|dispatcher\|crew\|admin` | `app/api/dev/login/route.ts` | Dev-mode-only. Mints a session for the named persona. 303-redirects to that role's home. Returns 404 when `CITYFIX_DEV_STORE` is unset (i.e. on the Vercel build). |
| `POST /api/dev/bootstrap-admin` | `app/api/dev/bootstrap-admin/route.ts` | Production-only. Promotes a phone-keyed user to admin and mints a session, in one call. |
| `POST /api/dev/promote-admin` | `app/api/dev/promote-admin/route.ts` | Production-only. Promotes the current session's user to admin (one-shot bootstrap). |
| `POST /api/dev/reset` | `app/api/dev/reset/route.ts` | Dev-mode-only. Wipes the in-memory dev store and re-seeds it. |

---

## API surface (no pages, JSON only)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/status` | GET | — | Current session state (`authenticated`, role, name). |
| `/api/auth/logout` | POST | session | Clear `cityfix_session` cookie. |
| `/api/auth/webauthn/{register,assertion,login,revoke}` | POST | varies | WebAuthn flow (admin-only writes). |
| `/api/auth/webauthn/register/challenge` | POST | admin | **New 2026-10-31.** Issues the *registration* challenge (`{ challengeId, options }`) for the admin security-key enrolment. Before this route existed there was no way to reach `issueChallenge(userId, 'registration')`, so the admin's WebAuthn ceremony was unreachable dead code and every admin write answered `401 webauthn_required`. |
| `/api/v1/auth/{register,send-otp,verify-otp,login}` | POST | — | The real citizen auth path (WO-004 surface; OTP provider may be stubbed in dev). |
| `/api/report/bootstrap` | GET | citizen | Returns `{ city, categories, ward }` for the citizen's own city. |
| `/api/tickets` | POST | citizen | Create a ticket. |
| `/api/tickets/[id]` | GET | session | Fetch a ticket (role-scoped). |
| `/api/tickets/[id]/transition` | POST | session | State transition (role-gated). |
| `/api/tickets/[id]/photos/[idx]` | DELETE | session | Delete a photo by index. |
| `/api/v1/activity` | GET | citizen | City's tickets feed, paginated. |
| `/api/v1/activity/public` | GET | — | Public city activity (the `/feed` page's data source). |
| `/api/v1/dispatcher/queue` | GET | dispatcher | The triage queue. |
| `/api/v1/dispatcher/tickets/[id]` | GET | dispatcher | Ticket detail (dispatcher scope). |
| `/api/v1/dispatcher/tickets/[id]/transition` | POST | dispatcher | Submit → Routed transition. |
| `/api/v1/dispatcher/tickets/[id]/assign-crew` | POST | dispatcher | Bolt 007-002: pick a crew for a routed ticket. |
| `/api/v1/dispatcher/map/tickets` | GET | dispatcher | Map pins feed. |
| `/api/v1/dispatcher/crew-for-ward` | GET | dispatcher | The crew picker dropdown. |
| `/api/v1/dispatcher/dedup-flags` | GET | dispatcher | Dedup-review queue. |
| `/api/v1/crew/tickets` | GET | crew | Crew's assigned-tickets feed (today's list). |
| `/api/v1/crew/tickets/[id]` | GET | crew | Crew ticket detail. |
| `/api/v1/crew/tickets/[id]/transition` | POST | crew | Routed → In progress, In progress → Resolved transitions. |
| `/api/v1/crew/tickets/[id]/photos` | POST | crew | Bolt 008-003: upload after-photo (file branch reads via FileReader, URL branch is the `<details>` override). |
| `/api/v1/admin/cities[/{id}[/{categories|categories/{id}|departments|departments/{id}|wards|wards/{id}]]]` | GET/POST/PUT/DELETE | admin | City/ward/dept/category CRUD. |
| `/api/v1/admin/tickets[/{id}]` | GET | admin | Cross-city ticket view. |
| `/api/v1/admin/audit` | GET | admin | Audit log feed. |
| `/api/v1/push/subscribe` | POST | citizen | Web Push subscription. |

---

## Quick navigation cheat-sheet

- **New citizen, full flow**: `/splash` → `/home` → `/report/category` → `/report/location` → `/report/photo` → `/report/note` → `/report/summary` → `/report/[id]/submitted` → back to `/home` → click the new row → `/reports/[id]`
- **Dispatcher workflow**: `/dispatcher` → click a row → `/dispatcher/tickets/[id]` → pick a crew → click **Route** → ticket status becomes `routed`
- **Crew workflow**: `/crew` → click a row → `/crew/tickets/[id]` → click **In progress** → upload after-photo → type a resolution note → click **Resolved**
- **Admin on Vercel**: `/dev/login?secret=…&next=/admin` → the console cards → click a city → tabs for `setup` / `wards` / `taxonomy` → `/admin/tickets` for the read-only cross-city feed → `/admin/audit` for the audit log
- **Production citizen on Vercel, the team needs to look at the data without sending the citizen an OTP**: `/dev/login?secret=…&next=/reports` (one click, redirects to a citizen session for whoever you pick from the dropdown)
