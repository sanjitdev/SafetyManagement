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

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MapView from '@/components/MapView';
import { ReportStepAside } from '@/components/ui/ReportStepAside';
import { ReportStepPrimary } from '@/components/ui/ReportStepPrimary';
import { ReportStepBack } from '@/components/ui/ReportStepBack';
import { ICONS } from '@/lib/ui/icon-map';
import { DHAKA_CENTER } from '@/lib/geo/constants';
import {
  DHAKA_DISTRICT_BBOX,
  DHAKA_DISTRICT_RING,
} from '@/lib/geo/dhaka-district';
import { pointInPolygon } from '@/lib/geo/polygon-test';
import {
  findWardAt,
  findWardByNumber,
  interiorPoint,
  type WardBoundary,
} from '@/lib/geo/ward-lookup';
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
  city: {
    id: string;
    slug: string;
    name: string;
    nameBn: string | null;
    defaultLanguage: 'bn' | 'en';
  };
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
  const [wards, setWards] = useState<WardBoundary[]>([]);
  const [lat, setLat] = useState<number>(DHAKA_CENTER.lat);
  const [lng, setLng] = useState<number>(DHAKA_CENTER.lng);
  const [authed, setAuthed] = useState<boolean | null>(null);
  // True once the citizen has moved the pin themselves. Until then
  // the page is free to place the pin at a sensible default (the
  // home ward). A restored draft counts as "not moved" only when
  // it carries the default coordinates — a draft the citizen
  // saved from a previous step IS their choice.
  const [pinMoved, setPinMoved] = useState(false);

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
        // A draft that already carries a chosen point is the
        // citizen's own decision — the default-pin effect must
        // not override it. A draft still sitting on the default
        // coordinates has not chosen anything yet.
        if (
          draft.locationLat !== DHAKA_CENTER.lat ||
          draft.locationLng !== DHAKA_CENTER.lng
        ) {
          setPinMoved(true);
        }
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

  // The ward boundaries. A PUBLIC, city-scoped, cacheable
  // endpoint (not the citizen-only bootstrap) — the
  // geometry is ~58k vertices and does not belong in a
  // payload every report step re-downloads.
  //
  // The city slug is not known until the bootstrap
  // resolves, so the fetch is chained off it.
  useEffect(() => {
    if (!boot) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/cities/${boot.city.slug}/wards/geojson`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { wards: WardBoundary[] };
        if (cancelled) return;
        setWards(data.wards ?? []);
      } catch {
        // The map still works without boundaries; the ward
        // row falls back to the bootstrap value.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boot]);

  const outOfBounds = !isInBounds(lat, lng);

  // The DEFAULT pin must sit inside the citizen's home ward.
  //
  // `DHAKA_CENTER` (23.7890, 90.4075) is in Ward 19, but every
  // demo persona, crew and seeded ticket is scoped to Ward 14.
  // Accepting the default pin unchanged would file the report in
  // Ward 19 — where no dispatcher or crew can see it, because
  // both list filters require `wardId === session.wardId`.
  //
  // So once the boundaries load, the pin is moved to an interior
  // point of the home ward — but ONLY while the citizen has not
  // moved the pin themselves.
  useEffect(() => {
    if (pinMoved) return;
    if (!boot || !boot.ward || wards.length === 0) return;
    const home = findWardByNumber(wards, boot.ward.number);
    if (!home) return;
    const point = interiorPoint(home);
    if (!point) return;
    setLat(point.lat);
    setLng(point.lng);
  }, [boot, wards, pinMoved]);

  // The ward that CONTAINS the pin. This is the ward the
  // report will be filed under — not the citizen's home
  // ward. A report filed against the wrong ward is invisible
  // to the dispatcher and crew who should handle it (both
  // list filters require `wardId === session.wardId`), so
  // the resolution must be exact and must not silently fall
  // back to the home ward.
  const resolvedWard = useMemo(
    () => findWardAt(wards, lat, lng),
    [wards, lat, lng],
  );

  // The home ward, for the "this is not your ward" notice.
  const homeWard =
    boot?.ward && boot.ward.number
      ? findWardByNumber(wards, boot.ward.number)
      : null;

  // The report cannot be filed until the point resolves to a
  // ward. Either the pin is outside the city entirely (the
  // out-of-bounds card) or it is inside the city but in a
  // place with no ward of its own (e.g. Dhaka Cantonment —
  // the "unresolved" card).
  const wardUnresolved = !outOfBounds && resolvedWard === null;

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

  function handleContinue() {
    if (!boot || !resolvedWard) return;
    const draft = loadDraft() ?? emptyDraft(boot.city.id, resolvedWard.id);
    const wardNameBn = resolvedWard.nameBn ?? resolvedWard.name;
    const cityNameBn = boot.city.nameBn ?? boot.city.name;
    const locationLabel = wardNameBn ? `${wardNameBn}, ${cityNameBn}` : cityNameBn;
    const next = {
      ...draft,
      cityId: boot.city.id,
      // The RESOLVED ward, not the citizen's home ward.
      wardId: resolvedWard.id,
      locationLat: lat,
      locationLng: lng,
      locationLabel,
      step: 'photo' as const,
    };
    saveDraft(next);
    router.push('/report/photo');
  }

  function handleMoveToBoundary() {
    const clamped = clampToGeofence(lat, lng, DHAKA_DISTRICT_BBOX);
    setLat(clamped.lat);
    setLng(clamped.lng);
  }

  // Move the pin into the citizen's HOME ward. Used when the
  // ward is unresolved so the citizen can recover in one tap.
  function handleMoveToHomeWard() {
    if (!homeWard) return;
    const point = interiorPoint(homeWard);
    if (!point) return;
    setPinMoved(true);
    setLat(point.lat);
    setLng(point.lng);
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) var(--report-side-panel)',
        gap: 0,
        // Use `height` (not minHeight) so the inner
        // map's 100% resolves to a real pixel
        // measurement.
        //
        // The height is the CONTENT REGION's height, not the
        // viewport's. `calc(100vh - var(--header-height-desktop))`
        // subtracted only the global header and ignored the
        // step-indicator strip, so the page was 124px taller than
        // the space it had and `.role-app-content` scrolled — the
        // scrollbar the citizen saw on every report step.
        height: 'var(--report-content-height)',
        minHeight: 0,
        // Reserve the FIXED action bar's footprint so the last
        // element in the column is never hidden behind it. The bar
        // is `--sticky-cta-height` tall plus its own
        // `--space-3` padding above and below and a 1px top
        // border; the extra `--space-8` is the clearance the
        // mockup reserves below it.
        paddingBottom:
          'calc(var(--sticky-cta-height) + var(--space-3) * 2 + 1px + var(--space-8))',
      }}
      className="report-location-grid"
      data-report-step-page
    >
      <style>{`
        /*
         * The report flow renders the role sidebar beside this page
         * (220px), so the CONTENT column is 220px narrower than the
         * viewport. The side panel itself steps down to the 360px
         * token via a scoped --report-side-panel redefinition in
         * globals.css; this query only handles the point where the
         * two columns no longer fit side by side and the layout
         * collapses to one.
         *
         * Collapsed, the map keeps a BOUNDED share of the viewport
         * and the confirm card flows below it at its natural height.
         * The old 60%/40% rows resolved their percentages against an
         * auto height, which meant the card was clipped into a fixed
         * track and scrolled on its own — a second scrollbar inside
         * the page. Now the region is the only scroll container.
         *
         * The map's share is capped at 34vh (and at 280px on a phone).
         * On this step the map is a REFERENCE — the citizen is reading
         * the address and pressing Continue — so the card deserves the
         * room, and a taller map only buys scroll distance.
         */
        @media (max-width: 1180px) {
          .report-location-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: minmax(200px, 34vh) auto !important;
            height: auto !important;
            min-height: 0 !important;
          }
        }
        @media (max-width: 640px) {
          .report-location-grid {
            grid-template-rows: minmax(180px, 280px) auto !important;
          }
        }
        /*
         * A VERY SHORT phone (≤ 700px tall): the map gives up more
         * height. At 280px the map and the confirm card together
         * overflowed a 524px region, and the map is the element that
         * can afford to shrink — it is a reference, not the action.
         */
        @media (max-width: 640px) and (max-height: 700px) {
          .report-location-grid {
            grid-template-rows: minmax(140px, 180px) auto !important;
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
          minHeight: 'var(--space-9)',
        }}
      >
        <MapView
          lat={lat}
          lng={lng}
          // The map follows the PIN, not the city centre. The
          // pin may start in the citizen's home ward (far from
          // `DHAKA_CENTER`) and the ward sections only make sense
          // when the active ward is on screen.
          center={{ lat, lng }}
          draggable
          showBoundary={!outOfBounds}
          wardBoundaries={wards}
          activeWardId={resolvedWard?.id ?? null}
          onPinMove={(nlat, nlng) => {
            setPinMoved(true);
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
                width: 'var(--space-6)',
                height: 'var(--space-6)',
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
        sticky
        title={t('report.location.h1', null, LANG)}
        help={t('report.location.help', null, LANG)}
        primary={
          outOfBounds ? (
            <ReportStepPrimary onClick={handleMoveToBoundary}>
              {t('report.location.out_of_bounds.move', null, LANG)}
            </ReportStepPrimary>
          ) : wardUnresolved ? (
            <ReportStepPrimary
              onClick={handleMoveToHomeWard}
              disabled={!homeWard}
              data-testid="report-location-move-home-ward"
            >
              {t('report.location.ward_outside_hint', null, LANG)}
            </ReportStepPrimary>
          ) : (
            <ReportStepPrimary
              onClick={handleContinue}
              disabled={!resolvedWard}
              trailing={
                <span aria-hidden style={{ display: 'inline-flex' }}>
                  <ICONS.forward.icon size={16} weight={ICONS.forward.weight} />
                </span>
              }
              data-testid="report-location-confirm"
            >
              {t('report.step.continue_next', { next: t('report.step.2', null, LANG) }, LANG)}
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
          <dd
            style={{
              margin: 0,
              fontWeight: 'var(--weight-semibold)',
              color: resolvedWard ? 'var(--color-ink)' : 'var(--color-danger)',
            }}
            lang={LANG}
            data-testid="report-location-ward"
          >
            {resolvedWard
              ? `${resolvedWard.nameBn ?? resolvedWard.name} (${resolvedWard.number})`
              : wards.length > 0
                ? t('report.location.ward_unresolved', null, LANG)
                : boot.ward?.nameBn ?? t('report.location.ward_unknown', null, LANG)}
            {resolvedWard ? '' : boot.ward?.number && wards.length === 0 ? ` (${boot.ward.number})` : ''}
          </dd>
        </dl>

        {/*
         * The report is filed in the ward that contains the
         * PIN, which may not be the citizen's home ward. A
         * cross-ward ticket is routed to that ward's crew —
         * so the citizen must be told before Continue.
         */}
        {resolvedWard && homeWard && resolvedWard.id !== homeWard.id && (
          <p
            lang={LANG}
            style={{
              margin: 0,
              fontSize: 'var(--text-caption)',
              lineHeight: 1.5,
              color: 'var(--color-ink-secondary)',
            }}
          >
            {t('report.location.cross_ward_notice', null, LANG)}
          </p>
        )}

        {wardUnresolved && (
          <div
            role="alert"
            data-testid="report-location-ward-unresolved"
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
                {t('report.location.ward_unresolved', null, LANG)}
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
              {t('report.location.ward_outside_hint', null, LANG)}
            </p>
          </div>
        )}

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
