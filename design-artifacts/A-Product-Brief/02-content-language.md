# Content & Language — CityFix

## Brand Personality

If CityFix were a person at a dinner party, they would be:

- **Confident and assured** — they know what they are doing; they don't oversell or hedge.
- **Empathetic** — they care about the people in front of them and the city they live in.
- **Civic-minded and quietly idealistic** — always talking about the goodness the world can hold, the city that can be.

CityFix is not a tech startup, not a stern government notice, not a marketing campaign. The personality is the **trusted neighbor who works at the city corporation and genuinely cares**. Confident in their ability to make things happen, warm enough that you trust them with your complaint, but not chatty — they don't oversell.

## Tone of Voice

**Reference brand:** Apple.

Calm confidence. Assumes the better thing is coming. Doesn't apologize. Doesn't oversell. Doesn't lecture.

### Voice dimensions

- **Calm and confident.** "Report submitted. We're routing it to the right team." — not "Hooray! 🎉 Your complaint is in!"
- **Plain, not flowery.** Short sentences. Everyday words. No marketing fluff.
- **Respectful of the citizen.** Assumes they are capable. Does not condescend.
- **Quietly aspirational.** Implies the city getting better without grand speeches.
- **Earned emotion.** No exclamation points unless something is actually fixed.
- **Deep.** A voice that aims to make the user better — citizens more engaged, authorities more accountable — without sounding motivational-poster.
- **Targeted.** Speaks to the user with intent, not at them.

### In Bangla

The same register must hold in translation. Avoid the two failure modes:

- **Formal-stiff** — "জনাব, আপনার অভিযোগ গৃহীত হয়েছে।" (Sir, your complaint has been received.) Feels like a form letter, not a confident voice.
- **Chatty-excited** — "ধুর, পাঠাও, ঠিক হয়ে যাবে!" (Oh come on, just submit it, it'll be fine!) Feels like a friend dismissing the seriousness.

The right Bangla register is **clear, capable, human.** Short sentences. Direct verbs. No bureaucratic honorifics unless the form genuinely requires one. The citizen should feel that the system is *capable*, not *gracious*.

## Language Strategy

**Bangla-first.** **English-secondary.** No third language on the v1 roadmap.

### Implications

- **Default UI:** Bangla across all citizen and authority screens. English toggle available everywhere.
- **Notifications (SMS / push):** Bangla primary. English only when the recipient has explicitly chosen it in settings.
- **Tone in translation:** The Apple-like register must hold in Bangla — short, direct, confident, not stiff, not chatty. Translation quality is a feature, not a final step.
- **Future expansion (Chattogram, Sylhet, beyond):** Bangla continues to serve all of them — no new language work needed for v2.
- **No third language on the roadmap.** If Sylhet's English-speaking minority or Chattogram's tribal-language speakers come up later, that's a future-city decision, not a v1 priority.

## SEO Keywords

CityFix's SEO is **atypical** — it is a civic platform, not a marketing site. Citizens do not search for "pothole reporting app"; they encounter the platform through city corporation communications, ward commissioners, and social campaigns. SEO is therefore primarily about **discoverability for press, government docs, and partner pages**, with secondary emphasis on organic discovery for citizens who learn the platform exists and want to learn more or download it.

### Headline keyword theme

- **Bangla (primary):** "সমস্যা রিপোর্ট / অভিযোগ জানানো" (report a problem / file a complaint)
- **English (secondary):** "report city problem"

### Citizen search queries — Bangla

- সমস্যা রিপোর্ট (report a problem)
- অভিযোগ জানানো (file a complaint)
- ঢাকায় রাস্তার সমস্যা রিপোর্ট (report road problem in Dhaka)
- ভাঙা রাস্তা অভিযোগ (broken road complaint)
- ঢাকা উত্তর সিটি কর্পোরেশন অভিযোগ (Dhaka North City Corporation complaint)
- ঢাকা দক্ষিণ সিটি কর্পোরেশন অভিযোগ (Dhaka South City Corporation complaint)

### Citizen search queries — English

- report pothole Dhaka
- Dhaka city complaint
- broken streetlight report Bangladesh
- Dhaka North City Corporation complaint
- Dhaka South City Corporation complaint

### Authority / partner queries

- civic issue reporting platform Bangladesh
- Dhaka ward complaint system
- municipal issue tracking software Bangladesh
- smart city complaint app Bangladesh

### URL strategy

- **Bangla slugs preferred** where transliteration is unambiguous (e.g., `/somossha-jananо`, `/raddhe-অভিযোগ`). ASCII-fallback English (`/report`) where transliteration is awkward or ambiguous. Exact slug decisions deferred to Freya's design phase; this brief establishes the intent, not the implementation.
- **Subdirectory structure for languages:** `/` = primary (Bangla); `/en/` = secondary (English). Each version has its own canonical URL; `x-default` points to the Bangla primary.
- **Authority-facing URLs** can be English-only if the deployment is decided to be English-internal-only at the authority tier — to be confirmed with the operating city corporation.

### Structured data plan

Civic platforms have limited schema.org fits but a few apply:

- `Organization` — for the official CityFix entity and per-city deployment pages.
- `WebSite` + `SearchAction` (Bangla + English) — if a citizen-facing search experience exists.
- `FAQPage` — for any "how does CityFix work?" pages aimed at citizens.
- No `LocalBusiness` schema (CityFix is not itself a local business; the operating authority is, and that is a separate page on the city corporation's site).

### Search intent the brief targets

- **Problem-aware:** someone sees a problem and wants to report it → matched with category landing pages in Bangla.
- **Solution-aware:** someone has heard of CityFix and wants to find it → matched with brand name plus city name.
- **Authority-aware:** press / partners searching for the platform's existence → matched with `Organization`, partner pages, and press releases.

## Content Structure

CityFix serves three audiences with different content needs. v1 ships content for all three.

### Citizen-facing content areas

- **My reports.** Status of every report the citizen has submitted, with timeline and current state.
- **City activity feed.** What others are reporting + what is being fixed, right now. Builds trust through visible citywide motion.
- **Map view.** Every report as a pin, filterable by category, status, area. The default lens for many citizens.
- **Fix visibility.** Who is fixing what, how long it took, before/after photos. The single most trust-building surface in the product.
- **Transparency layer.** What is delayed, why it is delayed, which department owns it, when expected. Closes the loop without making promises.
- **Authority profiles.** Which department / ward owns which issue categories. Helps citizens reason about responsibility without having to look it up.
- **Notifications / status updates.** Personalized to the citizen's own reports.
- **Help / about / how it works.** Onboarding and trust material for first-time users.
- **Reviews / feedback on resolved reports.** Citizen feedback on the actual fix (a follow-up rating and optional comment per closed report).

### Authority-dispatcher content areas

- **My queue.** Tickets routed to me / my department / my ward, filterable by status, age, category, priority.
- **Ticket detail.** Citizen photo, location, description, history, full status timeline, internal notes.
- **Assignment + dispatch.** Assign to field crew, mark in-progress, mark resolved with an after-photo.
- **Map view (authority).** Tickets as pins, density by area, aging heatmap, ward overlays.
- **Performance dashboard.** Queue size, aging tickets, resolution rate, SLA breaches by category.

### Authority-admin content areas

- **Department / ward configuration.** Categories, responsible departments, jurisdictional boundaries per city.
- **User management.** Dispatcher accounts, role assignments, password and access policies.
- **City-level analytics.** Top issues, top areas, department performance over time.
- **Audit log / reports.** For transparency and internal accountability.

### Navigation principles

- **The most-used action is always one tap away.** For citizens: "Report a problem" is the primary CTA from every screen. For dispatchers: "My queue" is the home screen.
- **Mobile-first.** Citizens and field crews are mobile. Authority dispatchers are desktop / tablet. The product must work on a phone on a 3G connection without compromise.
- **City activity is discoverable from anywhere.** For citizens, the feed and map views should be reachable in two taps from any screen — they are the second-priority actions after "report."
- **No nested menus deeper than two levels** for citizen-facing navigation. Deep hierarchies signal bureaucracy.
- **No marketing-style mega-menus.** A civic platform is not a shopping site.

### Scope boundaries (v1)

- **No blog / editorial content.** CityFix is not a content publisher; press is handled by the city corporation separately.
- **No e-commerce / payment.** This is not a commerce platform.
- **No community discussion forums.** Conversation about issues lives in the platform's public ticket views, not in a separate comment space.
- **No public profile pages for individual citizens.** Reports are pseudonymous at most.
- **No voting / upvoting features.** Civic prioritization is an authority function, not a citizen vote.
