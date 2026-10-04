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
  // WO-001 1.2 Welcome / mockup 01
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
};

/**
 * Resolve a translation key with the user's language preference chain:
 *   user override → city default → DEFAULT_LANGUAGE.
 */
export function t(
  key: keyof typeof TRANSLATIONS,
  userOverride: Language | null,
  cityDefault: Language,
): string {
  const lang = userOverride ?? cityDefault ?? DEFAULT_LANGUAGE;
  const entry = TRANSLATIONS[key];
  if (!entry) {
    // unknown key — return the key itself so missing translations are visible
    return key;
  }
  return entry[lang] ?? entry[DEFAULT_LANGUAGE] ?? entry.en ?? key;
}