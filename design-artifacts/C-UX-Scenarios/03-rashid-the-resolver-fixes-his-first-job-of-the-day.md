# Rashid the Resolver — Fixes his first job of the day

**Archetype:** Rashid the Resolver (priority 04 — tertiary, field crew)
**Entry:** Rashid opens the CityFix web app (PWA, installed from browser on his Android phone) at 7:30 AM in the field crew parking area. Push notification: "New assignment — Streetlight, Ward 14." (Already authenticated from yesterday.)
**Emotional state on arrival:** Practical, slightly unmoved. He's used plenty of apps. He'll use this if it makes his day shorter.
**Goal:** Drive to the ticket, fix it, mark resolved with after-photo, get on with the day. (Primary positive driving force: *Get the next job with all the right info* — photo + map upfront, no phone calls, no vague descriptions.)

---

## Screens

> **Platform note:** Rashid uses the same responsive web app as citizens and dispatchers. There is no native Android app in v1. The web app is installed as a PWA (added to home screen) so it launches full-screen. All flows assume browser-based access on an Android phone with 3G / patchy signal.

1. **Field App Home (My Assignments)**
   Top of screen: offline indicator — "All updates synced" by default; "3 updates queued — tap to retry" if recent sync failed. Below: list of Rashid's assigned tickets, newest at top. Each row: category icon, ward + age label, status pill. Bangla. Rashid taps the new streetlight ticket.

2. **Assignment Detail**
   Header: citizen's "before" photo (full screen width, big). Below: category icon + label, ward + submitted-at timestamp, citizen note (if any). Map pin (tap → opens default maps app for navigation — Google Maps / OsmAnd). Bottom-fixed action bar: **"On site"** button. Big, single tap.

3. **Status — In Progress**
   Once Rashid taps "On site," the action bar updates: **"Mark in progress"** button, with an elapsed-time counter ("00:14 on site"). Tap → ticket moves to "In progress" status in the queue. Habib's dashboard refreshes in near-real-time.

4. **Resolve — Before/After Capture**
   Bottom bar now shows: **"Mark resolved"** button. Tap → camera opens (browser permission prompt the first time; remembered thereafter). First shutter for the after-photo. Preview appears beside the citizen's before-photo, side-by-side. Optional small text field for a one-line note ("replaced bulb + checked wiring"). Below: **"Submit resolution"** button. If network is poor, the photo saves locally first and uploads when signal returns — visible status "Saved locally — will sync" appears under the button.

5. **Confirmation / Mark Resolved**
   Confirmation screen: photo pair (before / after), category, ward, time-to-resolve total. "Submit" button. On submit: confirmation toast "Resolved — citizen notified." Auto-redirects to home. The offline indicator updates if needed. Rashid is back to his list, ready for the next job.

✓ **Success state:** Rashid has driven to a clear address, fixed a real problem, captured proof, and submitted in under five minutes from "On site" to "Resolved." The citizen has been notified with the after-photo. Habib's queue is one smaller.

---

### Operational notes for v1

- **No native push notifications** in v1. Web push is flaky on Android browsers in Bangladesh; fallback is SMS for new assignments (with a one-tap deep link into the app) plus in-app refresh on home-screen open.
- **Camera access** requires HTTPS and a one-time browser permission grant.
- **Map navigation** is delegated to the device's default maps app via deep link.
- **Offline support** is partial in v1: photo capture saves locally and uploads on reconnect, but new assignments cannot be pulled while offline. Stretch goal for v2: Service Worker PWA with background sync.
- **PWA install prompt** should appear on first successful login for field-crew accounts, since these users benefit most from the full-screen app-feel.

---

_Produced by Freya — 2026-09-18_
_Source: 04-persona-rashid-the-resolver.md, product-brief.md, 00-trigger-map.md_
