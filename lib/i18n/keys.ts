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

  // WO-001 1.2 Welcome / mockup 01
  'welcome.headline': {
    bn: 'আপনার শহরের<br/>আওয়াজ।',
    en: 'Voice of your city.',
  },
  'welcome.subhead': {
    bn: 'ভাঙা রাস্তার আলো, ড্রেনে আটকে থাকা পানি, জমে থাকা আবর্জনা — রিপোর্ট করুন, অগ্রগতি দেখুন, সমাধানের প্রমাণ পান।',
    en: 'Report broken streetlights, blocked drains, and piled garbage — track the fix, see proof of resolution.',
  },
  'welcome.cta.register': { bn: 'নিবন্ধন করুন', en: 'Register' },
  'welcome.cta.login': { bn: 'লগইন', en: 'Log in' },
  'welcome.lang.toggle': { bn: 'EN', en: 'বাংলা' },
  'welcome.trust.government': {
    bn: 'সরকার পরিচালিত',
    en: 'Government operated',
  },
  'welcome.trust.secure': {
    bn: 'তথ্য সুরক্ষিত',
    en: 'Your data is protected',
  },
  'welcome.trust.language': {
    bn: 'বাংলা · English',
    en: 'বাংলা · English',
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
  'detail.feedback.satisfied': { bn: 'হ্যাঁ, সন্তুষ্ট', en: 'Yes, satisfied' },
  'detail.feedback.dispute': { bn: 'আরও বিস্তারিত', en: 'Tell us more' },
  'detail.feedback.thanks': {
    bn: '✓ ধন্যবাদ — আমরা আপনার মতামত পেয়েছি।',
    en: '✓ Thanks — we have your feedback.',
  },
  'detail.feedback.resolved_ago': {
    bn: 'সমাধান হয়েছে',
    en: 'Resolved',
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
  'reports.link.home': { bn: 'হোম', en: 'Home' },
  'reports.title': { bn: 'আমার রিপোর্ট', en: 'My reports' },
  'reports.subtitle': {
    bn: 'আপনার জমা দেওয়া সব রিপোর্ট এখানে দেখুন',
    en: 'All reports you have submitted',
  },
  'reports.empty.title': {
    bn: 'এখনো কোনো রিপোর্ট নেই',
    en: 'You have not submitted any reports yet',
  },
  'reports.empty.subtitle': {
    bn: 'আপনার প্রথম রিপোর্ট জমা দিন এবং শহরকে আরও ভালো করতে সাহায্য করুন।',
    en: 'Submit your first report and help make the city better.',
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