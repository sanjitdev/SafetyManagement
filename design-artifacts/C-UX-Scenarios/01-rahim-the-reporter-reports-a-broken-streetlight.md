# Rahim the Reporter — Reports a broken streetlight

**Archetype:** Rahim the Reporter (priority 02 — primary citizen)
**Entry:** Rahim sees a broken streetlight on his way home one evening. A friend mentioned CityFix on Facebook. He opens the app store, installs.
**Emotional state on arrival:** Skeptical, tired, slightly annoyed. Half-expects to waste 10 minutes on a form. He has tried official reporting before and gave up.
**Goal:** Restore a small piece of normalcy tonight — file this report, see proof it landed somewhere, get on with his day. (Primary positive driving force: *Restore normal, low-friction daily life.*)

---

## Screens

1. **App Open / Splash**
   Rahim taps the CityFix icon. Brief splash (≤2 sec). Bangla default. App requests location permission and notification permission up-front — single combined prompt.

2. **Welcome (first run only)**
   Short value prop in Bangla: a single sentence on what CityFix is and one CTA — "Register to start." Skip button hidden or labeled "I have an account" (login link). No carousel, no marketing. Rahim taps "Register."

3. **Registration**
   One screen, five fields: **Phone number, NID (National ID), Full Name, Password, Confirm Password.** Clear labels, password mask, inline validation (NID format check, password strength). Single "Submit" button at bottom. On submit: app sends OTP to phone.

4. **Verification (OTP)**
   Six-digit code field. App reads SMS automatically where possible. 60-second resend timer. On success: registration confirmed, app proceeds to home. On failure: clear error in Bangla ("Code didn't match — try again").

5. **Login (returning users)**
   Phone number + password. "Forgot password" link. "Register" link below for new users. Rahim hits this screen on his second visit onward. Quick — under 15 seconds to log in.

6. **Home / City Activity**
   Map view of the city with pins for recent reports (different colors by status: open, in progress, resolved). Above the map: search bar (find reports near me / by category) and a filter row (category icons). Dominant CTA at the bottom: **big orange "Report" button.** Activity feed scrolls below the fold. Bangla. Rahim taps "Report."

7. **Report Flow — Location Confirm**
   Auto-captured GPS pin displayed on a small map. Rahim can drag to adjust if needed. Below the map: detected ward name (auto) and a "Use this location" button. Single tap. No address text entry required.

8. **Report Flow — Photo Capture**
   Camera opens immediately (or photo picker if camera denied). Big shutter button. Below: "Skip — describe instead" link. Rahim snaps the broken streetlight.

9. **Report Flow — Category Pick**
   Tile grid: Streetlight, Road / Pothole, Garbage / Waste, Drain / Waterlogging, Sanitation / Stray Dogs, Other. Bangla labels with small icon. Rahim taps "Streetlight."

10. **Report Flow — Note (optional)**
    Single free-text field, 200-character limit. Default-empty. "Add a note" placeholder. Below: "Submit" button. Rahim leaves it empty and taps Submit.

11. **Report Submitted — Confirmation with Status Trail**
    Confirmation screen. Citizen photo and category echoed back. Below: **a status trail with the first entry already visible — "Submitted — routed to Ward 14, Electrical Department"** (auto-routed). Time stamp. A "View all my reports" link. Quiet, no confetti.

12. **My Reports Detail**
    Rahim taps "View all my reports" or opens the "My Reports" tab. He sees his report at the top. Tap → detail view with full timeline (Submitted → Routed → In progress → Resolved — the last two empty for now, waiting). Photo + map pin + category. A "Why hasn't this been fixed yet?" link visible only after 7+ days of "routed" status.

13. **City Activity Feed (return visit)**
    On Rahim's next open of the app, the home screen shows updated activity. He scrolls the feed, sees other citizens reporting, sees Rashid's crew marked "In progress" on a streetlight two streets away. Tap a pin → ticket detail (public view). This is the *power-user* loop — Rahim comes back, watches the city move, trusts the platform.

14. **Resolution Notification (push)**
    Days later, when Habib marks Rahim's report resolved with an after-photo, Rahim receives a push notification: "Your streetlight report — fixed. Tap to view." Opens directly to detail with **before/after photo pair** and a "Was this helpful?" feedback prompt.

✓ **Success state:** Rahim has reported a broken streetlight, watched it move through the queue, and seen it resolved with proof. He has experienced being heard and seeing motion. His next report — and his 10+ daily opens — are now habitual.

---

_Produced by Freya — 2026-09-18_
_Source: Workshop with Saga, 02-persona-rahim-the-reporter.md, product-brief.md, 00-trigger-map.md_
