/**
 * i18n framework (lib/i18n/keys.ts).
 *
 * PLAT-REQ-009: typed translation key registry. Bangla-first default;
 * English secondary; per-user override → city default → English fallback.
 *
 * v1 implementation: a flat string-keyed map per language. The keys here
 * are the canonical Bangla strings the mockups already render (mockups
 * 01–07 all use real Bangla). English translations are minimal in v1 —
 * just the surface copy the API needs to serialize.
 */

export type Language = 'bn' | 'en';

export const SUPPORTED_LANGUAGES: Language[] = ['bn', 'en'];

export const DEFAULT_LANGUAGE: Language = 'bn';

/**
 * Translation key registry.
 *
 * Each key has a Bangla value (canonical) and an English value (fallback).
 * Add a new key here when a spec references a string — never hard-code.
 */
export const TRANSLATIONS: Record<string, Record<Language, string>> = {
  // WO-001 1.1 Splash
  'splash.tagline': {
    bn: 'আপনার শহরের আওয়াজ',
    en: 'Voice of your city',
  },
  'splash.loading': { bn: 'লোড হচ্ছে…', en: 'Loading…' },
  'splash.permission.location.title': {
    bn: 'আপনার কাছাকাছি রিপোর্ট দেখাতে অবস্থান প্রয়োজন',
    en: 'We use your location to show reports near you',
  },
  'splash.error.bundle_failed': {
    bn: 'সংযোগ ব্যর্থ — আবার চেষ্টা করুন',
    en: 'Connection failed — try again',
  },
  'splash.retry': { bn: 'আবার চেষ্টা করুন', en: 'Retry' },

  // WO-001 1.2 Welcome / mockup 01 — the /welcome route was
  // collapsed into / in v1.1; the only surviving key is the
  // language toggle (still used by PublicLandingExperience).
  'welcome.lang.toggle': { bn: 'EN', en: 'বাংলা' },

  // v1.1 launch-polish — public landing (anonymous) at `/`
  'public.hero.eyebrow': {
    bn: 'আপনার শহর, আপনার কণ্ঠস্বর',
    en: 'Your city, your voice',
  },
  'public.hero.headline': {
    bn: 'শহরের সমস্যা<br/>রিপোর্ট করুন।',
    en: 'Report what you see.<br/>See it fixed.',
  },
  'public.hero.subhead': {
    bn: 'ভাঙা রাস্তার আলো, ড্রেনে আটকে থাকা পানি, জমে থাকা আবর্জনা — মানচিত্রে দেখুন, রিপোর্ট করুন, সমাধানের প্রমাণ পান।',
    en: 'Broken streetlights, blocked drains, piled garbage — see them on the map, report them in a minute, and watch the city respond.',
  },
  'public.cta.report': {
    bn: 'রিপোর্ট করুন',
    en: 'Report what you see',
  },
  'public.cta.report.hint': {
    bn: 'রিপোর্ট করতে ১ মিনিট লাগে — ফোন নম্বর লাগে না',
    en: 'Takes 1 minute. No account required to start.',
  },
  'public.cta.register': { bn: 'নিবন্ধন', en: 'Register' },
  'public.cta.login': { bn: 'লগ ইন', en: 'Log in' },
  'public.feed.title': {
    bn: 'শহরের সর্বশেষ',
    en: 'Latest city activity',
  },
  'public.feed.subtitle': {
    bn: 'নাম ও ঠিকানা গোপন রাখা হয়।',
    en: 'Names and addresses are hidden.',
  },
  'public.feed.empty': {
    bn: 'এখনো কোনো রিপোর্ট নেই — প্রথমটি আপনি করুন।',
    en: 'No reports yet. Be the first to file one.',
  },
  'public.feed.loading': { bn: 'লোড হচ্ছে…', en: 'Loading…' },
  'public.feed.error': {
    bn: 'কার্যকলাপ লোড করা যায়নি',
    en: 'Could not load activity',
  },
  'public.feed.ward': { bn: 'ওয়ার্ড', en: 'Ward' },
  'public.feed.no_photo': { bn: 'ছবি নেই', en: 'No photo' },
  'public.activity.cta': {
    bn: 'রিপোর্ট করতে নিবন্ধন করুন',
    en: 'Register to file a report',
  },
  'public.trust.marker1': {
    bn: 'ফ্রি · বিজ্ঞাপন নেই',
    en: 'Free · no ads',
  },
  'public.trust.marker2': {
    bn: 'বাংলাদেশি ডেটাতে থাকে',
    en: 'Stays in Bangladesh',
  },
  'public.trust.marker3': {
    bn: 'ব্যক্তিগত · নিরাপদ',
    en: 'Private · secure',
  },

  // WO-001 1.3 Registration
  'register.title': { bn: 'অ্যাকাউন্ট তৈরি করুন', en: 'Create account' },
  'register.subtitle': {
    bn: 'রিপোর্ট করা শুরু করতে আপনার পরিচয় যাচাই করুন।',
    en: 'Verify your identity to start reporting.',
  },
  'register.field.phone.label': { bn: 'ফোন নম্বর', en: 'Phone number' },
  'register.field.phone.placeholder': { bn: '01XXX-XXXXXX', en: '01XXX-XXXXXX' },
  'register.field.nid.label': {
    bn: 'জাতীয় পরিচয়পত্র',
    en: 'National ID (NID)',
  },
  'register.field.nid.helper': {
    bn: '১০ বা ১৭ সংখ্যার',
    en: '10 or 17 digits',
  },
  'register.field.name.label': { bn: 'পুরো নাম', en: 'Full name' },
  'register.field.name.helper': {
    bn: 'আপনার এনআইডি অনুযায়ী',
    en: 'As shown on your NID',
  },
  'register.field.password.label': { bn: 'পাসওয়ার্ড', en: 'Password' },
  'register.field.password.helper': {
    bn: 'কমপক্ষে ৮ অক্ষর, একটি সংখ্যাসহ',
    en: 'Minimum 8 characters, with at least one number',
  },
  'register.field.confirm.label': {
    bn: 'পাসওয়ার্ড নিশ্চিত করুন',
    en: 'Confirm password',
  },
  'register.error.phone': {
    bn: 'সঠিক ফোন নম্বর দিন',
    en: 'Enter a valid phone number',
  },
  'register.error.nid': {
    bn: 'NID অবশ্যই ১০ বা ১৭ সংখ্যার হতে হবে',
    en: 'NID must be 10 or 17 digits',
  },
  'register.error.name': { bn: 'আপনার নাম লিখুন', en: 'Enter your name' },
  'register.error.password': {
    bn: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের এবং একটি সংখ্যা থাকতে হবে',
    en: 'Password must be at least 8 characters and contain a digit',
  },
  'register.error.confirm': {
    bn: 'পাসওয়ার্ড মিলছে না',
    en: 'Passwords do not match',
  },
  'register.error.conflict': {
    bn: 'এই ফোন নম্বর / NID আগেই নিবন্ধিত — লগ ইন করুন।',
    en: 'This phone or NID is already registered — log in.',
  },
  'register.error.network': {
    bn: 'সংযোগ ব্যর্থ — আবার চেষ্টা করুন।',
    en: 'Connection failed — try again.',
  },
  'register.cta.submit': { bn: 'এগিয়ে যান', en: 'Continue' },
  'register.cta.submitting': { bn: 'পাঠানো হচ্ছে…', en: 'Sending…' },
  'register.cta.show': { bn: 'দেখান', en: 'Show' },
  'register.cta.hide': { bn: 'লুকান', en: 'Hide' },
  'register.link.login': {
    bn: 'ইতিমধ্যে অ্যাকাউন্ট আছে? লগ ইন করুন',
    en: 'Already have an account? Log in',
  },
  'register.back': { bn: '← ফিরে যান', en: '← Back' },
  'home.tagline': {
    bn: 'আপনার শহর, আপনার কণ্ঠস্বর',
    en: 'Your city, your voice',
  },
  'home.cta.report': {
    bn: 'সমস্যা রিপোর্ট করুন',
    en: 'Report an issue',
  },
  'home.cta.explore': {
    bn: 'শহরের কার্যকলাপ দেখুন',
    en: 'See city activity',
  },
  'home.trust.marker1': {
    bn: 'ফ্রি · বিজ্ঞাপন নেই',
    en: 'Free · no ads',
  },
  'home.trust.marker2': {
    bn: 'বাংলাদেশি ডেটাতে থাকে',
    en: 'Stays in Bangladesh',
  },
  'home.trust.marker3': {
    bn: 'ব্যক্তিগত · নিরাপদ',
    en: 'Private · secure',
  },

  // WO-001 1.6 Home / mockup 02
  'home.feed.empty': {
    bn: 'এই এলাকায় কোনো রিপোর্ট নেই',
    en: 'No reports in this area yet',
  },
  'home.feed.cta.report': {
    bn: 'রিপোর্ট করুন',
    en: 'Report',
  },

  // WO-001 1.11 Submitted Confirmation / mockup 03
  'confirmation.title': {
    bn: 'রিপোর্ট গৃহীত হয়েছে',
    en: 'Report received',
  },
  'confirmation.subtitle': {
    bn: 'আপনার রিপোর্ট সিটি কর্পোরেসে পাঠানো হয়েছে',
    en: 'Your report has been sent to city services',
  },
  'confirmation.view_report': {
    bn: 'রিপোর্ট দেখুন',
    en: 'View report',
  },
  'confirmation.back_home': {
    bn: 'হোমে ফিরে যান',
    en: 'Back to home',
  },

  // Status pill labels (WO-001 1.12, WO-002 2.2, WO-003 3.1)
  'status.submitted': { bn: 'নতুন', en: 'Submitted' },
  'status.routed': { bn: 'রাউট', en: 'Routed' },
  'status.in_progress': { bn: 'চলমান', en: 'In progress' },
  'status.resolved': { bn: 'সমাধান', en: 'Resolved' },
  // Bolt admin-tickets: the engine never transitions INTO closed or
  // cancelled from a v1 caller, but the citizen-initiated cancel-deferred
  // path or a future admin override could land there. Add the keys now so
  // the status pill renders copy instead of the literal key string.
  'status.closed': { bn: 'বন্ধ', en: 'Closed' },
  'status.cancelled': { bn: 'বাতিল', en: 'Cancelled' },

  // Category labels (Dhaka template)
  'category.streetlight': { bn: 'রাস্তার আলো নেই', en: 'Broken streetlight' },
  'category.pothole': { bn: 'রাস্তায় গর্ত', en: 'Pothole' },
  'category.drainage': { bn: 'ড্রেনে পানি জমেছে', en: 'Drainage' },
  'category.garbage': { bn: 'আবর্জনা পরিষ্কার হচ্ছে না', en: 'Garbage' },
  'category.other': { bn: 'অন্যান্য', en: 'Other' },

  // WO-001 1.12 My Reports — detail page
  'detail.topbar.section': { bn: 'আমার রিপোর্টসমূহ', en: 'My reports' },
  'detail.topbar.home': { bn: 'হোম', en: 'Home' },
  'detail.avatar.fallback': { bn: 'র', en: 'R' },
  'detail.meta.category': { bn: 'বিভাগ', en: 'Category' },
  'detail.meta.ward': { bn: 'ওয়ার্ড', en: 'Ward' },
  'detail.meta.sla': { bn: 'SLA', en: 'SLA' },
  'detail.meta.sla_value': { bn: '৪৮ ঘণ্টা', en: '48 hours' },
  'detail.meta.resolution': { bn: 'সমাধানের সময়', en: 'Resolution time' },
  'detail.ward.fallback': { bn: 'ওয়ার্ড', en: 'Ward' },
  'detail.section.description': { bn: 'আপনার বর্ণনা', en: 'Your description' },
  'detail.section.progress': { bn: 'অগ্রগতি', en: 'Progress' },
  'detail.progress.empty': {
    bn: 'কোনো অগ্রগতি এখনও নেই।',
    en: 'No progress yet.',
  },
  'detail.feedback.title': {
    bn: 'সমাধান কি সন্তোষজনক?',
    en: 'Are you satisfied with the resolution?',
  },
  'detail.feedback.subtitle': {
    bn: 'আপনার মতামত আমাদের ডিসপ্যাচারদের কাজের মান উন্নত করে।',
    en: 'Your feedback helps our dispatchers improve their work.',
  },
  'detail.feedback.dispute': { bn: 'আরও বিস্তারিত', en: 'Tell us more' },
  'detail.feedback.thanks': {
    bn: '✓ ধন্যবাদ — আমরা আপনার মতামত পেয়েছি।',
    en: '✓ Thanks — we have your feedback.',
  },
  'detail.feedback.resolved_ago': {
    bn: 'সমাধান হয়েছে',
    en: 'Resolved',
  },
  // WO-002 — the persisted feedback rating. The three buttons map
  // 1:1 onto the `rating` values in `lib/citizen/feedback.ts`
  // ('positive' | 'negative' | 'neutral'). The rating is what the
  // dispatcher crew table's positive / negative tally reads, so
  // the citizen's choice and the city's metric are the same
  // signal.
  'detail.feedback.rating.positive': {
    bn: 'হ্যাঁ, সন্তুষ্ট',
    en: 'Yes, satisfied',
  },
  'detail.feedback.rating.negative': {
    bn: 'না, সন্তুষ্ট নই',
    en: 'No, not satisfied',
  },
  'detail.feedback.rating.neutral': {
    bn: 'সিদ্ধান্ত নিশ্চিত নয়',
    en: 'Not sure yet',
  },
  'detail.feedback.rating.label': {
    bn: 'আপনার মূল্যায়ন',
    en: 'Your rating',
  },
  'detail.feedback.failed': {
    bn: 'মতামত পাঠানো যায়নি — আবার চেষ্টা করুন।',
    en: 'Could not send your feedback — please try again.',
  },
  'detail.feedback.resubmit': {
    bn: 'আপনার মতামত বদলাতে চান?',
    en: 'Want to change your rating?',
  },
  'detail.photo.delete_confirm': {
    bn: 'এই ছবি মুছে দেবেন?',
    en: 'Delete this photo?',
  },
  'detail.photo.delete_failed': {
    bn: 'ছবি মুছতে ব্যর্থ',
    en: 'Failed to delete photo',
  },
  'detail.photo.delete_aria': {
    bn: 'এই ছবি মুছুন',
    en: 'Delete this photo',
  },
  'detail.error.not_found': {
    bn: 'রিপোর্ট পাওয়া যায়নি',
    en: 'Report not found',
  },
  'detail.error.not_found_blurb': {
    bn: 'রিপোর্টটি মুছে ফেলা হতে পারে বা কখনো ছিল না।',
    en: 'The report may have been removed or never existed.',
  },
  'detail.error.forbidden': {
    bn: 'শুধুমাত্র আপনার নিজের রিপোর্ট দেখতে পারবেন।',
    en: 'You can only view reports you created.',
  },
  'detail.error.rate_limited.title': {
    bn: 'লোড হচ্ছে — একটু অপেক্ষা করুন',
    en: 'Loading — please wait',
  },
  'detail.error.rate_limited.blurb': {
    bn: 'সিটি সার্ভার এখন ব্যস্ত। কিছুক্ষণের মধ্যে আবার চেষ্টা হবে…',
    en: 'The city server is briefly busy. Refreshing in a moment…',
  },
  'detail.error.generic': {
    bn: 'রিপোর্ট লোড করা যায়নি',
    en: 'Could not load report',
  },
  'detail.error.back_home': { bn: '← হোমে ফিরে যান', en: '← Back to home' },
  'detail.loading': { bn: 'লোড হচ্ছে…', en: 'Loading…' },
  'detail.signin_required': {
    bn: 'এই রিপোর্ট দেখতে সাইন ইন করুন।',
    en: 'You need to sign in to view this report.',
  },
  'common.cancel': { bn: 'বাতিল', en: 'Cancel' },
  'common.confirm': { bn: 'নিশ্চিত করুন', en: 'Confirm' },

  // WO-001 1.11 Submitted Confirmation
  'confirmation.toast.decline_noted': {
    bn: 'আপনার অনুরোধটি নথিভুক্ত হয়েছে — আমরা পর্যালোচনা করব।',
    en: 'Your request has been logged — we will review it.',
  },
  'confirmation.title.accepted': {
    bn: 'আপনার রিপোর্ট গ্রহণ করা হয়েছে।',
    en: 'Your report has been received.',
  },
  'confirmation.subtitle.sent': {
    bn: 'ধন্যবাদ। আমরা এটি সংশ্লিষ্ট বিভাগে পাঠিয়েছি।',
    en: 'Thank you. We have sent it to the responsible department.',
  },
  'confirmation.subtitle.track': {
    bn: 'অগ্রগতি এই পেজ থেকেই দেখতে পারবেন।',
    en: 'You can track progress from this page.',
  },
  'confirmation.ticket_id_label': { bn: 'টিকেট আইডি:', en: 'Ticket ID:' },
  'confirmation.trust.notify': {
    bn: 'আপডেট হলে আমরা আপনাকে জানাব',
    en: 'We will let you know when there is an update',
  },

  // Intent 008 Bolt 008-001 — confirmation step copy.
  // (Filled the gaps surfaced by the slow-motion demo:
  // the next-steps card and the copy-id button were
  // rendering raw key.path strings.)
  'confirmation.copy_id': {
    bn: 'আইডি কপি করুন',
    en: 'Copy ID',
  },
  'confirmation.copied': {
    bn: 'কপি হয়েছে!',
    en: 'Copied!',
  },
  'confirmation.next_title': {
    bn: 'পরবর্তীতে কী হবে',
    en: 'What happens next',
  },
  'confirmation.next_step1': {
    bn: 'আপনার রিপোর্ট এখনো সারিতে আছে',
    en: 'Your report is now in the queue',
  },
  'confirmation.next_step2': {
    bn: '১ দিনের মধ্যে ডিসপ্যাচার সাড়া দেবেন',
    en: 'A dispatcher will respond within 1 day',
  },
  'confirmation.next_step3': {
    bn: 'আপডেটের জন্য আপনার ফোনে নোটিফিকেশন পাঠানো হবে',
    en: "You'll get a push notification when the status changes",
  },

  // Status trail preview (1.11) — what comes after submission
  'trail_preview.submitted.title': { bn: 'জমা হয়েছে', en: 'Submitted' },
  'trail_preview.submitted.time': { bn: 'এইমাত্র · আপনি', en: 'Just now · You' },
  'trail_preview.routed.title': {
    bn: 'বৈদ্যুতিক বিভাগে রাউট হয়েছে',
    en: 'Routed to electrical department',
  },
  'trail_preview.routed.time': {
    bn: 'আনুমানিক ৪–৪৮ ঘণ্টা',
    en: 'Estimate 4–48 hours',
  },
  'trail_preview.in_progress.title': {
    bn: 'মাঠ ক্রু কাজ শুরু করবে',
    en: 'Field crew will start work',
  },
  'trail_preview.in_progress.time': { bn: 'পরবর্তী', en: 'Next' },
  'trail_preview.resolved.title': {
    bn: 'সমাধান নিশ্চিত হবে',
    en: 'Resolution will be confirmed',
  },
  'trail_preview.resolved.time': { bn: 'পরবর্তী', en: 'Next' },

  // Auth surface (1.11 unauth path)
  'auth.signin_required_short': {
    bn: 'সাইন ইন করুন।',
    en: 'You need to sign in.',
  },
  'auth.back_home': { bn: '← হোমে ফিরে যান', en: '← Back to home' },

  // Status trail titles (WO-001 1.12 trail)
  'trail.submitted': { bn: 'জমা হয়েছে', en: 'Submitted' },
  'trail.routed': {
    bn: 'বৈদ্যুতিক বিভাগে রাউট হয়েছে',
    en: 'Routed to electrical department',
  },
  'trail.in_progress': {
    bn: 'মাঠ ক্রু কাজ শুরু করেছে',
    en: 'Field crew started work',
  },
  'trail.resolved': {
    bn: 'সমাধান নিশ্চিত হয়েছে',
    en: 'Resolution confirmed',
  },
  'trail.closed': { bn: 'বন্ধ করা হয়েছে', en: 'Closed' },
  'trail.cancelled': { bn: 'বাতিল', en: 'Cancelled' },
  // Bolt 007-001 — citizen trail filter rewrites any
  // `^[a-z_]+:` marker-shaped note (e.g. `after_photo:<url>`)
  // to this localised "After photo added" string. The trail
  // entry is preserved in the timeline; only the raw URL is
  // hidden. Bengali + English.
  'trail.afterPhotoAdded': {
    bn: 'ছবি যোগ করা হয়েছে',
    en: 'After photo added',
  },

  // Bolt 007-001 — photo group labels on /reports/[id].
  // The Before group is the citizen's own photos (the "evidence of
  // the issue" set). The After group is the crew's photos (the
  // "evidence of the fix" set); the group is hidden when empty.
  // (Bolt 008-001 upgraded the en strings to "Before photo" /
  // "After photo" so they are usable as card alt text. The
  // canonical declarations are below under Bolt 008-001.)
  'photo.emptyBefore': {
    bn: 'কোনো ছবি যোগ করা হয়নি',
    en: 'No before photos',
  },

  // Time-ago (used in citizen-facing surfaces)
  'time.minutes_ago': { bn: 'মিনিট আগে', en: 'minutes ago' },
  'time.hours_ago': { bn: 'ঘণ্টা আগে', en: 'hours ago' },
  'time.days_ago': { bn: 'দিন আগে', en: 'days ago' },
  'time.filed': { bn: 'জমা', en: 'filed' },

  // WO-001 1.7–1.10 report step headings + body copy
  'report.location.h1': {
    bn: 'পিনটি বসান যেখানে সমস্যাটি হয়েছে',
    en: 'Place the pin where the problem is',
  },
  'report.location.help': {
    bn: 'পিনটিকে সঠিক জায়গায় টেনে আনুন। পরে পরিবর্তন করতে পারবেন।',
    en: 'Drag the pin to the exact spot. You can refine it later.',
  },
  'report.location.coordinates_label': {
    bn: 'স্থানাঙ্ক',
    en: 'Coordinates',
  },
  'report.location.continue': {
    bn: 'পরবর্তী → ছবি',
    en: 'Continue → Photo',
  },
  'report.location.out_of_bounds.title': {
    bn: 'পিনটি সমর্থিত এলাকার বাইরে আছে',
    en: 'The pin is outside the supported area',
  },
  'report.location.out_of_bounds.body': {
    bn: 'পিনটি এমন একটি জায়গায় আছে যেখানে CityFix এখনো কাজ করে না। ছায়াঘেরা এলাকার ভেতরে পিনটি আনুন অথবা বাতিল করুন।',
    en: 'The pin is in an area CityFix does not yet cover. Move it inside the shaded area, or cancel.',
  },
  'report.location.out_of_bounds.move': {
    bn: 'সমর্থিত এলাকায় পিন আনুন',
    en: 'Move pin to supported area',
  },
  'report.location.cancel': { bn: 'বাতিল', en: 'Cancel' },
  'report.location.ward_label': { bn: 'ওয়ার্ড', en: 'Ward' },

  'report.photo.h1': { bn: 'ছবি যোগ করুন', en: 'Add photos' },
  'report.photo.help': {
    bn: 'সর্বোচ্চ {cap}টি ছবি যোগ করতে পারবেন। কমপক্ষে ১টি আবশ্যক।',
    en: 'Add up to {cap} photos. At least 1 is required.',
  },
  'report.photo.take_photo': { bn: 'ছবি তুলুন', en: 'Take photo' },
  'report.photo.remove_aria': { bn: 'ছবি সরান', en: 'Remove photo' },
  'report.photo.privacy': {
    bn: 'ছবিগুলো ব্যক্তিগতভাবে সংরক্ষিত থাকে। সিটি কর্পোরেশন সেগুলো দেখতে পায় শুধু আপনার রিপোর্ট জমা দেওয়ার পর। পরে আপনি প্রতিটি ছবি মুছে দিতে পারবেন।',
    en: 'Photos are stored privately. The city corporation sees them only after you submit. You can delete individual photos from your report later.',
  },
  'report.photo.continue': {
    bn: 'পরবর্তী → বিভাগ',
    en: 'Continue → Category',
  },
  'report.photo.back': { bn: '← পূর্ববর্তী', en: '← Back' },
  'report.photo.up_to': {
    bn: 'সর্বোচ্চ {count}টি ছবি',
    en: 'up to {count} photos',
  },

  'report.category.h1': { bn: 'সমস্যাটি কী?', en: 'What is the problem?' },
  'report.category.help': {
    bn: 'সমস্যার সাথে সবচেয়ে মিলে যাওয়া বিভাগটি বাছাই করুন।',
    en: 'Pick the category that best matches the problem.',
  },
  'report.category.routing_note': {
    bn: 'আপনার বাছাই করা বিভাগ অনুযায়ী রিপোর্টটি সঠিক সিটি বিভাগে পাঠানো হবে। সবচেয়ে কাছাকাছি মিল বাছাই করলে দ্রুত সমাধান হবে।',
    en: 'The category you choose routes the report to the right city department. Picking the closest match helps it get resolved faster.',
  },
  'report.category.continue': {
    bn: 'পরবর্তী → নোট',
    en: 'Continue → Note',
  },
  'report.category.back': { bn: '← পূর্ববর্তী', en: '← Back' },

  'report.note.h1': { bn: 'কিছু যোগ করতে চাইলে লিখুন', en: 'Add a note (optional)' },
  'report.note.help': {
    bn: 'ঐচ্ছিক। সর্বোচ্চ {max} অক্ষর।',
    en: 'Optional. Up to {max} characters.',
  },
  'report.note.placeholder': {
    bn: 'যেমন: টানা তিন রাত আলো নেই।',
    en: 'e.g. The light has been out for three nights in a row.',
  },
  'report.note.submit': { bn: 'পর্যালোচনা ও জমা', en: 'Review & Submit' },
  'report.note.submitting': { bn: 'জমা হচ্ছে…', en: 'Submitting…' },
  'report.note.help_after_submit': {
    bn: 'জমা দেওয়ার পর আপনার রিপোর্ট সিটি কর্পোরেশনে পৌঁছে যাবে। পরবর্তী পেজে অগ্রগতি দেখতে পারবেন।',
    en: "Once you submit, your report is filed with the city corporation. You'll see the status trail on the next page.",
  },
  'report.note.missing_draft': {
    bn: 'ড্রাফট ডেটা নেই। অনুগ্রহ করে /report/location থেকে শুরু করুন।',
    en: 'Missing draft data. Please start over from /report/location.',
  },
  'report.note.submit_failed': {
    bn: 'জমা ব্যর্থ',
    en: 'Submit failed',
  },
  'report.note.back': { bn: '← পূর্ববর্তী', en: '← Back' },

  // Intent 008 Bolt 008-001 — additional report-step copy.
  // (Bolt 008-001 fills the gaps the slow-motion demo
  // surfaced: every key below is referenced by a page
  // under app/report/(create)/... but was missing from
  // the registry, so t('...', ...) returned the raw key
  // string instead of the localized value.)
  'report.category.search_placeholder': {
    bn: 'ক্যাটেগরি খুঁজুন…',
    en: 'Search categories…',
  },
  'report.category.no_match': {
    bn: 'কোনো ক্যাটেগরি পাওয়া যায়নি',
    en: 'No matching category',
  },
  'report.photo.empty_hint': {
    bn: 'ছবি যোগ করুন — একটি প্রাথমিক ছবি বাধ্যতামূলক, বাকি ২টি ঐচ্ছিক',
    en: 'Add photos — 1 primary is required, up to 2 more are optional',
  },
  'report.photo.counter': {
    // The placeholder is `{cap}`, not `{max}` — the call site in
    // `app/report/(create)/photo/page.tsx` passes `{ count, cap }`,
    // and the sibling `report.photo.cap_tooltip` uses `{cap}` too.
    // A template placeholder with no matching var is left intact by
    // `interpolate`, so the counter rendered the literal text
    // "0 / {max} ছবি" to the citizen. `cap` is the codebase-wide
    // name (see `lib/report-photo-cap.ts` → `derivePhotoCap`).
    bn: '{count} / {cap} ছবি',
    en: '{count} / {cap} photos',
  },
  'report.photo.add_primary': {
    bn: 'প্রাথমিক ছবি যোগ করুন',
    en: 'Add primary photo',
  },
  'report.photo.cap_tooltip': {
    bn: 'সর্বোচ্চ {cap}টি ছবি যোগ করা যাবে',
    en: 'You can add up to {cap} photos',
  },
  'report.photo.processing': {
    // No placeholder: the `report.photo.*` family must not carry a
    // size placeholder (see `tests/unit/i18n-placeholder-contract.test.ts`).
    bn: 'ছবি প্রস্তুত করা হচ্ছে…',
    en: 'Preparing your photo…',
  },
  'report.photo.too_large': {
    bn: 'ছবিটি বড়। ছোট করে আবার চেষ্টা করুন।',
    en: 'That photo is too large. Please try a smaller one.',
  },
  'report.note.label': {
    bn: 'নোট যোগ করুন',
    en: 'Add a note',
  },
  'report.note.helper': {
    bn: 'আপনার নোট ডিসপ্যাচারকে দ্রুত বুঝতে সাহায্য করে',
    en: 'A short note helps the dispatcher understand quickly',
  },
  'report.note.counter': {
    bn: '{count} অক্ষর',
    en: '{count} characters',
  },
  'report.note.too_long': {
    bn: 'নোট {max} অক্ষরের বেশি হতে পারবে না',
    en: 'Note cannot exceed {max} characters',
  },
  'report.note.photo_too_large': {
    // No placeholder — the copy names no number, so it works for any
    // future cap change.
    bn: 'ছবিটি বড় হওয়ায় রিপোর্টটি জমা দেওয়া যায়নি। অনুগ্রহ করে ছবির সাইজ ছোট করে আবার চেষ্টা করুন, অথবা ছবি ছাড়া রিপোর্টটি জমা দিন।',
    en: 'The photo is too large, so the report could not be submitted. Please try a smaller photo, or submit the report without a photo.',
  },
  'report.summary.duplicate_again': {
    bn: 'এই রিপোর্টটি পুনরায় জমা দেওয়া যাবে না',
    en: 'This report cannot be re-submitted',
  },
  'report.summary.error_retry': {
    bn: 'জমা দেওয়া যায়নি — আবার চেষ্টা করুন',
    en: 'Could not submit — please try again',
  },
  'report.summary.confirm_label': {
    bn: 'আমি নিশ্চিত — জমা দিন',
    en: 'I confirm — submit',
  },

  'report.summary.h1': {
    bn: 'আপনার রিপোর্ট পর্যালোচনা করুন',
    en: 'Review your report',
  },
  'report.summary.existing_found': {
    bn: 'এই জায়গার কাছে {distance}মিটার দূরে একটি পুরোনো রিপোর্ট পাওয়া গেছে যেটি আপনারটির সাথে মিলে যাচ্ছে। আপনি সেটি দেখতে পারেন অথবা নিজেরটি আলাদা রিপোর্ট হিসেবে জমা দিতে পারেন।',
    en: 'We found an existing report {distance}m away that looks similar. You can link to it, or submit yours as a new report.',
  },
  'report.summary.existing_label': {
    bn: 'পুরোনো রিপোর্ট',
    en: 'Existing report',
  },
  'report.summary.no_note': { bn: 'কোনো নোট নেই', en: 'No note' },
  'report.summary.away_suffix': {
    bn: 'দূরে',
    en: 'away',
  },
  'report.summary.link_cta': {
    bn: 'এই রিপোর্টে যান',
    en: 'Link to this report',
  },
  'report.summary.submit_new_cta': {
    bn: 'নতুন রিপোর্ট হিসেবে জমা দিন',
    en: 'Submit as new report',
  },
  'report.summary.submitting': { bn: 'জমা হচ্ছে…', en: 'Submitting…' },
  'report.summary.step': {
    bn: 'ধাপ ৫/৫ — পর্যালোচনা',
    en: 'Step 5 of 5 — Review',
  },

  // Common step labels (used in the side cards across 1.7–1.10)
  'report.step_label': { bn: 'ধাপ {current}/{total}', en: 'Step {current} of {total}' },
  'common.back': { bn: '← পূর্ববরতী', en: '← Back' },
  'common.back_home_short': { bn: '← হোম', en: '← Home' },
  'common.continue_photo': { bn: 'পরবর্তী → ছবি', en: 'Continue → Photo' },
  'common.continue_category': { bn: 'পরবরতী → বিভাগ', en: 'Continue → Category' },
  'common.continue_note': { bn: 'পরবরতী → নোট', en: 'Continue → Note' },
  'common.continue_submit': { bn: 'পর্যালোচনা ও জমা', en: 'Review & Submit' },

  // Auth (used in 1.7–1.10 unauth early-return)
  'auth.signin_required_long': {
    bn: 'রিপোর্ট দাখিল করতে সাইন ইন করুন।',
    en: 'You need to sign in to file a report.',
  },

  // WO-001 1.4 Verification (OTP)
  'verify.title': {
    bn: 'আপনার ফোন যাচাই করুন',
    en: 'Verify your phone',
  },
  'verify.subtitle': {
    bn: '+880 {masked}-এ একটি কোড পাঠানো হয়েছে।',
    en: 'We sent a code to +880 {masked}.',
  },
  'verify.change_number': {
    bn: 'ভুল নম্বর দিয়েছেন? পরিবর্তন করুন',
    en: 'Wrong number? Change it',
  },
  'verify.input.code_aria': {
    bn: '৬ সংখ্যার যাচাই কোড',
    en: '6-digit verification code',
  },
  'verify.cta.submit': { bn: 'যাচাই করুন', en: 'Verify' },
  'verify.cta.submitting': {
    bn: 'যাচাই হচ্ছে…',
    en: 'Verifying…',
  },
  'verify.resend.countdown': {
    bn: '০:{seconds} সেকেন্ডে আবার পাঠান',
    en: 'Resend in 0:{seconds}',
  },
  'verify.resend.action': {
    bn: 'আবার কোড পাঠান',
    en: 'Resend code',
  },
  'verify.resend.sending': {
    bn: 'পাঠানো হচ্ছে…',
    en: 'Sending…',
  },
  'verify.error.wrong_code': {
    bn: 'কোড মিলছে না — আবার চেষ্টা করুন',
    en: "Code didn't match — try again.",
  },
  'verify.error.expired': {
    bn: 'কোডের মেয়াদ শেষ — নতুন কোড পাঠান',
    en: 'Code expired — send new code.',
  },
  'verify.error.too_many': {
    bn: 'অনেক চেষ্টা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন',
    en: 'Too many attempts — try again later.',
  },
  'verify.error.too_many_back': {
    bn: '← নিবন্ধনে ফিরে যান',
    en: '← Back to registration',
  },
  'verify.error.network': {
    bn: 'সংযোগ ব্যর্থ — আবার চেষ্টা করুন',
    en: 'Connection failed — try again.',
  },
  'verify.helper.not_arrived': {
    bn: 'কোড আসছে না? আবার পাঠান',
    en: "Code didn't arrive? Resend.",
  },
  'verify.back.confirm_title': {
    bn: 'যাচাই ছেড়ে যাবেন?',
    en: 'Leave verification?',
  },
  'verify.back.stay': { bn: 'থাকুন', en: 'Stay' },
  'verify.back.leave': { bn: 'ছেড়ে যান', en: 'Leave' },
  'verify.back': { bn: '← ফিরে যান', en: '← Back' },

  // WO-001 1.5 Login
  'login.title': { bn: 'লগ ইন করুন', en: 'Log in' },
  'login.subtitle': { bn: 'স্বাগতম।', en: 'Welcome back.' },
  'login.field.phone.label': { bn: 'ফোন নম্বর', en: 'Phone number' },
  'login.field.phone.placeholder': { bn: '01XXX-XXXXXX', en: '01XXX-XXXXXX' },
  'login.field.password.label': { bn: 'পাসওয়ার্ড', en: 'Password' },
  'login.error.wrong': {
    bn: 'ফোন নম্বর বা পাসওয়ার্ড ভুল',
    en: 'Wrong phone or password',
  },
  'login.error.network': {
    bn: 'সংযোগ ব্যর্থ — আবার চেষ্টা করুন',
    en: 'Connection failed — try again.',
  },
  'login.error.too_many': {
    bn: 'অনেক চেষ্টা হয়েছে — কিছুক্ষণ পর আবার চেষ্টা করুন',
    en: 'Too many attempts — try again later.',
  },
  'login.locked.note': {
    bn: 'অপেক্ষা করুন — ১০ মিনিট পর আবার চেষ্টা করুন। সাহায্যের জন্য হেল্পলাইন নম্বর দেখুন।',
    en: 'Please wait 10 minutes before trying again. See the splash page for the help hotline.',
  },
  'login.error.invalid_phone': {
    bn: 'সঠিক ফোন নম্বর দিন',
    en: 'Enter a valid phone number',
  },
  'login.error.empty_password': {
    bn: 'পাসওয়ার্ড লিখুন',
    en: 'Enter your password',
  },
  'login.cta.submit': { bn: 'লগ ইন', en: 'Log in' },
  'login.cta.submitting': { bn: 'লগ ইন হচ্ছে…', en: 'Logging in…' },
  'login.cta.show': { bn: 'দেখান', en: 'Show' },
  'login.cta.hide': { bn: 'লুকান', en: 'Hide' },
  'login.note.need_help': {
    bn: 'পাসওয়ার্ড রিসেট WO-004-এ আসছে',
    en: 'Password reset ships in WO-004',
  },
  'login.link.register': {
    bn: 'নতুন এখানে? নিবন্ধন করুন',
    en: 'New here? Register',
  },
  'login.back': { bn: '← ফিরে যান', en: '← Back' },

  // WO-001 1.6 Home / City Activity (and 1.13 feed)
  'home.brand.separator': { bn: '·', en: '·' },
  'home.topbar.report': { bn: 'নতুন রিপোর্ট', en: 'New report' },
  'home.topbar.my_reports': { bn: 'আমার রিপোর্ট', en: 'My reports' },
  'home.sidepanel.title': {
    bn: 'শহরের কার্যকলাপ',
    en: 'City activity',
  },
  'home.sidepanel.subtitle': {
    bn: 'গত ২৪ ঘণ্টায় আপনার এলাকায়',
    en: 'In your area in the last 24 hours',
  },
  'home.filter.all': { bn: 'সব', en: 'All' },
  'home.filter.new': { bn: 'নতুন', en: 'New' },
  'home.filter.in_progress': { bn: 'চলমান', en: 'In progress' },
  'home.filter.resolved': { bn: 'সমাধান', en: 'Resolved' },
  'home.map.location_pill': {
    bn: 'মিরপুর ১০ · আপনার এলাকা',
    en: 'Mirpur 10 · your area',
  },
  'home.notifications.banner': {
    bn: 'আপনার রিপোর্টের আপডেট পেতে নোটিফিকেশন চালু করুন',
    en: 'Get notified when your reports update',
  },
  'home.notifications.enable': { bn: 'চালু করুন', en: 'Enable' },
  'home.notifications.not_now': { bn: 'এখন নয়', en: 'Not now' },
  'home.notifications.off_banner': {
    bn: 'নোটিফিকেশন বন্ধ আছে — সেটিংস থেকে চালু করুন',
    en: 'Notifications are off — turn them on in Settings',
  },
  'home.empty.title': {
    bn: 'শহরে কোনো রিপোর্ট নেই',
    en: 'No reports yet',
  },
  'home.empty.subtitle': {
    bn: 'প্রথমটি আইড করুন!',
    en: 'Be the first to report!',
  },
  'home.empty.cta': { bn: 'রিপোর্ট করুন', en: 'Report' },
  'home.offline.banner': {
    bn: 'অফলাইন — সাম্প্রতিক দেখাচ্ছে',
    en: 'Offline — showing recent activity',
  },
  'home.activity.thumbnail_alt': { bn: 'ছবি', en: 'Photo' },
  'home.activity.ward_label': { bn: 'ওয়ার্ড', en: 'Ward' },
  'home.activity.new_badge': { bn: 'নতুন', en: 'New' },
  'home.feed.loading': { bn: 'লোড হচ্ছে…', en: 'Loading…' },
  'home.feed.error': {
    bn: 'কার্যকলাপ লোড করা যায়নি',
    en: 'Could not load activity',
  },
  'home.signin_required': {
    bn: 'হোম দেখতে সাইন ইন করুন।',
    en: 'You need to sign in to view Home.',
  },

  // WO-001 1.13 City Activity Feed (full list)
  'feed.breadcrumb': {
    bn: 'শহরের সর্বশেষ',
    en: "What's happening",
  },
  'feed.link.home': { bn: 'হোম', en: 'Home' },
  'feed.title': {
    bn: 'শহরের কার্যকলাপ',
    en: 'City activity',
  },
  'feed.subtitle': {
    bn: 'আপনার শহরে সর্বশেষ রিপোর্ট ও সমাধান',
    en: 'Latest reports and resolutions in your city',
  },
  'feed.filter.open': { bn: 'খোলা', en: 'Open' },
  'feed.filter.resolved_today': {
    bn: 'আজ সমাধান',
    en: 'Resolved today',
  },
  'feed.empty.title': {
    bn: 'কোনো রিপোর্ট নেই',
    en: 'No reports',
  },
  'feed.empty.be_first': {
    bn: 'প্রথমটি আপনি করুন',
    en: 'Be the first to report',
  },
  'feed.loading': { bn: 'লোড হচ্ছে…', en: 'Loading…' },
  'feed.error': {
    bn: 'ফিড লোড করা যায়নি',
    en: 'Could not load feed',
  },
  'feed.signin_required': {
    bn: 'ফিড দেখতে সাইন ইন করুন।',
    en: 'You need to sign in to view the feed.',
  },
  'feed.load_older': { bn: 'আরও পুরোনো দেখুন', en: 'Load older' },
  'feed.last_updated': {
    bn: 'সর্বশেষ আপডেট',
    en: 'Last updated',
  },

  // WO-001 1.6 — My Reports list (citizen's own reports, /reports)
  'reports.breadcrumb': { bn: 'আমার রিপোর্ট', en: 'My reports' },
  'reports.breadcrumb.all': { bn: 'সব রিপোর্ট', en: 'All reports' },
  'reports.link.home': { bn: 'হোম', en: 'Home' },
  'reports.title': { bn: 'আমার রিপোর্ট', en: 'My reports' },
  'reports.title.all': { bn: 'সব রিপোর্ট', en: 'All city reports' },
  'reports.subtitle': {
    bn: 'আপনার জমা দেওয়া সব রিপোর্ট এখানে দেখুন',
    en: 'All reports you have submitted',
  },
  'reports.subtitle.all': {
    bn: 'শহরের সকল রিপোর্ট একনজরে',
    en: 'Every report filed in the city, in one place',
  },
  'reports.empty.title': {
    bn: 'এখনো কোনো রিপোর্ট নেই',
    en: 'You have not submitted any reports yet',
  },
  'reports.empty.title.all': {
    bn: 'এই শহরে এখনো কোনো রিপোর্ট নেই',
    en: 'No reports have been filed in this city yet',
  },
  'reports.empty.subtitle': {
    bn: 'আপনার প্রথম রিপোর্ট জমা দিন এবং শহরকে আরও ভালো করতে সাহায্য করুন।',
    en: 'Submit your first report and help make the city better.',
  },
  'reports.empty.subtitle.all': {
    bn: 'নাগরিকরা রিপোর্ট জমা দিলে এখানে দেখা যাবে।',
    en: 'Reports filed by citizens will appear here.',
  },
  'reports.empty.cta': { bn: 'নতুন রিপোর্ট', en: 'New report' },
  'reports.signin_required': {
    bn: 'আপনার রিপোর্ট দেখতে সাইন ইন করুন।',
    en: 'Sign in to see your reports.',
  },
  'reports.status.submitted': { bn: 'নতুন', en: 'New' },
  'reports.status.routed': { bn: 'পাঠানো হয়েছে', en: 'Routed' },
  'reports.status.in_progress': { bn: 'চলমান', en: 'In progress' },
  'reports.status.resolved': { bn: 'সমাধান', en: 'Resolved' },
  'reports.status.closed': { bn: 'বন্ধ', en: 'Closed' },
  'reports.status.cancelled': { bn: 'বাতিল', en: 'Cancelled' },

  // Theme toggle (light / dark / system)
  'theme.toggle.aria_label': {
    bn: 'থিম পরিবর্তন করুন',
    en: 'Change theme',
  },
  'theme.option.light': { bn: 'হালকা', en: 'Light' },
  'theme.option.dark': { bn: 'গাঢ়', en: 'Dark' },
  'theme.option.system': { bn: 'সিস্টেম', en: 'System' },
  'theme.option.light_short': { bn: 'হা', en: 'L' },
  'theme.option.dark_short': { bn: 'গা', en: 'D' },
  'theme.option.system_short': { bn: 'সি', en: 'A' },
  'theme.option.system_hint': {
    bn: 'সিস্টেমের সেটিংস অনুসরণ করে',
    en: 'Follows your device',
  },

  // Global header chrome (AppHeader) — used by every page that mounts
  // <AppShell>. Bangla-first brand and nav copy; English fallback for
  // signed-out / EN-preference visitors.
  'header.brand.city': {
    bn: 'ঢাকা',
    en: 'Dhaka',
  },
  'header.nav.home': { bn: 'হোম', en: 'Home' },
  'header.nav.feed': { bn: 'ফিড', en: 'Activity' },
  'header.nav.reports': { bn: 'আমার রিপোর্ট', en: 'My reports' },
  'header.nav.report': { bn: 'রিপোর্ট করুন', en: 'Report' },
  'header.nav.menu_label': { bn: 'প্রধান নেভিগেশন', en: 'Main navigation' },
  'header.nav.toggle_menu': { bn: 'মেনু খুলুন', en: 'Toggle menu' },
  'header.user.signin': { bn: 'সাইন ইন', en: 'Sign in' },
  'header.user.register': { bn: 'নিবন্ধন', en: 'Register' },

  // WO-002 (Intent 003) — Dispatcher surfaces
  'dispatcher.queue.title': {
    bn: 'ট্রায়াজ সারি',
    en: 'Triage queue',
  },
  'dispatcher.queue.subtitle': {
    bn: 'নতুন ও রাউট হওয়া রিপোর্ট — বয়স অনুযায়ী সাজানো',
    en: 'New and routed reports — sorted by age',
  },
  'dispatcher.queue.filter.all': { bn: 'সব', en: 'All' },
  'dispatcher.queue.filter.submitted': { bn: 'শুধু নতুন', en: 'Submitted only' },
  'dispatcher.queue.filter.routed': { bn: 'শুধু রাউট', en: 'Routed only' },
  'dispatcher.queue.filter.heading': { bn: 'অবস্থা', en: 'Status' },
  'dispatcher.queue.row.reporter': { bn: 'রিপোর্টকারী:', en: 'Reporter:' },
  // The dispatcher's scope tag in the sub-header. `{ward}` is the
  // ward NAME (not the `ward_14` id) and `{dept}` the department
  // name; both are omitted gracefully when the dispatcher is not
  // bound to a ward / department.
  'dispatcher.queue.scope': {
    bn: 'ডিসপ্যাচার',
    en: 'Dispatcher',
  },
  'dispatcher.queue.scope.ward': {
    bn: 'ওয়ার্ড {ward}',
    en: 'Ward {ward}',
  },
  'dispatcher.queue.scope.department': {
    bn: '{dept}',
    en: '{dept}',
  },
  'dispatcher.queue.empty.title': {
    bn: 'সারি খালি',
    en: 'Queue is empty',
  },
  'dispatcher.queue.empty.subtitle': {
    bn: 'এই মুহূর্তে আপনার এলাকায় কোনো নতুন বা রাউট হওয়া রিপোর্ট নেই।',
    en: 'No new or routed reports in your area right now.',
  },
  'dispatcher.queue.error': {
    bn: 'সারি লোড করা যায়নি',
    en: 'Could not load the queue',
  },
  'dispatcher.queue.signin_required': {
    bn: 'ট্রায়াজ সারি দেখতে লগইন করুন',
    en: 'Sign in to view the triage queue',
  },
  'dispatcher.queue.row.age': {
    bn: '{age} আগে',
    en: '{age} ago',
  },
  'dispatcher.queue.row.view': { bn: 'বিস্তারিত', en: 'View ticket' },
  'dispatcher.dedup.link': {
    bn: 'সম্ভাব্য ডুপ্লিকেট ({n})',
    en: 'Possible duplicates ({n})',
  },
  'dispatcher.dedup.title': {
    bn: 'সম্ভাব্য ডুপ্লিকেট রিভিউ',
    en: 'Possible duplicate review',
  },

  // WO-003 — Dispatcher ticket detail + transitions (Intent 003, Unit 003)
  'dispatcher.detail.not_found': {
    bn: 'এই রিপোর্টটি আপনার এখতিয়ারে নেই বা মুছে ফেলা হয়েছে।',
    en: 'This report is outside your scope or has been removed.',
  },
  'dispatcher.detail.back_to_queue': {
    bn: '← ট্রায়াজ সারিতে ফিরে যান',
    en: '← Back to triage queue',
  },
  'dispatcher.detail.loading': {
    bn: 'রিপোর্ট লোড হচ্ছে…',
    en: 'Loading report…',
  },
  'dispatcher.detail.record': {
    bn: 'রিপোর্টের বিবরণ',
    en: 'Report record',
  },
  'dispatcher.detail.field.city': { bn: 'শহর', en: 'City' },
  'dispatcher.detail.field.ward': { bn: 'ওয়ার্ড', en: 'Ward' },
  'dispatcher.detail.field.category': { bn: 'বিভাগ', en: 'Category' },
  'dispatcher.detail.field.location': { bn: 'অবস্থান', en: 'Location' },
  'dispatcher.detail.field.note': { bn: 'নোট', en: 'Note' },
  'dispatcher.detail.field.reporter': {
    bn: 'রিপোর্টকারী',
    en: 'Reporter',
  },
  'dispatcher.detail.field.crew': { bn: 'নিয়োজিত ক্রু', en: 'Assigned crew' },
  'dispatcher.detail.field.created': {
    bn: 'জমার সময়',
    en: 'Filed',
  },
  'dispatcher.detail.trail': {
    bn: 'অগ্রগতির ইতিহাস',
    en: 'Status trail',
  },
  'dispatcher.detail.trail.actor': {
    bn: 'কর্মী',
    en: 'Actor',
  },
  'dispatcher.detail.internal_note': {
    bn: 'অভ্যন্তরীণ নোট',
    en: 'Internal note',
  },
  'dispatcher.detail.internal_note.help': {
    bn: 'শুধু ডিসপ্যাচার দল দেখতে পায়। নাগরিক দেখতে পায় না।',
    en: 'Visible to dispatchers only — never to the citizen.',
  },
  'dispatcher.detail.save_note': {
    bn: 'নোট সংরক্ষণ করুন',
    en: 'Save note',
  },
  'dispatcher.detail.transition.heading': {
    bn: 'পরবর্তী পদক্ষেপ',
    en: 'Next action',
  },
  'dispatcher.detail.transition.none': {
    bn: 'এই মুহূর্তে কোনো পদক্ষেপ নেই',
    en: 'No further action available',
  },
  'dispatcher.detail.transition.saving': {
    bn: 'পাঠানো হচ্ছে…',
    en: 'Submitting…',
  },
  'dispatcher.detail.reassign.heading': {
    bn: 'পুনর্বণ্টন',
    en: 'Reassign',
  },
  'dispatcher.detail.reassign.cta': {
    bn: 'ওয়ার্ড ও বিভাগ পরিবর্তন',
    en: 'Change ward and department',
  },
  'dispatcher.detail.reassign.save': {
    bn: 'সংরক্ষণ',
    en: 'Save',
  },
  'dispatcher.detail.reassign.cancel': {
    bn: 'বাতিল',
    en: 'Cancel',
  },
  'dispatcher.transition.routed': {
    bn: 'বিভাগে রাউট করুন',
    en: 'Route to department',
  },
  'dispatcher.transition.cancelled': {
    bn: 'রিপোর্ট বাতিল',
    en: 'Cancel report',
  },

  // Bolt 007-002 — Dispatcher crew picker (Intent 007).
  // The picker is the "how" view; the existing
  // `dispatcher.detail.field.crew` read-only row in the record
  // list is the "what" view. Both ship in parallel.
  'dispatcher.assignCrew.heading': {
    bn: 'ক্রু নিয়োগ',
    en: 'Assign crew',
  },
  'dispatcher.assignCrew.label': {
    bn: 'ক্রু সদস্য',
    en: 'Crew member',
  },
  'dispatcher.assignCrew.placeholder': {
    bn: '— নিয়োগ করা হয়নি —',
    en: '— Unassigned —',
  },
  'dispatcher.assignCrew.save': {
    bn: 'সংরক্ষণ',
    en: 'Save',
  },
  'dispatcher.assignCrew.saving': {
    bn: 'সংরক্ষণ হচ্ছে…',
    en: 'Saving…',
  },
  'dispatcher.assignCrew.success': {
    bn: 'ক্রু নিয়োগ আপডেট হয়েছে',
    en: 'Crew assignment updated',
  },
  'dispatcher.assignCrew.error.cross_ward': {
    bn: 'এই ক্রু সদস্য অন্য ওয়ার্ডের — নিয়োগ করা যাবে না',
    en: 'This crew member is in a different ward — cannot assign',
  },
  'dispatcher.assignCrew.error.not_found': {
    bn: 'ক্রু সদস্য পাওয়া যায়নি',
    en: 'Crew member not found',
  },
  'dispatcher.assignCrew.error.save_failed': {
    bn: 'নিযুক্তি সংরক্ষণ ব্যর্থ',
    en: 'Could not save assignment',
  },
  // The crew member is already holding the maximum number of active
  // reports. The UX spec's own 409 copy is "This crew just took
  // another job — pick a different crew."
  'dispatcher.assignCrew.error.at_capacity': {
    bn: 'এই ক্রু সদস্য ইতিমধ্যে ব্যস্ত — অন্য ক্রু নির্বাচন করুন',
    en: 'This crew just took another job — pick a different crew',
  },
  'dispatcher.assignCrew.error.concurrent': {
    bn: 'রিপোর্টটি পরিবর্তিত হয়েছে — আবার চেষ্টা করুন',
    en: 'This report changed — reload and try again',
  },

  // Intent 008 Bolt 008-001 — FR-6 chrome i18n.
  // (The slow-motion demo surfaced these as either missing
  // keys or as the wrong value for an existing key.)
  'dispatcher.assignCrew.none': {
    bn: 'কোনো কর্মী নিযুক্ত নয়',
    en: 'Not assigned',
  },
  'ticket.status.submitted': {
    bn: 'জমা দেওয়া হয়েছে',
    en: 'Submitted',
  },
  'photo.before': {
    bn: 'আগের ছবি',
    en: 'Before photo',
  },
  'photo.after': {
    bn: 'পরের ছবি',
    en: 'After photo',
  },
  'dispatcher.changeWard': {
    bn: 'ওয়ার্ড ও বিভাগ পরিবর্তন',
    en: 'Change ward and department',
  },

  // WO-004 — Dispatcher dedup-decline review (Intent 003, Unit 004)
  'dispatcher.dedup.heading': {
    bn: 'সম্ভাব্য ডুপ্লিকেট রিভিউ',
    en: 'Possible duplicate review',
  },
  'dispatcher.dedup.subtitle': {
    bn: 'নাগরিক যেসব রিপোর্ট ডুপ্লিকেট বলে প্রত্যাখ্যান করেছেন — সিদ্ধান্ত নিন।',
    en: 'Reports the citizen has flagged as NOT duplicates — your call.',
  },
  'dispatcher.dedup.empty.title': {
    bn: 'কোনো পেন্ডিং ফ্ল্যাগ নেই',
    en: 'No pending flags',
  },
  'dispatcher.dedup.empty.subtitle': {
    bn: 'এই মুহূর্তে কোনো নতুন সম্ভাব্য ডুপ্লিকেট নেই।',
    en: 'No new possible duplicates right now.',
  },
  'dispatcher.dedup.row.distance': {
    bn: '{distance}মিটার দূরে',
    en: '{distance}m away',
  },
  'dispatcher.dedup.row.reason': {
    bn: 'নাগরিকের মন্তব্য',
    en: 'Citizen note',
  },
  'dispatcher.dedup.row.confirm': {
    bn: 'ডুপ্লিকেট — বন্ধ করুন',
    en: 'Confirm duplicate',
  },
  'dispatcher.dedup.row.dismiss': {
    bn: 'আলাদা সমস্যা — বাতিল',
    en: 'Dismiss — different issue',
  },
  'dispatcher.dedup.row.confirming': {
    bn: 'নিশ্চিত হচ্ছে…',
    en: 'Confirming…',
  },
  'dispatcher.dedup.row.dismissing': {
    bn: 'বাতিল হচ্ছে…',
    en: 'Dismissing…',
  },
  'dispatcher.dedup.row.error': {
    bn: 'অনুরোধ ব্যর্থ — আবার চেষ্টা করুন',
    en: 'Action failed — try again',
  },
  'dispatcher.dedup.signin_required': {
    bn: 'ডুপ্লিকেট রিভিউ দেখতে লগইন করুন',
    en: 'Sign in to review duplicates',
  },
  'dispatcher.dedup.loading': {
    bn: 'লোড হচ্ছে…',
    en: 'Loading…',
  },
  'dispatcher.dedup.error': {
    bn: 'ফ্ল্যাগ লোড করা যায়নি',
    en: 'Could not load flags',
  },

  // WO-002 (Intent 003, Unit 005) — Dispatcher map view (DISP-007)
  'dispatcher.map.title': {
    bn: 'মানচিত্র',
    en: 'Map',
  },
  'dispatcher.map.subtitle': {
    bn: 'আপনার এলাকায় সক্রিয় রিপোর্টের পিন — স্ট্যাটাস অনুযায়ী রঙ',
    en: 'Active reports in your area — colored by status',
  },
  'dispatcher.map.cta': { bn: 'মানচিত্র', en: 'Map' },
  'dispatcher.map.legend.title': {
    bn: 'পিনের রঙ',
    en: 'Pin color',
  },
  'dispatcher.map.legend.submitted': {
    bn: 'নতুন',
    en: 'Submitted',
  },
  'dispatcher.map.legend.routed': {
    bn: 'রাউট',
    en: 'Routed',
  },
  'dispatcher.map.legend.in_progress': {
    bn: 'চলমান',
    en: 'In progress',
  },
  'dispatcher.map.legend.cluster': {
    bn: 'ক্লাস্টার',
    en: 'Cluster',
  },
  'dispatcher.map.side.title': {
    bn: 'রিপোর্টের সারাংশ',
    en: 'Ticket summary',
  },
  'dispatcher.map.side.view': {
    bn: 'বিস্তারিত দেখুন',
    en: 'View ticket',
  },
  'dispatcher.map.side.close': {
    bn: 'বন্ধ',
    en: 'Close',
  },
  'dispatcher.map.empty': {
    bn: 'এই ফিল্টারে কোনো পিন নেই',
    en: 'No pins match this filter',
  },
  'dispatcher.map.error': {
    bn: 'মানচিত্র লোড করা যায়নি',
    en: 'Could not load the map',
  },

  // WO-002 (Intent 003) — Dispatcher monitor surface (UX spec 2.5)
  'dispatcher.monitor.title': {
    bn: 'লাইভ আপডেট',
    en: 'Live updates',
  },
  'dispatcher.monitor.back': {
    bn: '← ট্রায়াজ সারিতে ফিরে যান',
    en: '← Back to triage queue',
  },
  'dispatcher.monitor.filter.all': { bn: 'সব', en: 'All' },
  'dispatcher.monitor.filter.my_ward': {
    bn: 'আমার ওয়ার্ড',
    en: 'My ward',
  },
  'dispatcher.monitor.filter.my_crews': {
    bn: 'আমার ক্রু',
    en: 'My crews',
  },
  'dispatcher.monitor.new_updates': {
    bn: '{n}টি নতুন আপডেট',
    en: '{n} new updates',
  },
  'dispatcher.monitor.unread_count': {
    bn: '{n}টি অপঠিত',
    en: '{n} unread',
  },
  'dispatcher.monitor.row.activity': {
    bn: '{actor} {status} চিহ্নিত করেছেন {age}',
    en: '{actor} marked {status} {age}',
  },
  'dispatcher.monitor.row.activity_unknown_actor': {
    bn: 'অবস্থা পরিবর্তিত হয়েছে {age}',
    en: 'Status changed {age}',
  },
  'dispatcher.monitor.row.acknowledge': {
    bn: 'আপডেট স্বীকার করা হয়েছে',
    en: 'Acknowledge update',
  },
  'dispatcher.monitor.row.acknowledged': {
    bn: 'স্বীকৃত',
    en: 'Acknowledged',
  },
  'dispatcher.monitor.row.expand': {
    bn: 'সাম্প্রতিক পদক্ষেপ দেখুন',
    en: 'Show recent steps',
  },
  'dispatcher.monitor.row.collapse': {
    bn: 'সাম্প্রতিক পদক্ষেপ লুকান',
    en: 'Hide recent steps',
  },
  'dispatcher.monitor.row.open_detail': {
    bn: 'সম্পূর্ণ রিপোর্ট দেখুন',
    en: 'Open full report',
  },
  'dispatcher.monitor.row.trail_heading': {
    bn: 'সর্বশেষ {n}টি পদক্ষেপ',
    en: 'Last {n} steps',
  },
  'dispatcher.monitor.row.new_photos': {
    bn: '{n}টি নতুন ছবি',
    en: '{n} new photos',
  },
  'dispatcher.monitor.empty.title': {
    bn: 'এই মুহূর্তে কোনো টিকিট আপনার কাছে নেই',
    en: 'No tickets on your queue right now',
  },
  'dispatcher.monitor.empty.subtitle': {
    bn: 'নতুন রিপোর্ট এলে এখানে দেখা যাবে।',
    en: 'New reports will appear here as they arrive.',
  },
  'dispatcher.monitor.empty.link': {
    bn: 'ড্যাশবোর্ডে ফিরে যান',
    en: 'Back to the dashboard',
  },
  'dispatcher.monitor.error': {
    bn: 'লাইভ আপডেট লোড করা যায়নি',
    en: 'Could not load live updates',
  },
  'dispatcher.monitor.paused': {
    bn: 'লাইভ আপডেট বন্ধ',
    en: 'Live updates paused',
  },
  'dispatcher.monitor.signin_required': {
    bn: 'লাইভ আপডেট দেখতে লগইন করুন',
    en: 'Sign in to view live updates',
  },
  'dispatcher.monitor.chart.flow.title': {
    bn: 'আজকের প্রবাহ',
    en: "Today's flow",
  },
  'dispatcher.monitor.chart.response.title': {
    bn: 'গড় প্রতিক্রিয়া সময়',
    en: 'Avg response time',
  },
  'dispatcher.monitor.chart.crew.title': {
    bn: 'ক্রু লোড',
    en: 'Crew load',
  },
  'dispatcher.monitor.chart.flow.table_caption': {
    bn: 'আজকের প্রবাহ — অবস্থা অনুযায়ী টিকিট সংখ্যা',
    en: "Today's flow — ticket count by status",
  },
  'dispatcher.monitor.chart.response.table_caption': {
    bn: 'গড় প্রতিক্রিয়া সময় — গত ৭ দিনের দৈনিক গড় মিনিট',
    en: 'Avg response time — daily average minutes over the last 7 days',
  },
  'dispatcher.monitor.chart.crew.table_caption': {
    bn: 'ক্রু লোড — প্রতি ক্রুর ওপেন টিকিট সংখ্যা',
    en: 'Crew load — open ticket count per crew',
  },
  'dispatcher.monitor.chart.col.status': { bn: 'অবস্থা', en: 'Status' },
  'dispatcher.monitor.chart.col.count': { bn: 'সংখ্যা', en: 'Count' },
  'dispatcher.monitor.chart.col.date': { bn: 'তারিখ', en: 'Date' },
  'dispatcher.monitor.chart.col.minutes': { bn: 'গড় মিনিট', en: 'Avg minutes' },
  'dispatcher.monitor.chart.col.crew': { bn: 'ক্রু', en: 'Crew' },
  'dispatcher.monitor.chart.col.open': { bn: 'ওপেন', en: 'Open' },
  'dispatcher.monitor.chart.no_data': {
    bn: 'এই মুহূর্তে ডেটা নেই',
    en: 'No data right now',
  },
  'dispatcher.monitor.age.now': { bn: 'এইমাত্র', en: 'just now' },
  'dispatcher.monitor.age.minutes': {
    bn: '{n} মিনিট আগে',
    en: '{n} min ago',
  },
  'dispatcher.monitor.age.hours': {
    bn: '{n} ঘণ্টা আগে',
    en: '{n} hr ago',
  },
  'dispatcher.monitor.age.days': {
    bn: '{n} দিন আগে',
    en: '{n} day ago',
  },

  // WO-002 (Intent 003) — Dispatcher performance snapshot (UX spec 2.7)
  'dispatcher.performance.title': {
    bn: 'কর্মক্ষমতা প্রতিবেদন',
    en: 'Performance snapshot',
  },
  'dispatcher.performance.ward_title': {
    bn: 'ওয়ার্ড {ward} · কর্মক্ষমতা প্রতিবেদন',
    en: 'Ward {ward} · Performance snapshot',
  },
  'dispatcher.performance.back': {
    bn: '← ট্রায়াজ সারিতে ফিরে যান',
    en: '← Back to triage queue',
  },
  'dispatcher.performance.range.label': {
    bn: 'সময়সীমা',
    en: 'Date range',
  },
  'dispatcher.performance.range.today': { bn: 'আজ', en: 'Today' },
  'dispatcher.performance.range.last7': {
    bn: 'গত ৭ দিন',
    en: 'Last 7 days',
  },
  'dispatcher.performance.range.last30': {
    bn: 'গত ৩০ দিন',
    en: 'Last 30 days',
  },
  'dispatcher.performance.range.custom': {
    bn: 'নির্দিষ্ট তারিখ',
    en: 'Custom',
  },
  'dispatcher.performance.hero.total': {
    bn: 'মোট রিপোর্ট গৃহীত',
    en: 'Total reports received',
  },
  'dispatcher.performance.hero.resolution_rate': {
    bn: 'সমাধানের হার',
    en: 'Resolution rate',
  },
  'dispatcher.performance.hero.avg_time': {
    bn: 'গড় সমাধানের সময়',
    en: 'Avg time to resolve',
  },
  'dispatcher.performance.hero.delta_vs_previous': {
    bn: 'আগের সময়ের তুলনায়',
    en: 'vs. previous period',
  },
  'dispatcher.performance.hero.no_delta': {
    bn: 'তুলনার তথ্য নেই',
    en: 'No comparison data',
  },
  'dispatcher.performance.chart.submitted_vs_resolved.title': {
    bn: 'জমা ও সমাধানের তুলনা',
    en: 'Submitted vs. resolved over time',
  },
  'dispatcher.performance.chart.submitted_vs_resolved.caption': {
    bn: 'দৈনিক জমা ও সমাধানের সংখ্যা',
    en: 'Daily submitted and resolved counts',
  },
  'dispatcher.performance.chart.category.title': {
    bn: 'বিভাগ অনুযায়ী বিভাজন',
    en: 'Category breakdown',
  },
  'dispatcher.performance.chart.category.caption': {
    bn: 'বিভাগ অনুযায়ী রিপোর্ট সংখ্যা',
    en: 'Report count by category',
  },
  'dispatcher.performance.chart.status.title': {
    bn: 'বর্তমান অবস্থার চিত্র',
    en: 'Status breakdown (current snapshot)',
  },
  'dispatcher.performance.chart.status.caption': {
    bn: 'অবস্থা অনুযায়ী রিপোর্ট সংখ্যা',
    en: 'Report count by status',
  },
  'dispatcher.performance.chart.col.date': { bn: 'তারিখ', en: 'Date' },
  'dispatcher.performance.chart.col.submitted': {
    bn: 'জমা',
    en: 'Submitted',
  },
  'dispatcher.performance.chart.col.resolved': {
    bn: 'সমাধান',
    en: 'Resolved',
  },
  'dispatcher.performance.chart.col.category': { bn: 'বিভাগ', en: 'Category' },
  'dispatcher.performance.chart.col.count': { bn: 'সংখ্যা', en: 'Count' },
  'dispatcher.performance.chart.col.status': { bn: 'অবস্থা', en: 'Status' },
  'dispatcher.performance.crew.title': {
    bn: 'ক্রু কর্মক্ষমতা',
    en: 'Crew performance',
  },
  'dispatcher.performance.crew.col.name': { bn: 'ক্রুর নাম', en: 'Crew name' },
  'dispatcher.performance.crew.col.specialty': {
    bn: 'বিশেষজ্ঞতা',
    en: 'Specialty',
  },
  'dispatcher.performance.crew.col.jobs': {
    bn: 'সম্পন্ন কাজ',
    en: 'Jobs completed',
  },
  'dispatcher.performance.crew.col.avg_time': {
    bn: 'গড় সমাধানের সময়',
    en: 'Avg time to resolve',
  },
  'dispatcher.performance.crew.col.feedback': {
    bn: 'নাগরিক প্রতিক্রিয়া',
    en: 'Citizen feedback',
  },
  'dispatcher.performance.crew.feedback.ratio': {
    bn: '{positive}টি ইতিবাচক / {negative}টি নেতিবাচক',
    en: '{positive} positive / {negative} negative',
  },
  'dispatcher.performance.crew.feedback.not_enough_data': {
    bn: 'পর্যাপ্ত তথ্য নেই',
    en: 'Not enough data',
  },
  'dispatcher.performance.crew.low_feedback_badge': {
    bn: 'কম প্রতিক্রিয়া',
    en: 'Low feedback',
  },
  'dispatcher.performance.crew.specialty_unknown': {
    bn: 'নির্দিষ্ট নয়',
    en: 'Unspecified',
  },
  'dispatcher.performance.crew.empty': {
    bn: 'এই ওয়ার্ডে কোনো ক্রু নেই',
    en: 'No crews in this ward',
  },
  'dispatcher.performance.long_tail.title': {
    bn: 'দীর্ঘস্থায়ী অমীমাণাইত রিপোর্ট',
    en: 'Long-tail unresolved reports',
  },
  'dispatcher.performance.long_tail.empty': {
    bn: 'এই মুহূর্তে কোনো পুরোনো খোলা রিপোর্ট নেই',
    en: 'No long-tail unresolved reports right now',
  },
  'dispatcher.performance.long_tail.col.ticket': {
    bn: 'রিপোর্ট আইডি',
    en: 'Ticket ID',
  },
  'dispatcher.performance.long_tail.col.category': {
    bn: 'বিভাগ',
    en: 'Category',
  },
  'dispatcher.performance.long_tail.col.submitted': {
    bn: 'জমার সময়',
    en: 'Submitted',
  },
  'dispatcher.performance.long_tail.col.age': { bn: 'বয়স', en: 'Age' },
  'dispatcher.performance.long_tail.col.crew': {
    bn: 'নিয়োজিত ক্রু',
    en: 'Assigned crew',
  },
  'dispatcher.performance.long_tail.unassigned': {
    bn: 'নিয়োজিত নয়',
    en: 'Unassigned',
  },
  'dispatcher.performance.export.pdf': {
    bn: 'PDF হিসেবে রপ্তানি করুন',
    en: 'Export as PDF',
  },
  'dispatcher.performance.export.pdf_preparing': {
    bn: 'PDF তৈরি হচ্ছে…',
    en: 'Preparing your PDF…',
  },
  'dispatcher.performance.export.csv': {
    bn: 'CSV ডাউনলোড',
    en: 'Download CSV',
  },
  'dispatcher.performance.empty': {
    bn: 'এই সময়ে কোনো রিপোর্ট নেই',
    en: 'No reports in this period',
  },
  'dispatcher.performance.error': {
    bn: 'প্রতিবেদন লোড করা যায়নি',
    en: 'Could not load the snapshot',
  },
  'dispatcher.performance.signin_required': {
    bn: 'প্রতিবেদন দেখতে লগইন করুন',
    en: 'Sign in to view the snapshot',
  },
  'dispatcher.performance.loading': {
    bn: 'প্রতিবেদন তৈরি হচ্ছে…',
    en: 'Preparing the snapshot…',
  },
  'dispatcher.performance.duration.days': { bn: '{n} দিন', en: '{n} d' },
  'dispatcher.performance.duration.hours': {
    bn: '{n} ঘণ্টা',
    en: '{n} h',
  },
  'dispatcher.performance.duration.minutes': {
    bn: '{n} মিনিট',
    en: '{n} m',
  },
  'status.heading': {
    bn: 'অবস্থা',
    en: 'Status',
  },

  // WO-004 (Intent 005) — Admin surfaces (WebAuthn ceremony)
  // Bolt 005-001: the client ceremony UI. Both locales are
  // fully authored (the bolt does not rely on a fallback).
  'admin.webauthn.title': {
    bn: 'নিরাপত্তা কী দিয়ে সাইন ইন',
    en: 'Sign in with security key',
  },
  'admin.webauthn.instruction': {
    bn: 'নিরাপত্তা কী ঢোকান, তারপর বোতাম চাপুন',
    en: 'Insert your security key, then tap the button',
  },
  'admin.webauthn.error.no_credential': {
    bn: 'কোনো নিরাপত্তা কী নিবন্ধিত নেই। প্রশাসকের সাথে যোগাযোগ করুন।',
    en: 'No security key registered. Contact your administrator.',
  },
  'admin.webauthn.error.expired': {
    bn: 'যাচাইকরণের মেয়াদ শেষ। আবার চেষ্টা করুন।',
    en: 'Assertion expired. Try again.',
  },
  'admin.webauthn.success': {
    bn: 'নিরাপত্তা কী যাচাই সম্পন্ন',
    en: 'Security key verified',
  },

  // Registration ceremony (Bolt 005-001 shipped the ASSERTION
  // copy above; the REGISTRATION copy is its own key set because
  // the two flows say different things to the admin — one asks
  // for a key to sign in, the other asks them to ENROL one so
  // every future admin write can be attested).
  'admin.webauthn.register.title': {
    bn: 'নিরাপত্তা কী নিবন্ধন করুন',
    en: 'Register a security key',
  },
  'admin.webauthn.register.instruction': {
    bn: 'আপনার ডিভাইসের নিরাপত্তা কী ব্যবহার করুন, তারপর বোতাম চাপুন',
    en: 'Use your device’s security key, then tap the button',
  },
  'admin.webauthn.register.heading': {
    bn: 'নিরাপত্তা কী',
    en: 'Security key',
  },
  'admin.webauthn.register.body': {
    bn: 'প্রতিটি প্রশাসকীয় পরিবর্তনের আগে নিরাপত্তা কী দিয়ে যাচাই করতে হয়। একটি নিবন্ধন করলে আপনি এই শহরের সব পরিবর্তন করতে পারবেন।',
    en: 'Every admin change must be verified with a security key. Register one to manage this city.',
  },
  'admin.webauthn.register.done': {
    bn: 'নিরাপত্তা কী নিবন্ধিত হয়েছে',
    en: 'Security key registered',
  },
  'admin.webauthn.register.error': {
    bn: 'নিরাপত্তা কী নিবন্ধন করা যায়নি। আবার চেষ্টা করুন।',
    en: 'Could not register the security key. Try again.',
  },

  // Step-up ceremony (ADR-007). The admin is ALREADY signed in; the
  // step-up proves possession of the authenticator for ONE write.
  // The copy says "verify", not "sign in" — the admin is not signing
  // in again, and telling them they were would be wrong.
  'admin.webauthn.step_up.title': {
    bn: 'নিরাপত্তা কী দিয়ে যাচাই করুন',
    en: 'Verify with your security key',
  },
  'admin.webauthn.step_up.instruction': {
    bn: 'নিরাপত্তা কী ঢোকান, তারপর বোতাম চাপুন',
    en: 'Insert your security key, then tap the button',
  },
  'admin.webauthn.step_up.done': {
    bn: 'যাচাই সম্পন্ন — এখন পরিবর্তনটি করা যাচ্ছে',
    en: 'Verified — you can now make the change',
  },
  'admin.webauthn.step_up.error.no_credential': {
    bn: 'কোনো নিরাপত্তা কী নিবন্ধিত নেই। প্রথমে নিরাপত্তা কী নিবন্ধন করুন।',
    en: 'No security key registered. Register one first.',
  },
  'admin.webauthn.step_up.error.expired': {
    bn: 'যাচাইকরণের মেয়াদ শেষ। আবার চেষ্টা করুন।',
    en: 'Assertion expired. Try again.',
  },
  'admin.webauthn.step_up.error.failed': {
    bn: 'নিরাপত্তা কী যাচাই করা যায়নি। আবার চেষ্টা করুন।',
    en: 'Could not verify the security key. Try again.',
  },
  // The banner shown above a gated write once the admin has no
  // credential at all — it points at the registration mount point
  // rather than leaving a bare error code with no path forward.
  'admin.webauthn.step_up.register_hint': {
    bn: 'প্রশাসকীয় পরিবর্তনের জন্য প্রথমে নিরাপত্তা কী নিবন্ধন করুন।',
    en: 'Register a security key first to make admin changes.',
  },

  // Intent 005 (Unit 002) — Admin city-config surfaces
  'admin.cities.title': { bn: 'শহরসমূহ', en: 'Cities' },
  'admin.cities.subtitle': {
    bn: 'আপনি যেসব শহর পরিচালনা করেন',
    en: 'Cities you administer',
  },
  'admin.cities.status.live': { bn: 'সক্রিয়', en: 'Live' },
  'admin.cities.status.setup': {
    bn: 'সেটআপ চলমান',
    en: 'Setup in progress',
  },
  'admin.cities.status.paused': { bn: 'বিরতি', en: 'Paused' },
  'admin.cities.col.name': { bn: 'নাম', en: 'Name' },
  'admin.cities.col.status': { bn: 'অবস্থা', en: 'Status' },
  'admin.cities.col.dispatchers': {
    bn: 'ডিসপ্যাচার',
    en: 'Dispatchers',
  },
  'admin.cities.col.crews': { bn: 'ক্রু', en: 'Crews' },
  'admin.cities.col.ticketsPerDay': {
    bn: 'প্রতিদিনের রিপোর্ট',
    en: 'Reports / day',
  },
  'admin.cities.col.wards': { bn: 'ওয়ার্ড', en: 'Wards' },
  'admin.cities.col.categories': { bn: 'বিভাগ', en: 'Categories' },
  'admin.cities.col.departments': { bn: 'বিভাগ', en: 'Departments' },
  'admin.cities.cta.newCity': { bn: 'নতুন শহর', en: 'Set up new city' },
  'admin.cities.cta.view': { bn: 'দেখুন', en: 'View' },
  'admin.cities.empty': {
    bn: 'কোনো শহর নেই। "নতুন শহর" বোতাম চাপুন।',
    en: 'No cities yet. Click "Set up new city" to add one.',
  },
  'admin.cities.viewAdoption': {
    bn: 'গ্রহণযোগ্যতা দেখুন',
    en: 'View adoption',
  },

  // Intent 005 (Unit 003) — User provisioning (4.6) + Adoption dashboard (4.7)
  'admin.users.title': { bn: 'ব্যবহারকারী প্রস্তুত করুন', en: 'User provisioning' },
  'admin.users.subtitle': {
    bn: 'ডিসপ্যাচার, ক্রু ও সুপারভাইজার যোগ করুন এবং সেটআপ শেষ করুন',
    en: 'Add dispatchers, crews and supervisors, then finish setup',
  },
  'admin.users.back': { bn: 'শহরে ফিরুন', en: 'Back to city' },
  'admin.users.tab.all': { bn: 'সব', en: 'All' },
  'admin.users.tab.dispatcher': { bn: 'ডিসপ্যাচার', en: 'Dispatchers' },
  'admin.users.tab.crew': { bn: 'ক্রু', en: 'Crew' },
  'admin.users.tab.supervisor': {
    bn: 'সুপারভাইজার',
    en: 'Supervisors',
  },
  'admin.users.role.dispatcher': { bn: 'ডিসপ্যাচার', en: 'Dispatcher' },
  'admin.users.role.crew': { bn: 'ক্রু', en: 'Crew' },
  'admin.users.role.supervisor': {
    bn: 'সুপারভাইজার',
    en: 'Supervisor',
  },
  'admin.users.status.active': { bn: 'সক্রিয়', en: 'Active' },
  'admin.users.status.invited': { bn: 'আমন্ত্রিত', en: 'Invited' },
  'admin.users.status.disabled': { bn: 'নিষ্ক্রিয়', en: 'Disabled' },
  'admin.users.cta.add': { bn: 'ব্যবহারকারী যোগ করুন', en: 'Add user' },
  'admin.users.cta.bulkImport': {
    bn: 'CSV বাল্ক ইমপোর্ট',
    en: 'CSV bulk import',
  },
  'admin.users.cta.downloadTemplate': {
    bn: 'টেমপ্লেট ডাউনলোড',
    en: 'Download template',
  },
  'admin.users.cta.launch': { bn: 'সেটআপ সম্পূর্ণ — শহর চালু করুন', en: 'Setup complete — launch city' },
  'admin.users.cta.skip': { bn: 'এখনই নয়', en: 'Not now' },
  'admin.users.cta.save': { bn: 'সংরক্ষণ', en: 'Save' },
  'admin.users.cta.cancel': { bn: 'বাতিল', en: 'Cancel' },
  'admin.users.cta.delete': { bn: 'মুছুন', en: 'Delete' },
  'admin.users.cta.autoGenerate': {
    bn: 'স্বয়ংক্রিয়ভাবে তৈরি করুন',
    en: 'Auto-generate',
  },
  'admin.users.form.nameBn': { bn: 'বাংলা নাম', en: 'Bangla name' },
  'admin.users.form.nameEn': { bn: 'ইংরেজি নাম', en: 'English name' },
  'admin.users.form.identifier': {
    bn: 'স্টাফ আইডি বা মোবাইল',
    en: 'Staff ID or mobile',
  },
  'admin.users.form.email': { bn: 'ইমেইল', en: 'Email' },
  'admin.users.form.role': { bn: 'ভূমিকা', en: 'Role' },
  'admin.users.form.wards': { bn: 'ওয়ার্ড', en: 'Wards' },
  'admin.users.form.crew': { bn: 'ক্রু', en: 'Crew' },
  'admin.users.form.department': { bn: 'বিভাগ', en: 'Department' },
  'admin.users.form.password': {
    bn: 'প্রাথমিক পাসওয়ার্ড',
    en: 'Initial password',
  },
  'admin.users.form.password.hint': {
    bn: 'কমপক্ষে ৮ অক্ষর, বড় ও ছোট হাতের অক্ষর এবং একটি সংখ্যা',
    en: 'At least 8 characters, with upper case, lower case and a digit',
  },
  'admin.users.form.status': { bn: 'অবস্থা', en: 'Status' },
  'admin.users.form.supervisor.note': {
    bn: 'সুপারভাইজার সব শহর দেখতে পারেন কিন্তু কোনো ওয়ার্ড বা বিভাগে নিয়োগ করা হয় না।',
    en: 'Supervisors see the whole city but are not scoped to any ward or department.',
  },
  'admin.users.empty': {
    bn: 'এখনো কোনো ব্যবহারকারী যোগ করা হয়নি',
    en: 'No users have been added yet',
  },
  'admin.users.lastLogin.never': { bn: 'কখনো লগইন করেননি', en: 'Never signed in' },
  'admin.users.lastLogin.at': { bn: 'সর্বশেষ লগইন', en: 'Last login' },
  'admin.users.notAssigned': { bn: 'নিয়োগ করা হয়নি', en: 'Not assigned' },
  'admin.users.import.title': { bn: 'CSV বাল্ক ইমপোর্ট', en: 'CSV bulk import' },
  'admin.users.import.columns': {
    bn: 'কলাম: name_bn, name_en, identifier, email, role, wards_or_crew, department',
    en: 'Columns: name_bn, name_en, identifier, email, role, wards_or_crew, department',
  },
  'admin.users.import.row': { bn: 'সারি', en: 'Row' },
  'admin.users.import.success': {
    bn: 'ব্যবহারকারী যোগ হয়েছে',
    en: 'users added',
  },
  'admin.users.import.failed': { bn: 'ব্যর্থ', en: 'failed' },
  'admin.users.import.close': { bn: 'বন্ধ করুন', en: 'Close' },
  'admin.users.launch.disabled': {
    bn: 'শহর চালু করতে অন্তত একজন ডিসপ্যাচার ও একটি ক্রু দরকার',
    en: 'At least one dispatcher and one crew are needed to launch the city',
  },
  'admin.users.webauthn.required': {
    bn: 'এই কাজের জন্য হার্ডওয়্যার কী দরকার',
    en: 'This action requires your hardware key',
  },

  'admin.adoption.title': {
    bn: 'গ্রহণযোগ্যতা ড্যাশবোর্ড',
    en: 'Adoption dashboard',
  },
  'admin.adoption.back': { bn: 'শহরে ফিরুন', en: 'Back to city' },
  'admin.adoption.range.label': { bn: 'সময়সীমা', en: 'Date range' },
  'admin.adoption.range.7d': { bn: 'গত ৭ দিন', en: 'Last 7 days' },
  'admin.adoption.range.30d': { bn: 'গত ৩০ দিন', en: 'Last 30 days' },
  'admin.adoption.range.sinceLaunch': {
    bn: 'চালুর পর থেকে',
    en: 'Since launch',
  },
  'admin.adoption.range.custom': { bn: 'নির্দিষ্ট', en: 'Custom' },
  'admin.adoption.hero.registeredCitizens': {
    bn: 'নিবন্ধিত নাগরিক',
    en: 'Registered citizens',
  },
  'admin.adoption.hero.reportsReceived': {
    bn: 'প্রাপ্ত রিপোর্ট',
    en: 'Reports received',
  },
  'admin.adoption.hero.resolutionRate': {
    bn: 'সমাধানের হার',
    en: 'Resolution rate',
  },
  'admin.adoption.hero.avgTimeToResolve': {
    bn: 'গড় সমাধান সময়',
    en: 'Avg time to resolve',
  },
  'admin.adoption.hero.delta.up': { bn: 'বৃদ্ধি', en: 'up' },
  'admin.adoption.hero.delta.down': { bn: 'হ্রাস', en: 'down' },
  'admin.adoption.hero.delta.flat': { bn: 'অপরিবর্তিত', en: 'no change' },
  'admin.adoption.hero.delta.none': {
    bn: 'তুলনার তথ্য নেই',
    en: 'no comparison',
  },
  'admin.adoption.funnel.title': { bn: 'গ্রহণ ফানেল', en: 'Adoption funnel' },
  'admin.adoption.funnel.visit': { bn: 'ভিজিট', en: 'Visit' },
  'admin.adoption.funnel.registered': {
    bn: 'নিবন্ধিত',
    en: 'Registered',
  },
  'admin.adoption.funnel.submitted': { bn: 'রিপোর্ট জমা', en: 'Submitted' },
  'admin.adoption.funnel.secondReport': {
    bn: 'দ্বিতীয় রিপোর্ট',
    en: '2nd report',
  },
  'admin.adoption.funnel.feedback': {
    bn: 'মতামত দিয়েছেন',
    en: 'Gave feedback',
  },
  'admin.adoption.funnel.conversion': { bn: 'রূপান্তর', en: 'Conversion' },
  'admin.adoption.funnel.stageCount': { bn: 'জন', en: 'people' },
  'admin.adoption.funnel.tableCaption': {
    bn: 'গ্রহণ ফানেলের সংখ্যা ও রূপান্তরের হার',
    en: 'Adoption funnel stage counts and conversion rates',
  },
  'admin.adoption.daily.title': { bn: 'দৈনিক কার্যকলাপ', en: 'Daily activity' },
  'admin.adoption.daily.submitted': { bn: 'জমা', en: 'Submitted' },
  'admin.adoption.daily.resolved': { bn: 'সমাধান', en: 'Resolved' },
  'admin.adoption.daily.registered': { bn: 'নিবন্ধিত', en: 'Registered' },
  'admin.adoption.daily.tableCaption': {
    bn: 'দৈনিক জমা, সমাধান ও নিবন্ধনের সংখ্যা',
    en: 'Daily submitted, resolved and registered counts',
  },
  'admin.adoption.heatmap.title': { bn: 'ওয়ার্ড তাপমাত্রা মানচিত্র', en: 'Ward heatmap' },
  'admin.adoption.heatmap.tableCaption': {
    bn: 'ওয়ার্ড অনুযায়ী রিপোর্টের সংখ্যা',
    en: 'Report counts by ward',
  },
  'admin.adoption.heatmap.legend.none': { bn: 'কোনো রিপোর্ট নেই', en: 'No reports' },
  'admin.adoption.heatmap.legend.high': { bn: 'সর্বাধিক', en: 'Highest' },
  'admin.adoption.heatmap.reports': { bn: 'রিপোর্ট', en: 'reports' },
  'admin.adoption.engagement.title': {
    bn: 'সম্পৃক্ততার সংকেত',
    en: 'Engagement signals',
  },
  'admin.adoption.engagement.staffActivity': {
    bn: 'কর্মীদের সক্রিয়তা',
    en: 'Staff activity',
  },
  'admin.adoption.engagement.citizenRetention': {
    bn: 'নাগরিক ধরে রাখা',
    en: 'Citizen retention',
  },
  'admin.adoption.engagement.crewResponseTime': {
    bn: 'ক্রুর সাড়া দেওয়ার সময়',
    en: 'Crew response time',
  },
  'admin.adoption.engagement.staffActivity.detail': {
    bn: 'গত ৭ দিনে অন্তত একবার সক্রিয় কর্মীর হার',
    en: 'Share of staff active at least once in the last 7 days',
  },
  'admin.adoption.engagement.citizenRetention.detail': {
    bn: '৩০ দিনের মধ্যে দ্বিতীয় রিপোর্ট করা নাগরিকের হার',
    en: 'Share of citizens who filed a second report within 30 days',
  },
  'admin.adoption.engagement.crewResponseTime.detail': {
    bn: 'রাউট থেকে কাজ শুরু পর্যন্ত মধ্যম সময়',
    en: 'Median time from routed to in-progress',
  },
  'admin.adoption.health.title': { bn: 'স্বাস্থ্য সংকেত', en: 'Health flags' },
  'admin.adoption.health.none': {
    bn: 'কোনো সমস্যা পাওয়া যায়নি',
    en: 'No health issues detected',
  },
  'admin.adoption.health.stale_dispatchers': {
    bn: 'জন ডিসপ্যাচার ৭ দিন ধরে লগইন করেননি',
    en: 'dispatchers have not signed in for 7 days',
  },
  'admin.adoption.health.unassigned_backlog': {
    bn: 'টিকিট ৭ দিনের বেশি অনিয়োজিত',
    en: 'tickets have been unassigned for 7+ days',
  },
  'admin.adoption.health.silent_ward': {
    bn: 'ওয়ার্ড ১৪ দিন ধরে কোনো রিপোর্ট পায়নি',
    en: 'has had no reports in 14 days',
  },
  'admin.adoption.cta.exportPdf': { bn: 'PDF রপ্তানি', en: 'Export PDF' },
  'admin.adoption.cta.exportCsv': { bn: 'CSV রপ্তানি', en: 'Export CSV' },
  'admin.adoption.cta.preparingPdf': {
    bn: 'প্রস্তুত হচ্ছে...',
    en: 'Preparing...',
  },
  'admin.adoption.compare.toggle': {
    bn: 'ঢাকার সাথে তুলনা করুন',
    en: 'Compare with Dhaka',
  },
  'admin.adoption.compare.dhaka': { bn: 'ঢাকা', en: 'Dhaka' },
  'admin.adoption.compare.legend': {
    bn: 'আপনার শহর',
    en: 'Your city',
  },
  'admin.adoption.empty': {
    bn: 'এই সময়সীমায় কোনো তথ্য নেই',
    en: 'No data in this period',
  },
  'admin.adoption.error': {
    bn: 'তথ্য লোড করা যায়নি',
    en: 'Could not load dashboard data',
  },

  'admin.setup.title': { bn: 'শহর সেটআপ', en: 'City setup' },
  'admin.setup.field.name': { bn: 'নাম', en: 'Name' },
  'admin.setup.field.nameBn': { bn: 'বাংলা নাম', en: 'Bangla name' },
  'admin.setup.field.defaultLanguage': {
    bn: 'ডিফল্ট ভাষা',
    en: 'Default language',
  },
  'admin.setup.field.timezone': { bn: 'সময় অঞ্চল', en: 'Timezone' },
  'admin.setup.field.contactEmail': {
    bn: 'যোগাযোগের ইমেইল',
    en: 'Contact email',
  },
  'admin.setup.applyDhakaTemplate': {
    bn: 'ঢাকা টেমপ্লেট প্রয়োগ করুন',
    en: 'Apply Dhaka template',
  },
  'admin.setup.applyDhakaTemplate.confirm': {
    bn: 'এটি ঢাকার বিভাগ, ক্যাটাগরি ও ওয়ার্ড টেমপ্লেট এই শহরে যোগ করবে। বিদ্যমান সারি সংরক্ষিত থাকবে।',
    en: 'This will add the Dhaka template of departments, categories, and ward template to this city. Existing rows are preserved.',
  },
  'admin.setup.cta.save': { bn: 'সংরক্ষণ', en: 'Save' },

  'admin.taxonomy.title': {
    bn: 'বিভাগ ও ক্যাটাগরি',
    en: 'Departments & categories',
  },
  'admin.taxonomy.dedupRadius': {
    bn: 'ডিডাপ ব্যাসার্ধ (মিটার)',
    en: 'Dedup radius (m)',
  },
  'admin.taxonomy.dedupRadius.helper': {
    bn: 'একই অবস্থানের কাছাকাছি রিপোর্টকে ডিডাপ হিসেবে চিহ্নিত করার দূরত্ব',
    en: 'Distance within which nearby reports are flagged as duplicates',
  },
  'admin.taxonomy.departments': { bn: 'বিভাগ', en: 'Departments' },
  'admin.taxonomy.categories': { bn: 'ক্যাটাগরি', en: 'Categories' },
  'admin.taxonomy.col.name': { bn: 'নাম', en: 'Name' },
  'admin.taxonomy.col.slug': { bn: 'স্লাগ', en: 'Slug' },
  'admin.taxonomy.col.department': { bn: 'বিভাগ', en: 'Department' },
  'admin.taxonomy.form.name': { bn: 'নাম', en: 'Name' },
  'admin.taxonomy.form.slug': { bn: 'স্লাগ', en: 'Slug' },
  'admin.taxonomy.form.none': { bn: '(কোনোটি নয়)', en: '(none)' },
  'admin.taxonomy.cta.newDept': {
    bn: 'নতুন বিভাগ',
    en: 'New department',
  },
  'admin.taxonomy.cta.newCat': {
    bn: 'নতুন ক্যাটাগরি',
    en: 'New category',
  },
  'admin.taxonomy.orphanWarning': {
    bn: 'এই বিভাগে {n}টি ক্যাটাগরি আবদ্ধ আছে। মুছে ফেলার আগে সেগুলো অন্য বিভাগে সরান।',
    en: 'This department has {n} categories. Move them to another department before deleting.',
  },
  'admin.taxonomy.narrowCategory': {
    bn: 'সংকীর্ণ ক্যাটাগরি',
    en: 'Narrow category',
  },
  'admin.taxonomy.photoCap': {
    bn: 'ছবির সীমা',
    en: 'Photo cap',
  },
  'admin.taxonomy.deptContact': {
    bn: 'যোগাযোগের তথ্য',
    en: 'Contact info',
  },
  'admin.taxonomy.saveDedup': { bn: 'সংরক্ষণ', en: 'Save' },

  'admin.wards.title': {
    bn: 'ওয়ার্ড ও সীমানা',
    en: 'Wards & boundaries',
  },
  'admin.wards.col.name': { bn: 'নাম', en: 'Name' },
  'admin.wards.col.polygon': { bn: 'বহুভুজ', en: 'Polygon' },
  'admin.wards.form.name': { bn: 'নাম', en: 'Name' },
  'admin.wards.form.polygon': {
    bn: 'বহুভুজ (GeoJSON)',
    en: 'Polygon (GeoJSON)',
  },
  'admin.wards.cta.newWard': { bn: 'নতুন ওয়ার্ড', en: 'New ward' },
  'admin.wards.cta.save': { bn: 'ওয়ার্ড সংরক্ষণ', en: 'Save ward' },
  'admin.wards.cta.cancel': { bn: 'বাতিল', en: 'Cancel' },
  'admin.wards.cta.delete': { bn: 'মুছুন', en: 'Delete' },
  'admin.wards.cta.edit': { bn: 'সম্পাদনা', en: 'Edit' },
  'admin.wards.preview': {
    bn: 'প্রকাশের আগে পূর্বরূপ',
    en: 'Preview before publish',
  },
  'admin.wards.legend.published': {
    bn: 'প্রকাশিত',
    en: 'Published',
  },
  'admin.wards.legend.draft': { bn: 'খসড়া', en: 'Draft' },
  'admin.wards.legend.dhaka': { bn: 'ঢাকা জেলা', en: 'Dhaka district' },
  'admin.wards.instruction': {
    bn: 'মানচিত্রে ক্লিক করে ওয়ার্ডের সীমানা আঁকুন, তারপর সংরক্ষণ বোতাম চাপুন।',
    en: 'Click on the map to draw the ward boundary, then click Save.',
  },
  'admin.wards.error.notClosed': {
    bn: 'বহুভুজ বন্ধ হয়নি। প্রথম বিন্দুতে ফিরে ক্লিক করুন।',
    en: 'Polygon not closed. Click the first vertex to close.',
  },
  'admin.wards.delete.confirm': {
    bn: 'এই ওয়ার্ড মুছে ফেলতে চান?',
    en: 'Delete this ward?',
  },

  'admin.confirm.title': { bn: 'নিশ্চিত করুন', en: 'Confirm' },
  'admin.confirm.cta.confirm': { bn: 'নিশ্চিত', en: 'Confirm' },
  'admin.confirm.cta.cancel': { bn: 'বাতিল', en: 'Cancel' },

  'admin.dedup.outOfRange': {
    bn: 'ডিডাপ ব্যাসার্ধ ১ থেকে ৫০০ মিটারের মধ্যে হতে হবে।',
    en: 'Dedup radius must be between 1 and 500 meters.',
  },

  // WO-005 (Intent 005, Unit 004) — Audit dashboard (Bolt 005-004)
  'admin.audit.title': { bn: 'অডিট লগ', en: 'Audit log' },
  'admin.audit.subtitle': {
    bn: 'প্ল্যাটফর্মের সব স্টেট-পরিবর্তনের অডিট ট্রেইল।',
    en: 'Audit trail for every state change on the platform.',
  },
  'admin.audit.col.timestamp': { bn: 'সময়', en: 'Timestamp' },
  'admin.audit.col.actor': { bn: 'কে', en: 'Actor' },
  'admin.audit.col.action': { bn: 'কাজ', en: 'Action' },
  'admin.audit.col.entityType': { bn: 'এন্টিটি', en: 'Entity' },
  'admin.audit.col.entityId': { bn: 'আইডি', en: 'ID' },
  'admin.audit.col.details': { bn: 'বিস্তারিত', en: 'Details' },
  'admin.audit.filter.actor': {
    bn: 'অভিনেতা (ID)',
    en: 'Actor (ID)',
  },
  'admin.audit.filter.action': { bn: 'কাজ', en: 'Action' },
  'admin.audit.filter.entityType': { bn: 'এন্টিটি ধরন', en: 'Entity type' },
  'admin.audit.filter.from': { bn: 'শুরু', en: 'From' },
  'admin.audit.filter.to': { bn: 'শেষ', en: 'To' },
  'admin.audit.filter.apply': { bn: 'প্রয়োগ', en: 'Apply' },
  'admin.audit.filter.reset': { bn: 'রিসেট', en: 'Reset' },
  'admin.audit.empty': { bn: 'কোনো অডিট এন্ট্রি নেই', en: 'No audit entries' },
  'admin.audit.error': {
    bn: 'অডিট লোড করা যায়নি',
    en: 'Could not load audit log',
  },
  'admin.audit.loading': { bn: 'লোড হচ্ছে...', en: 'Loading...' },
  'admin.audit.loadMore': { bn: 'আরো লোড করুন', en: 'Load more' },
  'admin.audit.back': {
    bn: '← শহরসমূহে ফিরুন',
    en: '← Back to cities',
  },
  'admin.audit.expand.before': { bn: 'আগে', en: 'Before' },
  'admin.audit.expand.after': { bn: 'পরে', en: 'After' },

  // Bolt admin-tickets — Reports list + detail (admin /admin/tickets).
  // Read-mostly surface; admin can transition status and reassign crew
  // (the writes go through the existing shared /api/tickets/:id/transition
  // route — this page is a frontend on top of the same machinery the
  // dispatcher/crew surfaces use).
  'admin.tickets.title': { bn: 'রিপোর্টসমূহ', en: 'Reports' },
  'admin.tickets.subtitle': {
    bn: 'এই শহরের সব রিপোর্ট',
    en: 'All reports in this city',
  },
  'admin.tickets.back': {
    bn: '← শহরসমূহে ফিরুন',
    en: '← Back to cities',
  },
  'admin.tickets.filter.status': { bn: 'অবস্থা', en: 'Status' },
  'admin.tickets.filter.statusAll': { bn: 'সব', en: 'All' },
  'admin.tickets.filter.city': { bn: 'শহর', en: 'City' },
  'admin.tickets.filter.category': { bn: 'ক্যাটাগরি', en: 'Category' },
  'admin.tickets.filter.ward': { bn: 'ওয়ার্ড', en: 'Ward' },
  'admin.tickets.filter.id': { bn: 'রিপোর্ট আইডি', en: 'Report ID' },
  'admin.tickets.filter.from': { bn: 'শুরু', en: 'From' },
  'admin.tickets.filter.to': { bn: 'শেষ', en: 'To' },
  'admin.tickets.filter.apply': { bn: 'প্রয়োগ', en: 'Apply' },
  'admin.tickets.filter.reset': { bn: 'মুছুন', en: 'Reset' },
  'admin.tickets.col.id': { bn: 'আইডি', en: 'ID' },
  'admin.tickets.col.status': { bn: 'অবস্থা', en: 'Status' },
  'admin.tickets.col.category': { bn: 'ক্যাটাগরি', en: 'Category' },
  'admin.tickets.col.ward': { bn: 'ওয়ার্ড', en: 'Ward' },
  'admin.tickets.col.reporter': { bn: 'প্রতিবেদক', en: 'Reporter' },
  'admin.tickets.col.assigned': { bn: 'নিযুক্ত ক্রু', en: 'Assigned crew' },
  'admin.tickets.col.created': { bn: 'তৈরি হয়েছে', en: 'Created' },
  'admin.tickets.empty': { bn: 'কোনো রিপোর্ট নেই', en: 'No reports' },
  'admin.tickets.error': {
    bn: 'রিপোর্ট লোড করা যায়নি',
    en: 'Could not load reports',
  },
  'admin.tickets.loading': { bn: 'লোড হচ্ছে...', en: 'Loading...' },
  'admin.tickets.loadMore': { bn: 'আরো লোড করুন', en: 'Load more' },
  'admin.tickets.transition.cta': {
    bn: 'অবস্থা পরিবর্তন করুন',
    en: 'Change status',
  },
  'admin.tickets.reassign.cta': {
    bn: 'ক্রু পুনর্নির্ধারণ',
    en: 'Reassign crew',
  },
  'admin.tickets.reassign.placeholder': {
    bn: 'ক্রু আইডি (user_...)',
    en: 'Crew ID (user_...)',
  },
  'admin.tickets.detail.back': {
    bn: '← রিপোর্ট তালিকায়',
    en: '← Back to reports',
  },
  'admin.tickets.detail.meta': {
    bn: 'এই রিপোর্টের অডিট লগ দেখুন',
    en: 'View audit log for this report',
  },
  'admin.tickets.detail.trail': { bn: 'অগ্রগতি', en: 'Progress' },
  'admin.tickets.detail.note': { bn: 'অভ্যন্তরীণ নোট', en: 'Internal note' },
  'admin.tickets.detail.citizenNote': {
    bn: 'নাগরিকের নোট',
    en: 'Citizen note',
  },

  // Admin landing page (/admin) — the admin's home.
  //
  // `app/admin/` originally had NO index route, so `GET /admin` was
  // a 404 while its three children (/admin/tickets, /admin/audit,
  // /admin/cities) all resolved. This block backs the index page
  // that closes that gap: a card grid linking every admin surface,
  // so an admin who types `/admin` lands on their home instead of a
  // 404.
  'admin.home.title': { bn: 'প্রশাসক প্যানেল', en: 'Admin console' },
  'admin.home.subtitle': {
    bn: 'শহরের সব প্রশাসনিক কাজ এক জায়গায়',
    en: 'Everything you administer, in one place',
  },
  'admin.home.card.reports.title': { bn: 'রিপোর্টসমূহ', en: 'Reports' },
  'admin.home.card.reports.body': {
    bn: 'সব রিপোর্ট দেখুন, অবস্থা পরিবর্তন করুন, ক্রু নিয়োগ করুন।',
    en: 'Read every report, change its status, reassign crew.',
  },
  'admin.home.card.audit.title': { bn: 'অডিট লগ', en: 'Audit log' },
  'admin.home.card.audit.body': {
    bn: 'প্ল্যাটফর্মের প্রতিটি স্টেট-পরিবর্তনের ট্রেইল দেখুন।',
    en: 'The trail of every state change on the platform.',
  },
  'admin.home.card.cities.title': { bn: 'শহরসমূহ', en: 'Cities' },
  'admin.home.card.cities.body': {
    bn: 'শহর যোগ করুন, ওয়ার্ড-বিভাগ ক্যাটাগরি ঠিক করুন, ব্যবহারকারী নিয়োগ করুন।',
    en: 'Add cities, tune wards, departments and categories, provision users.',
  },
  'admin.home.card.setup.title': { bn: 'সেটআপ', en: 'Setup' },
  'admin.home.card.setup.body': {
    bn: 'শহর চালু করার ধাপে ধাপে নির্দেশনা।',
    en: 'Step-by-step guidance to take a city live.',
  },
  'admin.home.open': { bn: 'খুলুন', en: 'Open' },
  'admin.home.cta.cities': { bn: 'শহরসমূহ', en: 'Cities' },
  'admin.home.cta.audit': { bn: 'অডিট লগ', en: 'Audit log' },
  'admin.home.cta.reports': { bn: 'রিপোর্টসমূহ', en: 'Reports' },
  'admin.home.error': {
    bn: 'প্রশাসক তথ্য লোড করা যায়নি',
    en: 'Could not load admin data',
  },
  'admin.home.loading': { bn: 'লোড হচ্ছে…', en: 'Loading…' },

  'admin.dashboard.title': { bn: 'ড্যাশবোর্ড', en: 'Dashboard' },
  'shell.brand.tagline': { bn: 'পরিচ্ছন্ন, নিরাপদ শহর', en: 'A Cleaner, Safer City' },
  'shell.nav.label': { bn: 'প্রধান নেভিগেশন', en: 'Main navigation' },
  'shell.nav.dashboard': { bn: 'ড্যাশবোর্ড', en: 'Dashboard' },
  'shell.nav.reports': { bn: 'রিপোর্ট', en: 'Reports' },
  'shell.nav.new_report': { bn: 'নতুন রিপোর্ট', en: 'New report' },
  'shell.nav.notifications': { bn: 'নোটিফিকেশন', en: 'Notifications' },
  'shell.nav.profile': { bn: 'প্রোফাইল', en: 'Profile' },
  'shell.nav.assignments': { bn: 'অ্যাসাইনমেন্ট', en: 'Assignments' },
  'shell.nav.crews': { bn: 'ক্রু', en: 'Crews' },
  'shell.nav.map': { bn: 'মানচিত্র', en: 'Map' },
  'shell.nav.operations': { bn: 'অপারেশন', en: 'Operations' },
  'shell.nav.users': { bn: 'ব্যবহারকারী', en: 'Users' },
  'shell.nav.settings': { bn: 'সেটিংস', en: 'Settings' },
  'shell.nav.my_jobs': { bn: 'আমার কাজ', en: 'My Jobs' },
  'shell.nav.activity_log': { bn: 'কার্যক্রম লগ', en: 'Activity Log' },
  'shell.search': { bn: 'রিপোর্ট বা অবস্থান খুঁজুন…', en: 'Search reports, locations…' },
  'shell.search.submit': { bn: 'খুঁজুন', en: 'Search' },
  'shell.nav.open': { bn: 'নেভিগেশন খুলুন', en: 'Open navigation' },
  'shell.status.online': { bn: 'অনলাইন', en: 'Online' },
  'dispatcher.dashboard.title': { bn: 'ডিসপ্যাচার ড্যাশবোর্ড', en: 'Dispatcher Dashboard' },
  'dispatcher.dashboard.subtitle': { bn: 'রিপোর্ট পরিচালনা, ক্রু নিয়োগ এবং শহরের অগ্রগতি দেখুন।', en: 'Manage reports, assign crews, and track progress across the city.' },
  'dispatcher.dashboard.new': { bn: 'নতুন রিপোর্ট', en: 'New Reports' },
  'dispatcher.dashboard.review': { bn: 'পর্যালোচনাধীন', en: 'Pending Review' },
  'dispatcher.dashboard.progress': { bn: 'চলমান', en: 'In Progress' },
  'dispatcher.dashboard.resolved': { bn: 'সমাধান হয়েছে', en: 'Resolved' },
  'dispatcher.dashboard.map': { bn: 'শহরের মানচিত্র', en: 'City Map' },
  'dispatcher.dashboard.full_map': { bn: 'পূর্ণ মানচিত্র', en: 'View full map' },
  'dispatcher.dashboard.recent': { bn: 'সাম্প্রতিক রিপোর্ট', en: 'Recent Reports' },
  'dispatcher.dashboard.view_all': { bn: 'সব দেখুন', en: 'View all' },
  'dispatcher.dashboard.updated': { bn: 'আপডেট:', en: 'Updated:' },
  'dispatcher.dashboard.crew_activity': { bn: 'ক্রু কার্যক্রম', en: 'Crew Activity' },
  'dispatcher.dashboard.view_crews': { bn: 'বিস্তারিত', en: 'Details' },
  'dispatcher.dashboard.field_crew': { bn: 'ফিল্ড ক্রু', en: 'Field crew' },
  'dispatcher.dashboard.jobs': { bn: 'কাজ', en: 'jobs' },
  'dispatcher.dashboard.no_crew_activity': { bn: 'এই সময়ে ক্রুর কোনো সম্পন্ন কাজ নেই', en: 'No completed crew work in this period' },
  'dispatcher.dashboard.quick_actions': { bn: 'দ্রুত কাজ', en: 'Quick Actions' },
  'dispatcher.dashboard.assign': { bn: 'ক্রু নিয়োগ', en: 'Assign Crew' },
  'dispatcher.dashboard.view_reports': { bn: 'রিপোর্ট দেখুন', en: 'View Reports' },
  'dispatcher.dashboard.duplicates': { bn: 'ডুপ্লিকেট পর্যালোচনা', en: 'Review Duplicates' },
  'dispatcher.dashboard.performance': { bn: 'কার্যকারিতা', en: 'Performance' },
  'dispatcher.dashboard.trends': { bn: 'রিপোর্ট প্রবণতা', en: 'Report Trends' },
  'dispatcher.dashboard.week': { bn: 'এই সপ্তাহ', en: 'This week' },
  'home.dashboard.greeting': { bn: 'হ্যালো,', en: 'Hello,' },
  'home.dashboard.title': { bn: 'ড্যাশবোর্ড', en: 'Dashboard' },
  'home.dashboard.subtitle': { bn: 'চলুন, একসঙ্গে শহরকে আরও ভালো রাখি।', en: 'Let’s keep our city better together.' },
  'home.dashboard.report': { bn: 'সমস্যা রিপোর্ট করুন', en: 'Report an issue' },
  'home.dashboard.report_hint': { bn: 'আপনার এলাকার সমস্যা জানান', en: 'Tell us about an issue in your area' },
  'home.dashboard.metric.reports': { bn: 'আমার রিপোর্ট', en: 'My reports' },
  'home.dashboard.metric.resolved': { bn: 'সমাধান হয়েছে', en: 'Resolved' },
  'home.dashboard.metric.progress': { bn: 'চলমান', en: 'In progress' },
  'home.dashboard.trend': { bn: 'রিপোর্টের পরিসংখ্যান', en: 'Report statistics' },
  'home.dashboard.recent_window': { bn: 'সাম্প্রতিক ৭ দিন', en: 'Recent 7 days' },
  'home.dashboard.help_title': { bn: 'রিপোর্টের অগ্রগতি দেখুন', en: 'Stay up to date' },
  'home.dashboard.help_body': { bn: 'আপনার রিপোর্ট ও শহরের সাম্প্রতিক কাজ এক জায়গায় দেখুন।', en: 'Follow your reports and see recent work happening across the city.' },
  'home.dashboard.help_action': { bn: 'আমার রিপোর্ট', en: 'View my reports' },
  'home.dashboard.community_title': { bn: 'একসঙ্গে উন্নত শহর', en: 'A better city, together' },
  'home.dashboard.community_body': { bn: 'একটি রিপোর্ট আপনার এলাকার সবার জন্য পরিবর্তন আনতে পারে।', en: 'One clear report can make a difference for everyone in your neighborhood.' },
  'admin.dashboard.subtitle': { bn: 'শহরের সেবার সারসংক্ষেপ', en: 'Overview of city service activities' },
  'admin.dashboard.search': { bn: 'রিপোর্ট বা অবস্থান খুঁজুন…', en: 'Search reports, locations…' },
  'admin.dashboard.notifications': { bn: 'নোটিফিকেশন', en: 'Notifications' },
  'admin.dashboard.range': { bn: 'সময়সীমা', en: 'Date range' },
  'admin.dashboard.range.7': { bn: 'গত ৭ দিন', en: 'Last 7 days' },
  'admin.dashboard.range.30': { bn: 'গত ৩০ দিন', en: 'Last 30 days' },
  'admin.dashboard.range.90': { bn: 'গত ৯০ দিন', en: 'Last 90 days' },
  'admin.dashboard.nav.dashboard': { bn: 'ড্যাশবোর্ড', en: 'Dashboard' },
  'admin.dashboard.nav.reports': { bn: 'রিপোর্ট', en: 'Reports' },
  'admin.dashboard.nav.crews': { bn: 'ক্রু', en: 'Crews' },
  'admin.dashboard.nav.operations': { bn: 'অপারেশন', en: 'Operations' },
  'admin.dashboard.nav.users': { bn: 'ব্যবহারকারী', en: 'Users' },
  'admin.dashboard.nav.settings': { bn: 'সেটিংস', en: 'Settings' },
  'admin.dashboard.metric.total': { bn: 'মোট রিপোর্ট', en: 'Total reports' },
  'admin.dashboard.metric.progress': { bn: 'চলমান', en: 'In progress' },
  'admin.dashboard.metric.resolved': { bn: 'সমাধান হয়েছে', en: 'Resolved' },
  'admin.dashboard.metric.pending': { bn: 'অপেক্ষমাণ', en: 'Pending' },
  'admin.dashboard.metric.compare': { bn: 'আগের সময়ের তুলনায়', en: 'vs previous period' },
  'admin.dashboard.map': { bn: 'শহরের মানচিত্র', en: 'City map' },
  'admin.dashboard.map.new': { bn: 'নতুন', en: 'New' },
  'admin.dashboard.map.progress': { bn: 'চলমান', en: 'In progress' },
  'admin.dashboard.map.resolved': { bn: 'সমাধান', en: 'Resolved' },
  'admin.dashboard.recent': { bn: 'সাম্প্রতিক রিপোর্ট', en: 'Recent reports' },
  'admin.dashboard.view_all': { bn: 'সব দেখুন', en: 'View all' },
  'admin.dashboard.empty_reports': { bn: 'এই সময়ে কোনো রিপোর্ট নেই', en: 'No reports in this period' },
  'admin.dashboard.trend': { bn: 'রিপোর্টের প্রবণতা', en: 'Reports trend' },
  'admin.dashboard.trend.total': { bn: 'মোট', en: 'Total' },
  'admin.dashboard.trend.resolved': { bn: 'সমাধান', en: 'Resolved' },
  'admin.dashboard.trend.pending': { bn: 'অপেক্ষমাণ', en: 'Pending' },
  'admin.dashboard.crew_activity': { bn: 'ক্রু কার্যক্রম', en: 'Crew activity' },
  'admin.dashboard.crew.active': { bn: 'সক্রিয় ক্রু', en: 'Active crews' },
  'admin.dashboard.crew.invited': { bn: 'আমন্ত্রিত', en: 'Invited' },
  'admin.dashboard.crew.unavailable': { bn: 'নিষ্ক্রিয়', en: 'Unavailable' },
  'admin.dashboard.quick_actions': { bn: 'দ্রুত কাজ', en: 'Quick actions' },
  'admin.dashboard.action.reports': { bn: 'রিপোর্ট দেখুন', en: 'Review reports' },
  'admin.dashboard.action.reports_hint': { bn: 'নতুন ও চলমান রিপোর্ট', en: 'Open the report queue' },
  'admin.dashboard.action.crews': { bn: 'ক্রু পরিচালনা', en: 'Manage crews' },
  'admin.dashboard.action.crews_hint': { bn: 'দল ও সদস্য', en: 'Teams and members' },
  'admin.dashboard.action.status': { bn: 'অডিট কার্যক্রম', en: 'Audit activity' },
  'admin.dashboard.action.status_hint': { bn: 'পরিবর্তনের ইতিহাস', en: 'Review change history' },
  'admin.dashboard.action.settings': { bn: 'শহর সেটিংস', en: 'City settings' },
  'admin.dashboard.action.settings_hint': { bn: 'ওয়ার্ড ও বিভাগ', en: 'Wards and departments' },
  'admin.dashboard.security': { bn: 'অ্যাডমিন নিরাপত্তা কী', en: 'Admin security key' },
  'admin.dashboard.error': { bn: 'ড্যাশবোর্ডের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।', en: 'Dashboard data could not be loaded. Try again.' },
  'admin.dashboard.loading': { bn: 'ড্যাশবোর্ড লোড হচ্ছে…', en: 'Loading dashboard…' },

  // WO-003 (Intent 004) — Crew surfaces (today's assignments)
  //
  // CREW DASHBOARD (/crew) — the crew portal's home surface.
  //
  // The dashboard is a supervisor-at-a-glance view of one crew
  // member's day: four KPIs, a "Today's Jobs" list, a map with
  // numbered pins, a focused-job detail panel and a recent-activity
  // timeline. The design reference is
  // `ui-design/Crew Portal Dashboard.png`.
  'crew.dashboard.greeting': {
    bn: 'সুপ্রভাত, {name}',
    en: 'Good morning, {name}',
  },
  'crew.dashboard.greeting_afternoon': {
    bn: 'শুভ অপরাহ্ন, {name}',
    en: 'Good afternoon, {name}',
  },
  'crew.dashboard.greeting_evening': {
    bn: 'শুভ সন্ধ্যা, {name}',
    en: 'Good evening, {name}',
  },
  'crew.dashboard.subtitle': {
    bn: 'আজ আপনার দায়িত্বে থাকা কাজগুলো দেখুন',
    en: 'Here are your assigned tasks for today',
  },
  // KPI row — four cards, each with a headline value, a label and
  // a supporting hint. The labels follow the design reference
  // (`ui-design/Crew Portal Dashboard.png`): Assigned Jobs /
  // Completed Today / Pending / Total Work Time.
  'crew.dashboard.metric.assigned': {
    bn: 'বরাদ্দকৃত কাজ',
    en: 'Assigned Jobs',
  },
  'crew.dashboard.metric.assigned_hint': {
    bn: '{count}টি কাজ বাকি',
    en: '{count} tasks awaiting',
  },
  'crew.dashboard.metric.in_progress': {
    bn: 'আজ সম্পন্ন',
    en: 'Completed Today',
  },
  'crew.dashboard.metric.in_progress_hint': {
    bn: 'এখন কাজ চলছে',
    en: 'Currently working',
  },
  'crew.dashboard.metric.pending': {
    bn: 'অপেক্ষমাণ',
    en: 'Pending',
  },
  'crew.dashboard.metric.pending_hint': {
    bn: 'পরবর্তী পদক্ষেপের অপেক্ষায়',
    en: 'Awaiting action',
  },
  'crew.dashboard.metric.avg_resolution': {
    bn: 'মোট কাজের সময়',
    en: 'Total Work Time',
  },
  'crew.dashboard.metric.avg_resolution_hint': {
    bn: 'এই সপ্তাহে',
    en: 'This week',
  },
  'crew.dashboard.metric.no_resolution_data': {
    bn: '—',
    en: '—',
  },
  // "Today's Jobs" panel (the left column).
  'crew.dashboard.jobs_title': {
    bn: 'আজকের কাজ',
    en: "Today's jobs",
  },
  'crew.dashboard.jobs_empty': {
    bn: 'আজকের জন্য কোনো কাজ নেই',
    en: 'No jobs assigned today',
  },
  'crew.dashboard.jobs_empty_hint': {
    bn: 'নতুন কাজ এলে এখানে দেখা যাবে।',
    en: 'New assignments will appear here.',
  },
  'crew.dashboard.job_eta': {
    bn: '{time} বাকি',
    en: '{time} est',
  },
  'crew.dashboard.job_eta_overdue': {
    bn: 'সময় চলে গেছে',
    en: 'Overdue',
  },
  // Map panel (the centre column).
  'crew.dashboard.map_title': {
    bn: 'এলাকার কাজ',
    en: 'Jobs around you',
  },
  'crew.dashboard.map_legend.location': {
    bn: 'আমার অবস্থান',
    en: 'My location',
  },
  'crew.dashboard.map_legend.assigned': {
    bn: 'বরাদ্দকৃত',
    en: 'Assigned',
  },
  'crew.dashboard.map_legend.pending': {
    bn: 'অপেক্ষমাণ',
    en: 'Pending',
  },
  'crew.dashboard.map_legend.completed': {
    bn: 'সম্পন্ন',
    en: 'Completed',
  },
  // Focused-job detail panel (the right column).
  'crew.dashboard.detail_title': {
    bn: 'নির্বাচিত কাজ',
    en: 'Selected job',
  },
  'crew.dashboard.detail_empty': {
    bn: 'বিস্তারিত দেখতে একটি কাজ নির্বাচন করুন',
    en: 'Select a job to see its details',
  },
  'crew.dashboard.detail_open': {
    bn: 'রিপোর্ট খুলুন',
    en: 'Open report',
  },
  'crew.dashboard.detail.trail_title': {
    bn: 'অগ্রগতি',
    en: 'Progress',
  },
  // The four-step trail ladder shown in the focused-job panel.
  'crew.dashboard.trail.assigned': {
    bn: 'বরাদ্দ হয়েছে',
    en: 'Assigned',
  },
  'crew.dashboard.trail.pending_report': {
    bn: 'রিপোর্টের অপেক্ষায়',
    en: 'Pending Report',
  },
  'crew.dashboard.trail.pending_review': {
    bn: 'পর্যালোচনার অপেক্ষায়',
    en: 'Pending Review',
  },
  'crew.dashboard.trail.completed': {
    bn: 'সম্পন্ন',
    en: 'Completed',
  },
  // The focused-job panel's action buttons.
  'crew.dashboard.detail.upload_photo': {
    bn: 'ছবি আপলোড করুন',
    en: 'Upload Photo',
  },
  'crew.dashboard.detail.mark_done': {
    bn: 'সম্পন্ন হিসেবে চিহ্নিত করুন',
    en: 'Mark as Done',
  },
  'crew.dashboard.detail.reporter': {
    bn: 'রিপোর্টকারী',
    en: 'Reported by',
  },
  'crew.dashboard.detail.photos': {
    bn: 'ছবি',
    en: 'Photos',
  },
  'crew.dashboard.detail.photos_empty': {
    bn: 'কোনো ছবি নেই',
    en: 'No photos',
  },
  // "Need help?" card under the detail panel.
  'crew.dashboard.help_title': {
    bn: 'সাহায্য দরকার?',
    en: 'Need help?',
  },
  'crew.dashboard.help_body': {
    bn: 'কাজ ভুলভাবে বরাদ্দ হয়েছে? সমস্যা জানান।',
    en: 'Job not assigned correctly? Report an issue',
  },
  'crew.dashboard.help_call_dispatcher': {
    bn: 'ডিসপ্যাচারকে কল করুন',
    en: 'Call dispatcher',
  },
  // Recent Activity timeline (bottom left).
  'crew.dashboard.activity_title': {
    bn: 'সাম্প্রতিক কাজ',
    en: 'Recent activity',
  },
  'crew.dashboard.activity_view_all': {
    bn: 'সব দেখুন',
    en: 'View all',
  },
  'crew.dashboard.activity_empty': {
    bn: 'এখনো কোনো কাজের কার্যক্রম নেই',
    en: 'No activity yet',
  },
  'crew.dashboard.activity.started': {
    bn: 'আপনি {id} কাজটি শুরু করেছেন',
    en: 'You started job {id}',
  },
  'crew.dashboard.activity.resolved': {
    bn: 'আপনি {id} কাজটি সম্পন্ন করেছেন',
    en: 'You marked job {id} as completed',
  },
  'crew.dashboard.activity.assigned': {
    bn: 'নতুন কাজ {id} আপনার নামে বরাদ্দ হয়েছে',
    en: 'New job {id} assigned to you',
  },
  'crew.dashboard.activity.routed': {
    bn: '{id} কাজটি আপনার ওয়ার্ডে পাঠানো হয়েছে',
    en: 'Job {id} was routed to your ward',
  },
  // Field Tips card (bottom right).
  'crew.dashboard.tips_title': {
    bn: 'ক্ষেত্রের পরামর্শ',
    en: 'Field tips',
  },
  'crew.dashboard.tips_body': {
    bn: 'মাঠপর্যায়ে নিরাপদ থাকুন',
    en: 'Stay safe in the field',
  },
  'crew.dashboard.tips_action': {
    bn: 'নিরাপত্তা নির্দেশিকা দেখুন',
    en: 'View safety guide',
  },

  'crew.list.title': {
    bn: 'আজকের কাজ',
    en: "Today's assignments",
  },
  'crew.list.subtitle': {
    bn: 'আপনার ওয়ার্ড ও বিভাগে বরাদ্দকৃত রিপোর্ট — বয়স অনুযায়ী সাজানো',
    en: 'Reports routed to your ward and department — sorted by age',
  },
  'crew.list.filter.all': { bn: 'সব', en: 'All' },
  'crew.list.filter.routed': { bn: 'শুধু রাউট', en: 'Routed only' },
  'crew.list.filter.in_progress': {
    bn: 'চলমান',
    en: 'In progress only',
  },
  // The crew's scope tag in the sub-header. `{ward}` is the ward
  // NAME (not the `ward_14` id) and `{dept}` the department
  // name; both are omitted gracefully when the crew member is
  // not bound to a ward / department.
  'crew.list.scope': {
    bn: 'ক্রু',
    en: 'Crew',
  },
  'crew.list.scope.ward': {
    bn: 'ওয়ার্ড {ward}',
    en: 'Ward {ward}',
  },
  'crew.list.scope.department': {
    bn: '{dept}',
    en: '{dept}',
  },
  'crew.list.empty.title': {
    bn: 'আজকের জন্য কোনো কাজ নেই',
    en: 'No assignments today',
  },
  'crew.list.empty.subtitle': {
    bn: 'আপনার ওয়ার্ড ও বিভাগে এই মুহূর্তে কোনো রিপোর্ট বরাদ্দ নেই।',
    en: 'No reports are currently assigned to your ward and department.',
  },
  'crew.list.error': {
    bn: 'কাজ লোড করা যায়নি',
    en: 'Could not load assignments',
  },
  'crew.list.signin_required': {
    bn: 'আজকের কাজ দেখতে লগইন করুন',
    en: 'Sign in to view your assignments',
  },
  'crew.list.row.view': { bn: 'বিস্তারিত', en: 'Open' },
  'crew.list.row.distance': {
    bn: '{distance}মিটার দূরে',
    en: '{distance}m away',
  },
  'crew.list.row.distance_pending': {
    bn: 'অবস্থান শেয়ার করুন',
    en: 'Share location',
  },
  'crew.list.row.age': {
    bn: '{age} আগে',
    en: '{age} ago',
  },

  // WO-003 (Intent 004) — Crew ticket detail + transition + photos
  'crew.detail.not_found': {
    bn: 'এই রিপোর্টটি আপনার এখতিয়ারে নেই বা মুছে ফেলা হয়েছে।',
    en: 'This report is outside your scope or has been removed.',
  },
  'crew.detail.back_to_list': {
    bn: '← আজকের কাজে ফিরে যান',
    en: "← Back to today's assignments",
  },
  'crew.detail.loading': {
    bn: 'রিপোর্ট লোড হচ্ছে…',
    en: 'Loading report…',
  },
  'crew.detail.record': {
    bn: 'রিপোর্টের বিবরণ',
    en: 'Report record',
  },
  'crew.detail.field.ward': { bn: 'ওয়ার্ড', en: 'Ward' },
  'crew.detail.field.category': { bn: 'বিভাগ', en: 'Category' },
  'crew.detail.field.location': { bn: 'অবস্থান', en: 'Location' },
  'crew.detail.field.note': { bn: 'নোট', en: 'Note' },
  'crew.detail.field.reporter': { bn: 'রিপোর্টকারী', en: 'Reporter' },
  'crew.detail.trail': { bn: 'অগ্রগতির ইতিহাস', en: 'Status trail' },
  'crew.detail.photos': { bn: 'ছবি', en: 'Photos' },
  'crew.detail.photos.empty': {
    bn: 'কোনো ছবি নেই',
    en: 'No photos yet',
  },
  'crew.detail.navigate': {
    bn: 'নেভিগেট করুন',
    en: 'Navigate',
  },
  'crew.detail.transition.heading': {
    bn: 'পরবর্তী পদক্ষেপ',
    en: 'Next action',
  },
  'crew.detail.transition.none': {
    bn: 'এই মুহূর্তে কোনো পদক্ষেপ নেই',
    en: 'No further action available',
  },
  'crew.detail.transition.saving': {
    bn: 'পাঠানো হচ্ছে…',
    en: 'Submitting…',
  },
  'crew.transition.in_progress': {
    bn: 'কাজ শুরু করুন',
    en: 'Mark in progress',
  },
  'crew.transition.resolved': {
    bn: 'সমাধান হিসেবে চিহ্নিত করুন',
    en: 'Mark resolved',
  },
  'crew.resolution_note.label': {
    bn: 'সমাধানের বিবরণ',
    en: 'Resolution note',
  },
  'crew.resolution_note.helper': {
    bn: 'কী করা হয়েছে — সংক্ষেপে লিখুন (১০০০ অক্ষরের মধ্যে)',
    en: 'Briefly describe what you did (max 1000 characters)',
  },
  'crew.resolution_note.required': {
    bn: 'সমাধানের বিবরণ আবশ্যক',
    en: 'Resolution note is required',
  },
  'crew.photo.heading': {
    bn: 'সমাধানের ছবি যোগ করুন',
    en: 'Add an after photo',
  },
  'crew.photo.input.label': {
    bn: 'ছবির URL',
    en: 'Photo URL',
  },
  'crew.photo.input.placeholder': {
    bn: 'https://…',
    en: 'https://…',
  },
  'crew.photo.submit': {
    bn: 'ছবি যোগ করুন',
    en: 'Add photo',
  },
  'crew.photo.saving': {
    bn: 'যোগ হচ্ছে…',
    en: 'Adding…',
  },
  'crew.photo.error.invalid_url': {
    bn: 'সঠিক URL দিন',
    en: 'Enter a valid URL',
  },

  // Intent 008 Bolt 008-003 — file-upload chrome.
  // (Bolt 008-001 registers the keys; this bolt only
  // uses them on the page.)
  'crew.photo.file.label': {
    bn: 'ফিক্সের প্রমাণ ছবি আপলোড করুন',
    en: 'Upload proof-of-fix photo',
  },
  'crew.photo.url.override': {
    bn: 'URL পেস্ট করুন (পাওয়ার ইউজার)',
    en: 'Paste a URL (power user)',
  },
  'crew.photo.url.placeholder': {
    bn: 'https://…',
    en: 'https://…',
  },
  'crew.photo.error.invalid_file': {
    bn: 'JPEG, PNG, বা WebP ছবি দিন (সর্বোচ্চ ৫ মেগাবাইট)',
    en: 'Choose a JPEG / PNG / WebP image up to 5 MB',
  },
  'crew.photo.error.too_large': {
    bn: 'ছবিটি বড় হওয়ায় আপলোড হয়নি। অনুগ্রহ করে ছোট ছবি বেছে নিন।',
    en: 'The photo was too large to upload. Please choose a smaller image.',
  },
  'crew.transition.error.role_cannot': {
    bn: 'এই পদক্ষেপ শুধু ডিসপ্যাচার নিতে পারে',
    en: 'Only the dispatcher can perform this action',
  },
  'crew.transition.error.illegal': {
    bn: 'এই অবস্থা থেকে এই পদক্ষেপ নেওয়া যায় না',
    en: 'This transition is not allowed from the current status',
  },
  'crew.transition.error.generic': {
    bn: 'পদক্ষেপ ব্যর্থ — আবার চেষ্টা করুন',
    en: 'Action failed — try again',
  },
  // CREW-006 — offline-read cache banner copy. The
  // banner surfaces on the list + detail page when the
  // page is rendering a cached snapshot because the
  // network failed (or the page is mid-fetch and the
  // cached snapshot was the "first paint" source).
  'crew.cache.banner': {
    bn: 'ক্যাশড ডেটা দেখাচ্ছে — নেটওয়ার্ক ফিরে আসলে রিফ্রেশ হবে',
    en: 'Showing cached data — refreshes when network returns',
  },
  'crew.cache.banner.detail': {
    bn: 'ক্যাশড তথ্য — পুরোনো হতে পারে',
    en: 'Cached — may be stale',
  },
  'crew.cache.last_updated': {
    bn: 'শেষ আপডেট: {when}',
    en: 'Last updated: {when}',
  },
  'crew.cache.empty': {
    bn: 'এই মুহূর্তে কোনো অ্যাসাইনমেন্ট নেই',
    en: 'No assignments right now',
  },
  'crew.cache.retry': {
    bn: 'আবার চেষ্টা করুন',
    en: 'Retry',
  },

  // v1.1 launch-polish — user menu dropdown (top-right of every
  // authenticated surface). Renders the avatar initials button,
  // the dropdown panel with name + role + scope badge, and the
  // Logout action.
  'user.menu.open_menu': {
    bn: 'ব্যবহারকারী মেনু',
    en: 'Open user menu',
  },
  'user.menu.close_menu': {
    bn: 'মেনু বন্ধ করুন',
    en: 'Close menu',
  },
  'user.menu.role.citizen': { bn: 'নাগরিক', en: 'Citizen' },
  'user.menu.role.dispatcher': { bn: 'ডিসপ্যাচার', en: 'Dispatcher' },
  'user.menu.role.crew': { bn: 'ক্রু সদস্য', en: 'Crew' },
  'user.menu.role.admin': { bn: 'অ্যাডমিন', en: 'Admin' },
  'user.menu.profile': { bn: 'প্রোফাইল সম্পাদনা', en: 'Edit profile' },
  'user.menu.profile_hint': { bn: 'আপনার তথ্য ও নাম', en: 'Your details and name' },
  'user.menu.logout': { bn: 'লগআউট', en: 'Log out' },
  'user.menu.signing_out': { bn: 'বের হচ্ছে…', en: 'Signing out…' },
  'user.menu.aria.avatar': {
    bn: '{name} — মেনু খুলুন',
    en: '{name} — open menu',
  },

  'profile.title': { bn: 'আপনার প্রোফাইল', en: 'Your profile' },
  'profile.subtitle': {
    bn: 'আপনার পরিচিতির তথ্য হালনাগাদ রাখুন।',
    en: 'Keep your personal details up to date.',
  },
  'profile.back': { bn: 'ফিরে যান', en: 'Back to CityFix' },
  'profile.identity.title': { bn: 'আপনার পরিচিতি', en: 'About you' },
  'profile.name': { bn: 'নাম', en: 'Name' },
  'profile.name.hint': { bn: 'আপনি যে নামে পরিচিত হতে চান।', en: 'The name you want people to see.' },
  'profile.name_bn': { bn: 'বাংলা নাম', en: 'Bangla name' },
  'profile.name_bn.hint': { bn: 'ঐচ্ছিক — বাংলা ভাষায় দেখানো হবে।', en: 'Optional — shown in Bangla.' },
  'profile.contact.title': { bn: 'যোগাযোগের তথ্য', en: 'Contact details' },
  'profile.contact.note': {
    bn: 'নিরাপত্তার জন্য ফোন ও ইমেইল এখানে পরিবর্তন করা যাবে না।',
    en: 'Phone and email can’t be changed here to protect your account.',
  },
  'profile.phone': { bn: 'ফোন', en: 'Phone' },
  'profile.email': { bn: 'ইমেইল', en: 'Email' },
  'profile.role': { bn: 'অ্যাকাউন্টের ধরন', en: 'Account type' },
  'profile.save': { bn: 'পরিবর্তন সংরক্ষণ করুন', en: 'Save changes' },
  'profile.saving': { bn: 'সংরক্ষণ হচ্ছে…', en: 'Saving…' },
  'profile.saved': { bn: 'প্রোফাইল হালনাগাদ হয়েছে।', en: 'Your profile has been updated.' },
  'profile.error.load': { bn: 'প্রোফাইল লোড করা যায়নি। আবার চেষ্টা করুন।', en: 'Could not load your profile. Try again.' },
  'profile.error.save': { bn: 'পরিবর্তন সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।', en: 'Could not save your changes. Try again.' },
  'profile.error.name': { bn: 'নাম লিখুন (সর্বোচ্চ ৮০ অক্ষর)।', en: 'Enter a name (up to 80 characters).' },
  'profile.error.name_bn': { bn: 'বাংলা নাম ৮০ অক্ষরের মধ্যে হতে হবে।', en: 'Bangla name must be 80 characters or fewer.' },
  'profile.loading': { bn: 'প্রোফাইল লোড হচ্ছে…', en: 'Loading your profile…' },
  'profile.tab.details': { bn: 'বিবরণ', en: 'Details' },
  'profile.tab.settings': { bn: 'সেটিংস', en: 'Settings' },
  'profile.settings.title': { bn: 'সেটিংস', en: 'Settings' },
  'profile.settings.subtitle': {
    bn: 'ভাষা ও চেহারা বেছে নিন।',
    en: 'Choose your language and appearance.',
  },
  'profile.settings.language.title': { bn: 'ভাষা', en: 'Language' },
  'profile.settings.language.hint': {
    bn: 'CityFix বাংলা-প্রথম। ইংরেজিতেও দেখতে পারেন।',
    en: 'CityFix is Bangla-first. You can also read it in English.',
  },
  'profile.settings.language.bn': { bn: 'বাংলা', en: 'Bangla' },
  'profile.settings.language.en': { bn: 'ইংরেজি', en: 'English' },
  'profile.settings.appearance.title': { bn: 'চেহারা', en: 'Appearance' },
  'profile.settings.appearance.hint': {
    bn: 'হালকা বা গাঢ় থিম বেছে নিন।',
    en: 'Pick the light or dark theme.',
  },
  'profile.settings.appearance.light': { bn: 'হালকা', en: 'Light' },
  'profile.settings.appearance.dark': { bn: 'গাঢ়', en: 'Dark' },
  'profile.settings.appearance.system': { bn: 'সিস্টেম', en: 'System' },

  // ---------------------------------------------------------------------------
  // UI PRIMITIVE LABELS (Wave 1 — design foundation)
  //
  // Generic chrome copy shared by the primitive library: the strings that
  // would otherwise be duplicated on every chart, table and state component.
  // They live in the registry once, in Bangla and English together.
  //
  // Product-specific copy does NOT belong here — a page passes its own
  // heading as a prop and looks it up in its own namespace.
  // ---------------------------------------------------------------------------

  'ui.action.close': { bn: 'বন্ধ করুন', en: 'Close' },
  'ui.action.retry': { bn: 'আবার চেষ্টা করুন', en: 'Try again' },
  'ui.action.show_table': { bn: 'টেবিল দেখান', en: 'Show data table' },
  'ui.action.hide_table': { bn: 'টেবিল লুকান', en: 'Hide data table' },

  'ui.chart.data_table': { bn: 'ডেটা টেবিল', en: 'Data table' },
  'ui.chart.chart_view': { bn: 'গ্রাফ', en: 'Chart' },

  'ui.table.label': { bn: 'লেবেল', en: 'Label' },
  'ui.table.value': { bn: 'মান', en: 'Value' },
  'ui.table.date': { bn: 'তারিখ', en: 'Date' },
  'ui.table.total': { bn: 'মোট', en: 'Total' },
  'ui.table.sort_asc': { bn: 'ছোট থেকে বড়', en: 'Sorted ascending' },
  'ui.table.sort_desc': { bn: 'বড় থেকে ছোট', en: 'Sorted descending' },
  'ui.table.sort_none': { bn: 'সাজানো হয়নি', en: 'Not sorted' },

  'ui.empty.title': { bn: 'কিছু নেই', en: 'Nothing here yet' },
  'ui.empty.body': {
    bn: 'নতুন আপডেটের জন্য আবার দেখুন।',
    en: 'Check back later for new updates.',
  },

  'ui.error.title': { bn: 'কিছু একটা সমস্যা হয়েছে', en: 'Something went wrong' },
  'ui.error.body': {
    bn: 'এই অংশটি লোড করা যায়নি। আবার চেষ্টা করুন।',
    en: 'This section could not be loaded. Please try again.',
  },

  'ui.loading.label': { bn: 'লোড হচ্ছে…', en: 'Loading…' },

  'ui.modal.close': { bn: 'ডায়ালগ বন্ধ করুন', en: 'Close dialog' },
  'ui.toast.dismiss': { bn: 'বার্তা বাদ দিন', en: 'Dismiss message' },

  'ui.nav.label': { bn: 'প্রধান নেভিগেশন', en: 'Primary navigation' },
  'ui.breadcrumb.label': { bn: 'ব্রেডক্রাম্ব', en: 'Breadcrumb' },
  'ui.tabs.label': { bn: 'ট্যাব', en: 'Tabs' },
  'ui.timeline.label': { bn: 'অগ্রগতির ধাপ', en: 'Progress steps' },
  'ui.kpi.label': { bn: 'মূল পরিসংখ্যান', en: 'Key figures' },
  'ui.toolbar.label': { bn: 'ফিল্টার ও কার্যক্রম', en: 'Filters and actions' },
  'ui.filterbar.label': { bn: 'ফিল্টার', en: 'Filters' },

  'ui.select.placeholder': { bn: 'নির্বাচন করুন', en: 'Select…' },
  'ui.field.required': { bn: 'এই ঘরটি পূরণ করা আবশ্যক', en: 'This field is required' },
  'ui.field.optional': { bn: 'ঐচ্ছিক', en: 'Optional' },
};

/**
 * Optional `vars` map for simple `{name}` interpolation. Unknown placeholders
 * are left as-is so missing copy is still visible in QA.
 */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? match : String(v);
  });
}

/**
 * Resolve a translation key with the user's language-preference chain:
 *   user override → city default → DEFAULT_LANGUAGE.
 *
 * `vars` is an optional map for `{name}` interpolation; see `interpolate`.
 * The third positional arg is `cityDefault` (kept positional for back-compat
 * with the existing call sites; new code may pass `vars` as the second arg
 * when there is no per-user override, in which case the override is null).
 */
export function t(
  key: keyof typeof TRANSLATIONS,
  userOverrideOrVars: Language | Record<string, string | number> | null,
  cityDefaultOrLang: Language,
  maybeVars?: Record<string, string | number>,
): string {
  // Two calling conventions:
  //   t(key, userOverride, cityDefault)
  //   t(key, vars, lang)
  let lang: Language;
  let vars: Record<string, string | number> | undefined;
  if (typeof userOverrideOrVars === 'string' || userOverrideOrVars === null) {
    lang = userOverrideOrVars ?? cityDefaultOrLang ?? DEFAULT_LANGUAGE;
    vars = maybeVars;
  } else {
    lang = cityDefaultOrLang ?? DEFAULT_LANGUAGE;
    vars = userOverrideOrVars;
  }

  const entry = TRANSLATIONS[key];
  if (!entry) {
    // unknown key — return the key itself so missing translations are visible
    return key;
  }
  const raw = entry[lang] ?? entry[DEFAULT_LANGUAGE] ?? entry.en ?? key;
  return interpolate(raw, vars);
}
