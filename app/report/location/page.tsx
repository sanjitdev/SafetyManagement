/**
 * 1.7 Report — Location Confirm
 *
 * Per Phase B (2026-10-04) re-skin: two-region layout (map left + 480px
 * side card right) at large viewport; collapses at medium.
 *
 * The pin is draggable; the citizen confirms by tapping "Continue".
 * The page is the geofence reject UX entry point (R-1): if the pin is
 * outside the supported area, the card shows a guided reject path.
 *
 * Server component for the static shell; the draggable map is a client
 * component. The flow state (city, ward, lat/lng) is loaded from
 * /api/report/bootstrap on first visit and persisted in sessionStorage.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MapView from '@/components/MapView';
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

const LANG: Language = 'bn';

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
// in-bounds test. The `DHAKA_NORTH_BBOX` constant
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
    return (
      <div style={{ padding: 'var(--space-7) var(--space-5)' }}>
        <p style={{ color: 'var(--color-ink-secondary)' }}>
          {t('detail.loading', null, LANG)}
        </p>
      </div>
    );
  }

  const outOfBounds = !isInBounds(lat, lng);

  function handleContinue() {
    if (!boot) return;
    const draft = loadDraft() ?? emptyDraft(boot.city.id, boot.ward?.id ?? '');
    // Derive the display label from the ward payload — never hardcode
    // (team.md: NEVER hardcode user-facing copy; the city config is the
    // single source of truth for ward / city names).
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
      step: 'photo' as const,
    };
    saveDraft(next);
    router.push('/report/photo');
  }

  function handleMoveToBoundary() {
    // Snap to the nearest in-boundary point. Uses
    // the polygon bbox (not the Dhaka North bbox)
    // as the snap target so the citizen recovers
    // to a point inside the full Dhaka District
    // polygon, which is the v1 supported area.
    const clamped = clampToGeofence(lat, lng, DHAKA_DISTRICT_BBOX);
    setLat(clamped.lat);
    setLng(clamped.lng);
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 480px',
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
      className="report-two-region"
    >
      <style>{`
        @media (max-width: 1024px) {
          .report-two-region {
            grid-template-columns: 1fr !important;
            height: auto !important;
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
          minHeight: 480,
        }}
      >
        <MapView
          lat={lat}
          lng={lng}
          center={DHAKA_CENTER}
          // No width/height — MapView fills the
          // parent 100%. A ResizeObserver inside
          // MapView re-measures the map when the
          // responsive grid collapses at 1024px.
          draggable
          // Show the polygon fill when the pin is
          // in-bounds (the citizen sees a soft
          // "you're inside the supported area"
          // tint). The fill drops to 0 when the
          // pin is out of bounds so the citizen's
          // eye is drawn to the side card's
          // warning.
          showBoundary={!outOfBounds}
          onPinMove={(nlat, nlng) => {
            setLat(nlat);
            setLng(nlng);
          }}
        />
      </div>

      <aside
        style={{
          padding: 'var(--space-6) var(--space-5)',
          background: 'var(--color-surface-raised)',
          borderLeft: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: 'var(--space-1) var(--space-3)',
            background: 'var(--color-primary-soft, #e6f2ee)',
            color: 'var(--color-primary)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
            alignSelf: 'flex-start',
          }}
        >
          {t('report.step_label', { current: 1, total: 5 }, LANG)}
        </div>
        <h1
          lang="bn"
          style={{
            fontSize: 'var(--text-h2)',
            margin: 0,
            color: 'var(--color-ink)',
            lineHeight: 1.2,
          }}
        >
          {t('report.location.h1', null, LANG)}
        </h1>
        <p
          style={{
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-body)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {t('report.location.help', null, LANG)}
        </p>

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
          <dd style={{ margin: 0, fontWeight: 'var(--weight-semibold)' }}>
            {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
          </dd>
          <dt style={{ color: 'var(--color-ink-secondary)' }}>
            {t('report.location.ward_label', null, LANG)}
          </dt>
          <dd style={{ margin: 0, fontWeight: 'var(--weight-semibold)' }} lang="bn">
            {boot.ward?.nameBn ?? '—'} ({boot.ward?.number ?? '?'})
          </dd>
        </dl>

        {outOfBounds ? (
          <div
            style={{
              padding: 'var(--space-4)',
              background: 'var(--color-warning-soft, #fdf2cf)',
              border: '1px solid var(--color-warning, #b58410)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-ink)',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 'var(--space-2)' }} lang="bn">
              {t('report.location.out_of_bounds.title', null, LANG)}
            </strong>
            <p
              style={{
                fontSize: 'var(--text-caption)',
                margin: '0 0 var(--space-3)',
                lineHeight: 1.5,
              }}
            >
              {t('report.location.out_of_bounds.body', null, LANG)}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                onClick={handleMoveToBoundary}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--color-primary)',
                  color: 'var(--color-on-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-body)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                }}
              >
                {t('report.location.out_of_bounds.move', null, LANG)}
              </button>
              <a
                href="/"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  color: 'var(--color-ink-secondary)',
                  textDecoration: 'none',
                  fontSize: 'var(--text-body)',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {t('report.location.cancel', null, LANG)}
              </a>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              marginTop: 'auto',
            }}
          >
            <button
              type="button"
              onClick={handleContinue}
              style={{
                flex: 1,
                padding: 'var(--space-3) var(--space-5)',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                cursor: 'pointer',
              }}
            >
              {t('report.location.continue', null, LANG)}
            </button>
            <a
              href="/"
              style={{
                padding: 'var(--space-3) var(--space-4)',
                color: 'var(--color-ink-secondary)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 'var(--text-body)',
              }}
            >
              {t('report.location.cancel', null, LANG)}
            </a>
          </div>
        )}
      </aside>
    </div>
  );
}
