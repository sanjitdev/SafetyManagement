/**
 * `useWardBoundaries` — fetch a city's ward boundaries for a map.
 *
 * The staff maps (the dispatcher map, the activity map) draw the
 * same ward mosaic the citizen's report map draws. All three need
 * the same thing: the city's ward polygons, fetched ONCE, in a form
 * MapLibre can consume.
 *
 * WHY A HOOK
 * ----------
 * The citizen's report flow fetches the geometry itself, because it
 * needs the boundaries for a REASON — resolving the pin against the
 * ward — not merely for decoration. The staff maps only draw them,
 * and every one of them would otherwise repeat the same fetch, the
 * same response shape, and the same "the data arrives after the
 * map's load event" dance. That dance is where the silent
 * empty-map bugs live.
 *
 * The hook returns `[]` until the data arrives, and `[]` forever if
 * the fetch fails — a map with no ward mosaic is a perfectly
 * usable map, so a failure must never break the page.
 *
 * The city key accepts either a slug or a city id; see
 * `app/api/cities/[slug]/wards/geojson/route.ts`.
 */

'use client';

import { useEffect, useState } from 'react';
import type { WardBoundary } from '@/lib/geo/ward-lookup';

interface WardGeoJsonResponse {
  wards?: WardBoundary[];
}

export interface UseWardBoundariesResult {
  /** The ward boundaries, or `[]` while loading / on failure. */
  wards: WardBoundary[];
  /** True while the first fetch is in flight. */
  loading: boolean;
  /** The error message, or `null`. */
  error: string | null;
}

export function useWardBoundaries(
  cityKey: string | null | undefined,
): UseWardBoundariesResult {
  const [wards, setWards] = useState<WardBoundary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cityKey) {
      setWards([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(
          `/api/cities/${encodeURIComponent(cityKey)}/wards/geojson`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          if (!cancelled) {
            setError('wards_unavailable');
            setWards([]);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as WardGeoJsonResponse;
        if (cancelled) return;
        setWards(data.wards ?? []);
        setError(null);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError('wards_unavailable');
        setWards([]);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cityKey]);

  return { wards, loading, error };
}

export default useWardBoundaries;
