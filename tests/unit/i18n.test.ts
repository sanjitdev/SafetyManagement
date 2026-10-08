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

  it('WO-001 1.11 confirmation toast + subtitle resolve in both languages', () => {
    expect(t('confirmation.toast.decline_noted', null, 'bn')).toMatch(/নথিভুক্ত/);
    expect(t('confirmation.toast.decline_noted', null, 'en')).toMatch(/logged/);
    expect(t('confirmation.title.accepted', null, 'bn')).toMatch(/গ্রহণ/);
    expect(t('confirmation.subtitle.sent', null, 'bn')).toMatch(/বিভাগে/);
    expect(t('confirmation.subtitle.track', null, 'bn')).toMatch(/অগ্রগতি/);
    expect(t('confirmation.trust.notify', null, 'bn')).toMatch(/জানাব/);
  });

  it('WO-001 1.12 detail page surface copy resolves', () => {
    expect(t('detail.topbar.section', null, 'bn')).toBe('আমার রিপোর্টসমূহ');
    expect(t('detail.meta.sla_value', null, 'bn')).toBe('৪৮ ঘণ্টা');
    expect(t('detail.section.progress', null, 'bn')).toBe('অগ্রগতি');
    expect(t('detail.feedback.title', null, 'bn')).toMatch(/সন্তোষজনক/);
    expect(t('detail.feedback.satisfied', null, 'bn')).toMatch(/সন্তুষ্ট/);
    expect(t('detail.feedback.dispute', null, 'bn')).toMatch(/বিস্তারিত/);
    expect(t('detail.photo.delete_confirm', null, 'bn')).toMatch(/মুছে দেবেন/);
  });

  it('WO-001 1.12 status trail titles cover every status enum', () => {
    const statuses = ['submitted', 'routed', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
    for (const s of statuses) {
      const key = `trail.${s}` as const;
      expect(t(key, null, 'bn').length, `${key}.bn must be non-empty`).toBeGreaterThan(0);
      expect(t(key, null, 'en').length, `${key}.en must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('time-ago and common action keys are i18n-registered', () => {
    expect(t('time.minutes_ago', null, 'bn')).toBe('মিনিট আগে');
    expect(t('time.hours_ago', null, 'bn')).toBe('ঘণ্টা আগে');
    expect(t('time.days_ago', null, 'bn')).toBe('দিন আগে');
    expect(t('common.cancel', null, 'bn')).toBe('বাতিল');
    expect(t('common.confirm', null, 'en')).toBe('Confirm');
  });

  it('every key referenced from the WO-001 pages is registered', () => {
    // Snapshot of every t(...) key referenced from app/report/[id]/submitted/page.tsx,
    // app/reports/[id]/page.tsx, and the 1.7–1.10 report-flow pages after the
    // i18n refactor. Adding a new key without registering it would land here
    // as a regression.
    const pageKeys = [
      'auth.signin_required_short',
      'auth.signin_required_long',
      'auth.back_home',
      'confirmation.toast.decline_noted',
      'confirmation.title.accepted',
      'confirmation.subtitle.sent',
      'confirmation.subtitle.track',
      'confirmation.ticket_id_label',
      'confirmation.trust.notify',
      'confirmation.view_report',
      'confirmation.back_home',
      'trail_preview.submitted.title',
      'trail_preview.submitted.time',
      'trail_preview.routed.title',
      'trail_preview.routed.time',
      'trail_preview.in_progress.title',
      'trail_preview.in_progress.time',
      'trail_preview.resolved.title',
      'trail_preview.resolved.time',
      'detail.topbar.section',
      'detail.topbar.home',
      'detail.avatar.fallback',
      'detail.meta.category',
      'detail.meta.ward',
      'detail.meta.sla',
      'detail.meta.sla_value',
      'detail.meta.resolution',
      'detail.section.progress',
      'detail.progress.empty',
      'detail.feedback.title',
      'detail.feedback.subtitle',
      'detail.feedback.satisfied',
      'detail.feedback.dispute',
      'detail.feedback.thanks',
      'detail.feedback.resolved_ago',
      'detail.photo.delete_confirm',
      'detail.photo.delete_failed',
      'detail.photo.delete_aria',
      'detail.error.not_found',
      'detail.error.not_found_blurb',
      'detail.error.forbidden',
      'detail.error.rate_limited.title',
      'detail.error.rate_limited.blurb',
      'detail.error.generic',
      'detail.error.back_home',
      'detail.loading',
      'detail.signin_required',
      'common.cancel',
      'common.confirm',
      'common.back',
      'common.back_home_short',
      'common.continue_photo',
      'common.continue_category',
      'common.continue_note',
      'common.continue_submit',
      'time.minutes_ago',
      'time.hours_ago',
      'time.days_ago',
      'time.filed',
      'status.submitted',
      'status.routed',
      'status.in_progress',
      'status.resolved',
      'category.streetlight',
      'category.pothole',
      'category.drainage',
      'category.garbage',
      'category.other',
      'home.tagline',
      'home.cta.report',
      'home.cta.explore',
      'report.step_label',
      'report.location.h1',
      'report.location.help',
      'report.location.coordinates_label',
      'report.location.continue',
      'report.location.cancel',
      'report.location.ward_label',
      'report.location.out_of_bounds.title',
      'report.location.out_of_bounds.body',
      'report.location.out_of_bounds.move',
      'report.photo.h1',
      'report.photo.help',
      'report.photo.take_photo',
      'report.photo.remove_aria',
      'report.photo.privacy',
      'report.photo.continue',
      'report.photo.back',
      'report.photo.up_to',
      'report.category.h1',
      'report.category.help',
      'report.category.routing_note',
      'report.category.continue',
      'report.category.back',
      'report.note.h1',
      'report.note.help',
      'report.note.placeholder',
      'report.note.submit',
      'report.note.submitting',
      'report.note.help_after_submit',
      'report.note.missing_draft',
      'report.note.submit_failed',
      'report.note.back',
      'report.summary.h1',
      'report.summary.existing_found',
      'report.summary.existing_label',
      'report.summary.no_note',
      'report.summary.away_suffix',
      'report.summary.link_cta',
      'report.summary.submit_new_cta',
      'report.summary.submitting',
      'report.summary.step',
    ];
    for (const k of pageKeys) {
      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (TRANSLATIONS as Record<string, unknown>)[k],
        `${k} must be registered in the key registry`,
      ).toBeDefined();
    }
  });

  it('interpolates {name} placeholders in the t() vars form', () => {
    // The new vars form: t(key, vars, lang). Use a key with a {var}.
    const interpolated = t('report.summary.existing_found', { distance: 50 }, 'en');
    expect(interpolated).toContain('50m');
    expect(interpolated).not.toContain('{distance}');
  });

  it('t(key, vars, lang) falls back when the placeholder is missing', () => {
    // Unknown placeholder names are left intact so the gap is visible in QA.
    const out = t('report.summary.existing_found', {}, 'en');
    expect(out).toContain('{distance}');
  });
});