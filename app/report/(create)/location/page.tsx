/**
 * 1.7 Report — Location Confirm (S-004.1 redesign)
 * (route group: app/report/(create)/location — resolves to /report/location)
 *
 * Two-region layout (map left + 480px side card right) at large
 * viewport; collapses to a single column on mobile where the map
 * occupies the top 60% and the card slides under it.
 *
 * The card structure is:
 *   - H1: "অবস্থান নিশ্চিত করুন" (Confirm location)
 *   - One-paragraph instruction (≤ 24 words, Bangla)
 *   - Reverse-geocoded address (one line, secondary)
 *   - Ward name (one line, secondary)
 *   - Coordinates in mono font (caption)
 *   - Big "Continue" primary button (full-width on mobile)
 *   - Small "Pick on map" text button below
 *
 * The geofence-reject path renders as an inline error card on the
 * `--color-danger-soft` fill with a 1px `--color-danger` border + X
 * icon + one-sentence explanation + "Adjust the pin" action that
 * snaps the pin back to the nearest in-bounds point.
 *
 * Server component for the static shell; the draggable map is a
 * client component. The flow state (city, ward, lat/lng) is
 * loaded from /api/report/bootstrap on first visit and persisted
 * in sessionStorage.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MapView from '@/components/MapView';
import { ReportStepAside } from '@/components/ui/ReportStepAside';
import { ReportStepPrimary } from '@/components/ui/ReportStepPrimary';
import { ReportStepBack } from '@/components/ui/ReportStepBack';
import { DHAKA_CENTER } from '@/lib/geo/constants';
import {
  DHAKA_DISTRICT_BBOX,
  DHAKA_DISTRICT_RING,
} from '@/lib/geo/dhaka-district';
import { pointInPolygon } from '@/lib/geo/polygon-test';
import {
  emptyDraft,
  loadDraft,
  saveDraft,
} from '@/lib/report-draft';
import {
  clampToGeofence,
  inGeofence,
} from '@/lib/report-geofence';
import { t, type Language } from '@/lib/i18n/keys';
import { useLanguage } from '@/components/useLanguage';
import { ReportFlowSkeleton } from '@/components/ui/Skeleton';


interface Bootstrap {
  city: { id: string; name: string; nameBn: string | null; defaultLanguage: 'bn' | 'en' };
  ward: { id: string; cityId: string; number: number; name: string; nameBn: string | null } | null;
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    nameBn: string | null;
    narrowCategoryPhotoCap: number | null;
  }>;
}

// In-bounds check for the report location step (R-1).
//
// v1 uses a hand-traced Dhaka District polygon
// (lib/geo/dhaka-district.ts) as the primary
// in-bounds test. The `DHAKA_DISTRICT_BBOX` constant
// remains the backstop for the defensive UX
// (the out-of-bounds card fires on a true
// ray-casting miss; the bbox is the cheapest
// sanity check before we render the basemap
// out to the visible area).
//
// v1.1 will replace the constant with the
// bootstrap-sourced `ward.polygonGeoJson`. The
// helper API (`inGeofence` / `pointInPolygon`)
// does not change.
function isInBounds(lat: number, lng: number): boolean {
  // Defensive bbox backstop (cheap; runs first).
  if (!inGeofence(lat, lng, DHAKA_DISTRICT_BBOX)) {
    return false;
  }
  // Polygon test (the real shape).
  return pointInPolygon(lng, lat, DHAKA_DISTRICT_RING);
}

export default function LocationPage() {
  // The shared hook owns the language. This page used to
  // hard-code Bangla at module scope, so it ignored the user's
  // language choice entirely.
  const { lang } = useLanguage();
  const LANG = lang;
  const router = useRouter();
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [lat, setLat] = useState<number>(DHAKA_CENTER.lat);
  const [lng, setLng] = useState<number>(DHAKA_CENTER.lng);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/report/bootstrap', { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        if (!cancelled) setAuthed(false);
        return;
      }
      if (!res.ok) {
        if (!cancelled) setAuthed(false);
        return;
      }
      const data = (await res.json()) as Bootstrap;
      if (cancelled) return;
      setBoot(data);
      setAuthed(true);
      // Restore draft if present; otherwise initialise from city center.
      const draft = loadDraft();
      if (draft) {
        setLat(draft.locationLat);
        setLng(draft.locationLng);
      } else if (data.ward) {
        const initial = emptyDraft(data.city.id, data.ward.id);
        setLat(initial.locationLat);
        setLng(initial.locationLng);
        saveDraft(initial);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authed === false) {
    return (
      <div style={{ padding: 'var(--space-7) var(--space-5)' }}>
        <p style={{ fontSize: 'var(--text-body-lg)', color: 'var(--color-ink)' }}>
          {t('auth.signin_required_long', null, LANG)}
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            marginTop: 'var(--space-3)',
            color: 'var(--color-primary)',
            fontWeight: 'var(--weight-semibold)',
          }}
        >
          {t('auth.back_home', null, LANG)}
        </a>
      </div>
    );
  }

  if (!boot) {
    return <ReportFlowSkeleton lang={LANG} testId="report-location-loading" />;
  }

  const outOfBounds = !isInBounds(lat, lng);

  function handleContinue() {
    if (!boot) return;
    const draft = loadDraft() ?? emptyDraft(boot.city.id, boot.ward?.id ?? '');
    const wardNameBn = boot.ward?.nameBn ?? boot.ward?.name ?? '';
    const cityNameBn = boot.city.nameBn ?? boot.city.name;
    const locationLabel = wardNameBn ? `${wardNameBn}, ${cityNameBn}` : cityNameBn;
    const next = {
      ...draft,
      cityId: boot.city.id,
      wardId: boot.ward?.id ?? '',
      locationLat: lat,
      locationLng: lng,
      locationLabel,
      step: 'category' as const,
    };
    saveDraft(next);
    router.push('/report/category');
  }

  function handleMoveToBoundary() {
    const clamped = clampToGeofence(lat, lng, DHAKA_DISTRICT_BBOX);
    setLat(clamped.lat);
    setLng(clamped.lng);
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) var(--report-side-panel)',
        gap: 0,
        // Use `height` (not minHeight) so the inner
        // map's 100% resolves to a real pixel
        // measurement. The viewport-based height
        // gives the map a full-screen section; the
        // media query below collapses to single
        // column at 1024px and the height is
        // reduced to auto so the section sizes to
        // its content.
        height: 'calc(100vh - var(--header-height-desktop))',
        minHeight: 480,
      }}
      className="report-location-grid"
    >
      <style>{`
        @media (max-width: 1024px) {
          .report-location-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: 60% 40% !important;
            height: auto !important;
            min-height: calc(100vh - var(--header-height-mobile)) !important;
          }
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          // Fill the grid track vertically; the
          // map's container is 100% × 100% so it
          // covers the full section. The 480px
          // min-height is a floor for very short
          // viewports (e.g. phone landscape).
          height: '100%',
          minHeight: 320,
        }}
      >
        <MapView
          lat={lat}
          lng={lng}
          center={DHAKA_CENTER}
          draggable
          showBoundary={!outOfBounds}
          onPinMove={(nlat, nlng) => {
            setLat(nlat);
            setLng(nlng);
          }}
        />

        {/* Mobile-only geofence banner overlay (above the map) */}
        {outOfBounds && (
          <div
            className="report-geofence-overlay"
            role="alert"
            style={{
              position: 'absolute',
              top: 'var(--space-3)',
              left: 'var(--space-3)',
              right: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-danger-soft)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-danger)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'flex-start',
              zIndex: 5,
            }}
          >
            <span
              aria-hidden
              style={{
                color: 'var(--color-danger)',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong
                lang={LANG}
                style={{
                  display: 'block',
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                {t('report.location.out_of_bounds.title', null, LANG)}
              </strong>
              <p
                lang={LANG}
                style={{
                  fontSize: 'var(--text-caption)',
                  margin: 0,
                  color: 'var(--color-ink-secondary)',
                  lineHeight: 1.5,
                }}
              >
                {t('report.location.out_of_bounds.body', null, LANG)}
              </p>
            </div>
          </div>
        )}
      </div>

      <ReportStepAside
        currentStep={1}
        totalSteps={5}
        lang={LANG}
        title={t('report.location.h1', null, LANG)}
        help={t('report.location.help', null, LANG)}
        primary={
          outOfBounds ? (
            <ReportStepPrimary onClick={handleMoveToBoundary}>
              {t('report.location.out_of_bounds.move', null, LANG)}
            </ReportStepPrimary>
          ) : (
            <ReportStepPrimary onClick={handleContinue}>
              {t('report.location.continue', null, LANG)}
            </ReportStepPrimary>
          )
        }
        back={
          <ReportStepBack href="/">
            {t('report.location.cancel', null, LANG)}
          </ReportStepBack>
        }
      >
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 'var(--space-2) var(--space-4)',
            margin: 0,
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-surface-page)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            fontSize: 'var(--text-caption)',
          }}
        >
          <dt style={{ color: 'var(--color-ink-secondary)' }}>
            {t('report.location.coordinates_label', null, LANG)}
          </dt>
          <dd
            style={{
              margin: 0,
              fontWeight: 'var(--weight-semibold)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-ink)',
            }}
          >
            {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
          </dd>
          <dt style={{ color: 'var(--color-ink-secondary)' }}>
            {t('report.location.ward_label', null, LANG)}
          </dt>
          <dd style={{ margin: 0, fontWeight: 'var(--weight-semibold)' }} lang={LANG}>
            {boot.ward?.nameBn ?? '—'} ({boot.ward?.number ?? '?'})
          </dd>
        </dl>

        {outOfBounds && (
          <div
            role="alert"
            style={{
              padding: 'var(--space-4)',
              background: 'var(--color-danger-soft)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-danger)',
              color: 'var(--color-ink)',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'center',
                marginBottom: 'var(--space-2)',
              }}
            >
              <span
                aria-hidden
                style={{
                  color: 'var(--color-danger)',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </span>
              <strong
                lang={LANG}
                style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-ink)',
                }}
              >
                {t('report.location.out_of_bounds.title', null, LANG)}
              </strong>
            </div>
            <p
              lang={LANG}
              style={{
                fontSize: 'var(--text-caption)',
                margin: 0,
                lineHeight: 1.5,
                color: 'var(--color-ink-secondary)',
              }}
            >
              {t('report.location.out_of_bounds.body', null, LANG)}
            </p>
          </div>
        )}
      </ReportStepAside>
    </div>
  );
}
