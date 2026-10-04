/**
 * Unit tests for the i18n key registry (lib/i18n/keys.ts).
 *
 * Validates the language-preference chain documented in PLAT-REQ-009:
 *   user override → city default → DEFAULT_LANGUAGE.
 *
 * Pure logic — no DB, no Next runtime. Vitest runs these without the
 * Next.js webServer, so the platform-layer unit tests stay fast.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  t,
  TRANSLATIONS,
} from '@/lib/i18n/keys';

describe('i18n key registry', () => {
  it('defaults to Bangla per PLAT-REQ-009 (Dhaka civic posture)', () => {
    expect(DEFAULT_LANGUAGE).toBe('bn');
    expect(SUPPORTED_LANGUAGES).toContain('bn');
    expect(SUPPORTED_LANGUAGES).toContain('en');
  });

  it('resolves to user override when present', () => {
    expect(t('home.tagline', 'bn', 'en')).toBe('আপনার শহর, আপনার কণ্ঠস্বর');
    expect(t('home.tagline', 'en', 'bn')).toBe('Your city, your voice');
  });

  it('falls back to city default when user override is null', () => {
    expect(t('home.tagline', null, 'bn')).toBe('আপনার শহর, আপনার কণ্ঠস্বর');
    expect(t('home.tagline', null, 'en')).toBe('Your city, your voice');
  });

  it('returns the key itself when the translation key is unknown', () => {
    // Force an unknown key by casting — this is the "visible-missing" behaviour
    // the registry documents.
    const unknownKey = 'definitely.not.a.key' as unknown as keyof typeof TRANSLATIONS;
    expect(t(unknownKey, 'bn', 'bn')).toBe('definitely.not.a.key');
  });

  it('every registered key has both a bn and an en translation', () => {
    for (const [key, value] of Object.entries(TRANSLATIONS)) {
      expect(value.bn, `${key}.bn must be present`).toBeTruthy();
      expect(value.en, `${key}.en must be present`).toBeTruthy();
      expect(value.bn.length, `${key}.bn must be non-empty`).toBeGreaterThan(0);
      expect(value.en.length, `${key}.en must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('status pills have all four lifecycle values', () => {
    expect(t('status.submitted', null, 'bn')).toBe('নতুন');
    expect(t('status.routed', null, 'bn')).toBe('রাউট');
    expect(t('status.in_progress', null, 'bn')).toBe('চলমান');
    expect(t('status.resolved', null, 'bn')).toBe('সমাধান');
  });

  it('Dhaka template category labels resolve in Bangla', () => {
    expect(t('category.streetlight', null, 'bn')).toBe('রাস্তার আলো নেই');
    expect(t('category.pothole', null, 'bn')).toBe('রাস্তায় গর্ত');
    expect(t('category.drainage', null, 'bn')).toBe('ড্রেনে পানি জমেছে');
    expect(t('category.garbage', null, 'bn')).toBe('আবর্জনা পরিষ্কার হচ্ছে না');
    expect(t('category.other', null, 'bn')).toBe('অন্যান্য');
  });
});