/**
 * Field crew — the full-screen job map (/crew/map).
 *
 * The crew portal's design reference
 * (`ui-design/Crew Portal Dashboard.png`) lists "Map" as a
 * second sidebar item beside "My Jobs". The dashboard's map
 * panel is a compact view of the crew's ward; this route is the
 * same data at full size, for the crew member who needs to
 * orient themselves before heading to a job site.
 *
 * Data: the crew's actionable assignments from
 * `GET /api/v1/crew/tickets` — the same set the dashboard
 * shows, with the same numbered pins so a job can be matched
 * between the two surfaces.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { useSession } from '@/components/SessionProvider';
import CityActivityMap, {
  type CityActivityPin,
  type CityActivityStatus,
} from '@/components/CityActivityMap';

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 30_000;
const DEFAULT_CENTER = { lat: 23.789, lng: 90.4078 };

interface MapTicket {
  id: string;
  status: CityActivityStatus;
  locationLat: number;
  locationLng: number;
  wardName?: string | null;
  wardNameBn?: string | null;
  categoryName?: string | null;
  categoryNameBn?: string | null;
}

export default function CrewMapPage() {
  const [lang, setLang] = useState<Language>('bn');
  const [tickets, setTickets] = useState<MapTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The shared session — one request for the whole page, shared by the
  // header, the sidebar, the user menu and this page.
  const { authenticated } = useSession();

  useEffect(() => {
    function syncLang() {
      try {
        const stored = window.localStorage.getItem(LANG_KEY);
        if (stored === 'en' || stored === 'bn') setLang(stored);
      } catch {
        // ignore
      }
    }
    syncLang();
    window.addEventListener('storage', syncLang);
    window.addEventListener('focus', syncLang);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('focus', syncLang);
    };
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/crew/tickets?limit=100', {
        credentials: 'include',
      });
      if (!res.ok) {
        setError('crew.list.error');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { tickets: MapTicket[] };
      setTickets(data.tickets ?? []);
      setError(null);
      setLoading(false);
    } catch {
      setError('crew.list.error');
      setLoading(false);
    }
  }, []);

  // Polling starts only once the session has resolved.
  //
  // Fetching unconditionally would double the request count under
  // React 18 StrictMode, which mounts every component twice in
  // development: the first mount fires the request, the cleanup
  // cancels the timer, the second mount fires it again. Gating on
  // the session — which is still `null` during the first mount —
  // means only the second mount issues the request.
  useEffect(() => {
    if (authenticated === null) return; // still resolving
    void fetchTickets();
    const timer = window.setInterval(() => {
      void fetchTickets();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [authenticated, fetchTickets]);

  const pins = useMemo<CityActivityPin[]>(
    () =>
      tickets.map((tk, index) => ({
        id: tk.id,
        lat: tk.locationLat,
        lng: tk.locationLng,
        status: tk.status,
        label: String(index + 1),
      })),
    [tickets],
  );

  return (
    <div
      className="crew-page"
      style={{ gridTemplateRows: 'auto minmax(0, 1fr)' }}
      data-testid="crew-map-page"
    >
      <div className="crew-dashboard-heading">
        <div>
          <h1 lang={lang}>{t('shell.nav.map', null, lang)}</h1>
          <p lang={lang}>{t('crew.dashboard.subtitle', null, lang)}</p>
        </div>
        <div style={{ marginInlineStart: 'auto' }}>
          <Link
            href="/crew"
            className="crew-detail-link"
            lang={lang}
            style={{ marginInlineStart: 'auto' }}
          >
            {t('crew.dashboard.jobs_title', null, lang)} →
          </Link>
        </div>
      </div>

      <div className="crew-panel" style={{ overflow: 'hidden' }}>
        <div className="crew-map-legend">
          <span>
            <i className="is-location" aria-hidden />
            {t('crew.dashboard.map_legend.location', null, lang)}
          </span>
          <span>
            <i aria-hidden />
            {t('crew.dashboard.map_legend.assigned', null, lang)}
          </span>
          <span>
            <i className="is-progress" aria-hidden />
            {t('crew.dashboard.map_legend.pending', null, lang)}
          </span>
          <span>
            <i className="is-completed" aria-hidden />
            {t('crew.dashboard.map_legend.completed', null, lang)}
          </span>
        </div>
        {loading ? (
          <div className="crew-map-loading" style={{ height: 'calc(100vh - 220px)' }} />
        ) : error ? (
          <p
            role="alert"
            lang={lang}
            style={{
              padding: 'var(--space-6)',
              color: 'var(--color-danger, #c92a2a)',
              textAlign: 'center',
            }}
          >
            {t('crew.list.error', null, lang)}
          </p>
        ) : pins.length === 0 ? (
          <div className="crew-panel-empty">
            <p lang={lang} style={{ margin: 0 }}>
              {t('crew.dashboard.jobs_empty', null, lang)}
            </p>
          </div>
        ) : (
          <div
            className="crew-map-canvas"
            style={{ height: 'calc(100vh - 220px)', minHeight: 420 }}
          >
            <CityActivityMap
              pins={pins}
              center={DEFAULT_CENTER}
              showPinLabels
            />
          </div>
        )}
      </div>
    </div>
  );
}
