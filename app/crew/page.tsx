/**
 * Field crew — the crew portal's home dashboard (/crew).
 *
 * CREW-002 (Intent 004, Unit 002): the crew's primary
 * surface. The layout follows the supplied design reference
 * (`ui-design/Crew Portal Dashboard.png`):
 *
 *   - Heading: a greeting ("Good morning, Rashid") over the
 *     day's subtitle.
 *   - KPI row: four equal cards — Assigned to me, In Progress,
 *     Pending, Avg. Resolution Time.
 *   - Main grid: "Today's Jobs" (left) | the job map with
 *     NUMBERED pins (centre) | the focused-job detail panel
 *     with its status trail (right).
 *   - Bottom row: the recent-activity timeline (left) | the
 *     field-tips card (right).
 *
 * Data: `GET /api/v1/crew/tickets` returns the crew's
 * ACTIONABLE assignments (`routed` + `in_progress`). The
 * dashboard additionally needs the TERMINAL assignments to
 * compute "Completed Today" and "Avg. Resolution Time" — a
 * resolved ticket is not in the actionable set, so those two
 * numbers are impossible to derive from it. The same endpoint
 * serves them under `?scope=history`.
 *
 * Auth gate: the page redirects to /login if no session
 * is resolved. The API also enforces the same gate.
 *
 * Out of scope (v1): WebSocket / SSE updates (the page
 * polls). Out of scope (v1.1): write queue + service worker
 * (Bolt 004-004's offline-read adds a read-only cache; the
 * cache layer is the cache, the page is the fetcher).
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { useLanguage } from '@/components/useLanguage';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { ICONS } from '@/lib/ui/icon-map';
import CityActivityMap, {
  type CityActivityPin,
  type CityActivityStatus,
} from '@/components/CityActivityMap';
import {
  formatCachedAge,
  readAssignmentsCache,
  writeAssignmentsCache,
  writeTicketCache,
  type ReadResult,
} from '@/lib/crew/cache';
import type { SerializedTicket } from '@/lib/serializers/ticket';
import { firstRenderablePhotoUrl, thumbnailBackground } from '@/lib/format/photo-url';
import { ticketReference } from '@/lib/crew/ticket-reference';
import { useSession } from '@/components/SessionProvider';

const POLL_INTERVAL_MS = 30_000;

/**
 * The map's fallback centre — Dhaka. The dev store seeds every
 * ticket around (23.789, 90.4078); a real deployment centres on
 * the crew's ward centroid once the city config exposes one.
 */
const DEFAULT_CENTER = { lat: 23.789, lng: 90.4078 };

type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface CrewTicket {
  id: string;
  status: TicketStatus;
  cityId: string;
  wardId: string;
  /** The ward's display name ("Ward 14 — Mirpur"), when known. */
  wardName?: string | null;
  wardNameBn?: string | null;
  categoryId: string;
  /** The category's slug ("streetlight") — drives the icon. */
  categorySlug?: string | null;
  /** The category's display name, when known. */
  categoryName?: string | null;
  categoryNameBn?: string | null;
  locationLat: number;
  locationLng: number;
  /**
   * The street-level location label ("Gulshan-1", "Banani"), when
   * the citizen supplied one. The design's job rows show this as
   * the second line; the ward falls back to it when it is absent.
   */
  locationLabel?: string | null;
  locationLabelBn?: string | null;
  note: string | null;
  reporterId: string;
  /** The citizen's display name, when known. */
  reporterName?: string | null;
  photoUrls: string[];
  createdAt: string;
  /** When the ticket was resolved — null while it is still open. */
  resolvedAt?: string | null;
  assignedCrewId: string | null;
  /** The status trail (crew branch: real actors + timestamps). */
  trail?: TrailEntry[];
}

interface TrailEntry {
  toStatus: TicketStatus;
  actorLabel: string;
  note: string | null;
  timestamp: string;
}

type CrewFilter = 'all' | 'routed' | 'in_progress';

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return lang === 'bn' ? 'এইমাত্র' : 'just now';
  }
  if (minutes < 60) {
    return lang === 'bn'
      ? `${minutes} মিনিট আগে`
      : `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === 'bn'
      ? `${hours} ঘণ্টা আগে`
      : `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === 'bn'
    ? `${days} দিন আগে`
    : `${days} day ago`;
}

/**
 * The job's location line. The design shows the citizen's own
 * street-level label ("Gulshan-1", "Banani"); the ward name is
 * the fallback when no label was supplied.
 */
function locationText(ticket: CrewTicket, lang: Language): string {
  const label = lang === 'bn' ? ticket.locationLabelBn : ticket.locationLabel;
  if (label) return label;
  const ward = lang === 'bn' ? ticket.wardNameBn : ticket.wardName;
  return ward ?? ticket.wardId;
}

/**
 * The job's category title ("Broken streetlight", "Pothole"). The
 * display name is used when the backend join resolved; the raw
 * category id is the fallback for a city with no category row.
 */
function categoryText(ticket: CrewTicket, lang: Language): string {
  const category = lang === 'bn' ? ticket.categoryNameBn : ticket.categoryName;
  return category ?? ticket.categoryId;
}

/**
 * The scope tag in the sub-header: the crew's ward and
 * department. The scope bar used to be a hardcoded
 * "· Crew · ward_14 · dept_streetlight" string — the raw ids
 * were the only thing the page had. It now reads the session's
 * display names from the shared session payload.
 */
function scopeLabel(
  lang: Language,
  scope: {
    wardName?: string | null;
    wardNameBn?: string | null;
    departmentName?: string | null;
    departmentNameBn?: string | null;
  } | null,
): string {
  const parts: string[] = [t('crew.list.scope', null, lang)];
  const ward = lang === 'bn' ? scope?.wardNameBn : scope?.wardName;
  if (ward) {
    // The ward's display name already carries its own prefix
    // ("Ward 14 — Mirpur" / "ওয়ার্ড ১৪ — মিরপুর"), so wrapping it in
    // the "Ward {ward}" template would render
    // "ওয়ার্ড ওয়ার্ড ১৪ — মিরপুর". Only bare-number wards get the
    // template.
    parts.push(
      /^\s*(ward|ওয়ার্ড)\b/i.test(ward)
        ? ward
        : t('crew.list.scope.ward', { ward }, lang),
    );
  }
  const dept = lang === 'bn' ? scope?.departmentNameBn : scope?.departmentName;
  if (dept) {
    parts.push(t('crew.list.scope.department', { dept }, lang));
  }
  return parts.join(' · ');
}

/**
 * The greeting's time-of-day variant. The design's reference
 * screenshot shows "Good morning"; the greeting follows the
 * device clock so a crew member opening the page at 6pm is not
 * told it is morning.
 */
function greetingKey(lang: Language): 'crew.dashboard.greeting' | 'crew.dashboard.greeting_afternoon' | 'crew.dashboard.greeting_evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'crew.dashboard.greeting';
  if (hour < 17) return 'crew.dashboard.greeting_afternoon';
  return 'crew.dashboard.greeting_evening';
}

/**
 * The crew's first name. The session carries the full display
 * name ("Rashid Hossain"); the design greets the first name
 * only. Falls back to the full name when there is no space.
 */
function firstName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  const [first] = trimmed.split(/\s+/);
  return first || trimmed;
}

/**
 * The average resolution time across the crew's finished jobs,
 * formatted as "6h 30m". Returns null when the crew has not
 * finished anything (the KPI renders an em dash).
 */
function averageResolution(
  tickets: CrewTicket[],
): { text: string; hasData: boolean } {
  const durations = tickets
    .filter((tk) => tk.status === 'resolved' && tk.resolvedAt)
    .map((tk) => {
      const start = new Date(tk.createdAt).getTime();
      const end = new Date(tk.resolvedAt!).getTime();
      return Math.max(0, end - start);
    });
  if (durations.length === 0) return { text: '—', hasData: false };
  const total = durations.reduce((sum, d) => sum + d, 0);
  const avg = Math.round(total / durations.length / 60_000); // minutes
  const hours = Math.floor(avg / 60);
  const minutes = avg % 60;
  return { text: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`, hasData: true };
}

/**
 * The clock time of a slot, in the crew's locale — "10:00 AM" /
 * "১০:০০". The design's job rows show the job's scheduled time on
 * the second line, next to a clock glyph.
 */
function formatClockTime(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  if (lang === 'bn') {
    // Bangla digits + a 12-hour clock with the meridiem in Bangla.
    const hours12 = d.getHours() % 12 || 12;
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const meridiem = d.getHours() < 12 ? 'পূর্বাহ্ণ' : 'অপরাহ্ণ';
    return `${toBanglaDigits(String(hours12))}:${toBanglaDigits(minutes)} ${meridiem}`;
  }
  const hours12 = d.getHours() % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const meridiem = d.getHours() < 12 ? 'AM' : 'PM';
  return `${hours12}:${minutes} ${meridiem}`;
}

/** ASCII digits → Bangla digits (০-৯). */
function toBanglaDigits(value: string): string {
  const bangla = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return value.replace(/[0-9]/g, (d) => bangla[Number(d)]);
}

/**
 * A calendar-anchored timestamp — "Today, 09:45 AM" / "Yesterday, 4:20 PM".
 *
 * The design's focused-job trail shows WHEN each step happened, not
 * how long ago it was ("Today, 09:45 AM", "Started at 10:00 AM"). A
 * relative age ("6 hr ago") cannot answer "did I start this before
 * or after my 10 AM round?" — which is the question the crew is
 * actually reading the trail for. So the trail uses absolute times.
 */
function formatAbsoluteTime(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const dayLabel =
    d.getTime() >= startOfToday.getTime()
      ? lang === 'bn'
        ? 'আজ'
        : 'Today'
      : d.getTime() >= startOfToday.getTime() - dayMs
        ? lang === 'bn'
          ? 'গতকাল'
          : 'Yesterday'
        : null;
  const clock = formatClockTime(iso, lang);
  if (dayLabel === null) {
    // Older than yesterday — show the date instead of a day word.
    const date = lang === 'bn'
      ? `${toBanglaDigits(String(d.getDate()))}/${toBanglaDigits(String(d.getMonth() + 1))}/${toBanglaDigits(String(d.getFullYear()))}`
      : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    return `${date}, ${clock}`;
  }
  return lang === 'bn' ? `${dayLabel}, ${clock}` : `${dayLabel}, ${clock}`;
}

/**
 * The work estimate for a job, in the crew's locale — "1h" / "১ ঘণ্টা".
 *
 * The design shows an estimate next to the scheduled time
 * ("10:00 AM • 1h est"). There is no per-ticket estimate column in
 * the data model, so the number is DERIVED from the crew's own
 * measured performance: see `categoryEstimateMinutes`. A crew that
 * finishes a streetlight in 40 minutes shows "40m est"; one that
 * takes two hours shows "2h est". That is honest about what the
 * number means — it is the crew's own track record for the work,
 * not a promise.
 */
function formatEstimate(
  minutes: number | null,
  lang: Language,
): string | null {
  if (minutes === null || minutes <= 0) return null;
  if (minutes < 60) {
    return lang === 'bn' ? `${toBanglaDigits(String(minutes))} মিনিট` : `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  return lang === 'bn'
    ? `${toBanglaDigits(String(hours))} ঘণ্টা`
    : `${hours}h`;
}

/**
 * The typical work time (in minutes) of the crew's finished jobs
 * for one category. Null when the crew has no finished job of that
 * category to learn from.
 *
 * This is the SHORTEST of the crew's finished jobs for the
 * category, not the median. A median is skewed by one-off
 * backlog — a job that sat for a day because the crew was busy
 * elsewhere — and a planning figure has to answer "how long does
 * THIS work take?", not "how long did the queue take?". The
 * shortest finished job of the category is the closest thing the
 * data has to a clean measurement of the work itself: it is the
 * one the crew got to without waiting.
 */
function categoryEstimateMinutes(
  history: CrewTicket[],
  categoryId: string,
): number | null {
  const durations = history
    .filter((tk) => tk.status === 'resolved' && tk.resolvedAt)
    .filter((tk) => tk.categoryId === categoryId)
    .map((tk) => {
      const start = new Date(tk.createdAt).getTime();
      const end = new Date(tk.resolvedAt!).getTime();
      return Math.max(0, end - start) / 60_000;
    })
    .sort((a, b) => a - b);
  if (durations.length === 0) return null;
  return Math.max(1, Math.round(durations[0]));
}

/**
 * The moment a job was assigned to the crew — the `routed` trail
 * entry. Falls back to the ticket's creation time when the trail is
 * unavailable (the crew branch always carries it, but the cached
 * snapshot may not).
 */
function assignedAt(ticket: CrewTicket): string {
  const routed = (ticket.trail ?? []).find((e) => e.toStatus === 'routed');
  return routed?.timestamp ?? ticket.createdAt;
}

/**
 * The trail steps the detail panel renders.
 *
 * The design shows a fixed four-step ladder — Assigned → In
 * Progress → Pending Review → Completed — with the reached steps
 * filled in.
 *
 * Two of those steps do not map 1:1 onto a status:
 *   - "Assigned" ← the ticket's `routed` transition (the crew was
 *     assigned the job).
 *   - "Pending Review" ← the dispatcher checks the crew's
 *     resolution. There is no distinct status for it, so the step
 *     is filled in once the ticket has been RESOLVED — the
 *     review queue is the dispatcher's, and a crew member never
 *     performs it.
 *   - "Completed" ← the ticket's `resolved` transition.
 */
const TRAIL_STEPS: Array<{
  status: TicketStatus;
  labelKey: string;
  /**
   * When true, the step is filled in by a LATER status than its
   * own — "Pending Review" is satisfied by `resolved`, which
   * happens before "Completed" in the ladder.
   */
  satisfiedBy?: TicketStatus;
}> = [
  { status: 'routed', labelKey: 'crew.dashboard.trail.assigned' },
  { status: 'in_progress', labelKey: 'status.in_progress' },
  {
    status: 'resolved',
    labelKey: 'crew.dashboard.trail.pending_report',
    satisfiedBy: 'resolved',
  },
  { status: 'resolved', labelKey: 'crew.dashboard.trail.completed' },
];

export default function CrewPage() {
  const { lang, setLang } = useLanguage();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<CrewTicket[]>([]);
  const [history, setHistory] = useState<CrewTicket[]>([]);
  const [filter, setFilter] = useState<CrewFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  // The focused job in the detail panel. Null until the crew
  // picks a row (the design opens on the first job).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // CREW-006 — the cache snapshot the page fell
  // back to on network failure. `null` means the
  // page is showing fresh data (or is mid-fetch).
  // The banner renders the cached age via
  // `formatCachedAge(cachedAt, now, lang)`.
  const [cacheSnapshot, setCacheSnapshot] = useState<ReadResult<SerializedTicket[]> | null>(null);
  // The crew's session userId is fetched on mount
  // and used to scope the cache keys.
  const [userId, setUserId] = useState<string | null>(null);
  // The session's scope labels (ward + department display
  // names) for the scope bar under the header. Null while the
  // auth check is still in flight.
  const [scope, setScope] = useState<{
    wardId?: string | null;
    wardName?: string | null;
    wardNameBn?: string | null;
    departmentId?: string | null;
    departmentName?: string | null;
    departmentNameBn?: string | null;
  } | null>(null);
  // Geolocation: the page may render a distance column
  // when the device grants permission. Three states:
  //   null  — not asked yet (idle)
  //   'granted' — coords are populated
  //   'denied' — the user declined (or the API is unavailable)
  const [geo, setGeo] = useState<
    | { state: 'granted'; lat: number; lng: number }
    | { state: 'denied' }
    | null
  >(null);
  // The shared session — one request for the whole page, shared by the
  // header, the sidebar, the user menu and this page.
  const { authenticated, session } = useSession();

  useEffect(() => {
    function syncLang() {
    }
    syncLang();
    window.addEventListener('storage', syncLang);
    window.addEventListener('focus', syncLang);
    const id = window.setInterval(syncLang, 1000);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('focus', syncLang);
      window.clearInterval(id);
    };
  }, []);

  // Session-driven state: the crew's userId (which scopes the cache
  // keys) and the session's scope labels (ward / department display
  // names) for the scope bar under the header.
  //
  // This used to be its own `/api/auth/status` fetch — and the page
  // had a SECOND one further down for the signedIn gate, so the crew
  // dashboard issued two identical requests per load. Both now read the
  // shared `SessionProvider` payload.
  useEffect(() => {
    if (!session) return;
    setUserId(session.userId);
    setScope(session);
  }, [session]);

  // CREW-006 — read the cache on mount BEFORE
  // the network request lands, so the page is
  // immediately interactive on a flaky network.
  // The cache read is sync (localStorage) so
  // there's no "first paint" delay.
  useEffect(() => {
    if (!userId) return;
    const cached = readAssignmentsCache(userId);
    if (cached) {
      const items: CrewTicket[] = cached.data.map((t) => ({
        id: t.id,
        status: t.status,
        cityId: t.cityId,
        wardId: t.wardId,
        wardName: t.wardName,
        wardNameBn: t.wardNameBn,
        categoryId: t.categoryId,
        categorySlug: t.categorySlug,
        categoryName: t.categoryName,
        categoryNameBn: t.categoryNameBn,
        locationLat: t.locationLat,
        locationLng: t.locationLng,
        locationLabel: t.locationLabel,
        locationLabelBn: t.locationLabelBn,
        note: t.note,
        reporterId: t.reporterId,
        reporterName: t.reporterName,
        photoUrls: t.photoUrls,
        createdAt: t.createdAt,
        resolvedAt: t.resolvedAt,
        assignedCrewId: t.assignedCrewId,
      }));
      setTickets(items);
      setCacheSnapshot(cached);
      setLoading(false);
    }
  }, [userId]);

  const fetchTickets = useCallback(async () => {
    try {
      const status = filter === 'all' ? undefined : filter;
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      qs.set('limit', '50');
      const url =
        '/api/v1/crew/tickets' + (qs.toString() ? `?${qs.toString()}` : '');
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        // Network failure or 5xx. CREW-006: stay
        // on the cached snapshot (if any) and
        // show the banner. The cache read happened
        // on mount; we don't re-read here — the
        // snapshot is already in state.
        setError('crew.list.error');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        tickets: Array<{
          id: string;
          status: TicketStatus;
          cityId: string;
          wardId: string;
          wardName?: string | null;
          wardNameBn?: string | null;
          categoryId: string;
          categorySlug?: string | null;
          categoryName?: string | null;
          categoryNameBn?: string | null;
          locationLat: number;
          locationLng: number;
          locationLabel?: string | null;
          locationLabelBn?: string | null;
          note: string | null;
          photoUrls: string[];
          reporterId: string;
          reporterName?: string | null;
          createdAt: string;
          resolvedAt?: string | null;
          assignedCrewId: string | null;
          internalNote: string | null;
          trail: TrailEntry[];
        }>;
      };
      const items: CrewTicket[] = data.tickets.map((t) => ({
        id: t.id,
        status: t.status,
        cityId: t.cityId,
        wardId: t.wardId,
        wardName: t.wardName,
        wardNameBn: t.wardNameBn,
        categoryId: t.categoryId,
        categorySlug: t.categorySlug,
        categoryName: t.categoryName,
        categoryNameBn: t.categoryNameBn,
        locationLat: t.locationLat,
        locationLng: t.locationLng,
        locationLabel: t.locationLabel,
        locationLabelBn: t.locationLabelBn,
        note: t.note,
        reporterId: t.reporterId,
        reporterName: t.reporterName,
        photoUrls: t.photoUrls,
        createdAt: t.createdAt,
        resolvedAt: t.resolvedAt,
        assignedCrewId: t.assignedCrewId,
        trail: t.trail,
      }));
      setTickets(items);
      setLastPollAt(new Date().toISOString());
      setError(null);
      setLoading(false);
      // CREW-006 — on a successful fetch, write
      // the response to the cache + per-ticket
      // cache keys. The next mount (even on a
      // flaky network) sees the fresh snapshot.
      if (userId) {
        writeAssignmentsCache(userId, data.tickets as SerializedTicket[]);
        for (const t of data.tickets) {
          writeTicketCache(userId, t as SerializedTicket);
        }
        // Clear the cache-snapshot banner — the
        // page is now showing fresh data.
        setCacheSnapshot(null);
      }
    } catch {
      // Network failure (offline, DNS, etc.).
      // CREW-006: stay on the cached snapshot
      // and show the banner. The cache read
      // happened on mount; the snapshot is in
      // state already.
      setError('crew.list.error');
      setLoading(false);
    }
  }, [filter, userId]);

  /**
   * The crew's FINISHED assignments. The actionable list cannot
   * produce "Completed Today" or "Avg. Resolution Time" — a
   * resolved ticket is not in it — so the dashboard asks the same
   * endpoint for the history scope.
   *
   * This is a SECOND request, but it hits a different scope and
   * cannot be derived from the first. It is fired once per poll
   * alongside the actionable fetch.
   */
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/crew/tickets?scope=history&limit=100', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        tickets: Array<{
          id: string;
          status: TicketStatus;
          categoryId: string;
          createdAt: string;
          resolvedAt?: string | null;
          trail?: TrailEntry[];
        }>;
      };
      setHistory(
        data.tickets.map((t) => ({
          id: t.id,
          status: t.status,
          cityId: '',
          wardId: '',
          categoryId: t.categoryId,
          locationLat: 0,
          locationLng: 0,
          note: null,
          reporterId: '',
          photoUrls: [],
          createdAt: t.createdAt,
          resolvedAt: t.resolvedAt,
          assignedCrewId: null,
          trail: t.trail,
        })),
      );
    } catch {
      // A failed history fetch only costs the two derived KPIs —
      // the actionable list and the map are unaffected. The page
      // stays silent about it (no error banner) because the
      // primary surface is fine.
    }
  }, []);

  // Auth check — reads the shared session.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    setSignedIn(authenticated);
  }, [authenticated]);

  // Polling
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    void fetchTickets();
    void fetchHistory();
    timer = window.setInterval(() => {
      if (!cancelled) {
        void fetchTickets();
        void fetchHistory();
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn, fetchTickets, fetchHistory]);

  // Geolocation. The CTA is a real button — the browser's own
  // permission prompt is what grants access, so the request is
  // ALWAYS made from a user gesture.
  //
  // The page ALSO asks on mount: the design's map shows the day's
  // round as a route from the crew's position, so a crew member
  // who opens the dashboard should see their route without hunting
  // for a button. The browser's permission prompt is the consent
  // step — a silent auto-request without a gesture is rejected in
  // some browsers, which is why the CTA remains as the retry.
  //
  // If the API is unavailable or permission is denied, the
  // distance column and the route are hidden (graceful fallback).
  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeo({ state: 'denied' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          state: 'granted',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setGeo({ state: 'denied' });
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }, []);

  // Ask for the position once the crew is signed in, so the map can
  // draw the day's route.
  useEffect(() => {
    if (!signedIn) return;
    requestLocation();
  }, [signedIn, requestLocation]);

  /*
   * The KPIs.
   *
   * "Assigned Jobs" counts the actionable set (routed +
   * in_progress). "Completed Today" counts the jobs the crew
   * RESOLVED today — which only the HISTORY scope carries (a
   * finished ticket is not in the actionable set). "Pending"
   * counts the `routed` slice (assigned but not yet started).
   * "Total Work Time" averages the crew's finished jobs.
   */
  const kpis = useMemo(() => {
    const assigned = tickets.length;
    const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
    const pending = tickets.filter((t) => t.status === 'routed').length;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const completedToday = history.filter(
      (t) =>
        t.status === 'resolved' &&
        t.resolvedAt &&
        new Date(t.resolvedAt).getTime() >= startOfToday.getTime(),
    ).length;
    const avg = averageResolution(history);
    return { assigned, inProgress, pending, completedToday, avg };
  }, [tickets, history]);

  /**
   * The map pins — one per open job, at the job's coordinates.
   *
   * The design draws the round's stops as wrench pins (see
   * `showPinMarkers`), so the pins carry no number: the crew reads
   * the map as a route, not as a numbered list.
   */
  const mapPins = useMemo<CityActivityPin[]>(
    () =>
      tickets.map((ticket) => ({
        id: ticket.id,
        lat: ticket.locationLat,
        lng: ticket.locationLng,
        status: ticket.status as CityActivityStatus,
      })),
    [tickets],
  );

  // The focused job. Falls back to the first actionable ticket so
  // the detail panel is never empty when there IS work (the
  // design opens on a job).
  const selected = useMemo(() => {
    if (tickets.length === 0) return null;
    return tickets.find((t) => t.id === selectedId) ?? tickets[0];
  }, [tickets, selectedId]);

  /**
   * The crew's own median time per work category, in minutes.
   * Powers the "1h est" on each job row — see
   * `categoryEstimateMinutes` for why it is measured rather than
   * declared.
   */
  const estimateByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tk of history) {
      if (!tk.categoryId || map.has(tk.categoryId)) continue;
      const minutes = categoryEstimateMinutes(history, tk.categoryId);
      if (minutes !== null) map.set(tk.categoryId, minutes);
    }
    return map;
  }, [history]);

  /**
   * The recent-activity timeline. The design shows the crew's
   * own trail events newest-first: "You marked job #X as
   * completed", "You started job #X", "New job #X assigned".
   *
   * The events come from the HISTORY scope's trails (which carry
   * the terminal transitions the actionable list does not). The
   * actionable list's trails are merged in too, so a job that is
   * still open still contributes its "started" event.
   */
  const activity = useMemo(() => {
    const events: Array<{
      id: string;
      text: string;
      at: string;
      tone: 'done' | 'active' | 'plain';
    }> = [];
    const seen = new Set<string>();
    const merged = [...history, ...tickets];
    for (const tk of merged) {
      const trail = tk.trail ?? [];
      for (const entry of trail) {
        const key = `${tk.id}:${entry.toStatus}:${entry.timestamp}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const shortId = shortTicketId(tk.id);
        let text: string | null = null;
        let tone: 'done' | 'active' | 'plain' = 'plain';
        if (entry.toStatus === 'resolved') {
          text = t('crew.dashboard.activity.resolved', { id: shortId }, lang);
          tone = 'done';
        } else if (entry.toStatus === 'in_progress') {
          text = t('crew.dashboard.activity.started', { id: shortId }, lang);
          tone = 'active';
        } else if (entry.toStatus === 'routed') {
          text = t('crew.dashboard.activity.assigned', { id: shortId }, lang);
        } else if (entry.toStatus === 'submitted') {
          text = t('crew.dashboard.activity.routed', { id: shortId }, lang);
        }
        if (!text) continue;
        events.push({
          id: key,
          text,
          at: entry.timestamp,
          tone,
        });
      }
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return events.slice(0, 6);
    // `lang` is a dependency because the event TEXT is localised —
    // it must rebuild when the language flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, tickets, lang]);

  if (signedIn === false) {
    return (
      <div
        style={{
          minHeight: '100%',
          background: 'var(--color-surface-page)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-5)',
            }}
          >
            {t('crew.list.signin_required', null, lang)}
          </p>
          <Link
            href={`/login?next=${encodeURIComponent('/crew')}`}
            style={{
              display: 'inline-block',
              padding: 'var(--space-3) var(--space-5)',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('login.cta.submit', null, lang)}
          </Link>
        </div>
      </div>
    );
  }

  const crewName = firstName(
    lang === 'bn' ? session?.nameBn : session?.name,
  );

  return (
    <div className="crew-page" data-testid="crew-dashboard-page">
      {/* Heading — greeting + the day's subtitle. */}
      <div className="crew-dashboard-heading">
        <span className="crew-dashboard-heading-icon" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 6l-4 4 4 4" />
            <path d="M20 12H8" />
            <path d="M4 18v-6" />
          </svg>
        </span>
        <div>
          <h1 lang={lang}>
            {t(greetingKey(lang), { name: crewName || '—' }, lang)}
          </h1>
          <p lang={lang}>{t('crew.dashboard.subtitle', null, lang)}</p>
        </div>
      </div>

      {/* CREW-006 — cache banner. Renders when the
          page is showing a cached snapshot because
          the network failed. Hidden when fresh data is on screen. */}
      {cacheSnapshot && (
        <div
          data-testid="crew-cache-banner"
          role="status"
          lang={lang}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-warning-soft)',
            border: '1px solid var(--color-warning)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-warning)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <span aria-hidden style={{ display: 'inline-flex', color: 'var(--color-warning)' }}>
            <ICONS.statusWarning.icon size={16} weight={ICONS.statusWarning.weight} />
          </span>
          <span style={{ flex: 1 }}>
            {t(
              'crew.cache.last_updated',
              {
                when: formatCachedAge(cacheSnapshot.cachedAt, Date.now(), lang),
              },
              lang,
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              void fetchTickets();
            }}
            data-testid="crew-cache-retry"
            lang={lang}
            style={{
              padding: 'var(--space-1) var(--space-3)',
              background: 'var(--color-warning)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
            }}
          >
            {t('crew.cache.retry', null, lang)}
          </button>
        </div>
      )}

      {/* KPI row. The assigned-job count is what the crew opens the
          page to see, so it is the headline; the other three figures
          are the context around it and share one surface. */}
      <div className="crew-kpi-grid" data-testid="crew-kpi-grid">
        <MetricStrip
          lang={lang}
          className="crew-metric-strip"
          ariaLabel={t('crew.dashboard.metric.assigned', null, lang)}
          headline={{
            key: 'assigned',
            label: t('crew.dashboard.metric.assigned', null, lang),
            value: String(kpis.assigned),
            hint: t(
              'crew.dashboard.metric.assigned_hint',
              { count: kpis.assigned },
              lang,
            ),
          }}
          figures={[
            {
              key: 'completed-today',
              label: t('crew.dashboard.metric.in_progress', null, lang),
              value: String(kpis.completedToday),
              hint: t('crew.dashboard.metric.in_progress_hint', null, lang),
            },
            {
              key: 'pending',
              label: t('crew.dashboard.metric.pending', null, lang),
              value: String(kpis.pending),
              hint: t('crew.dashboard.metric.pending_hint', null, lang),
            },
            {
              key: 'avg-resolution',
              label: t('crew.dashboard.metric.avg_resolution', null, lang),
              value: kpis.avg.text,
              hint: kpis.avg.hasData
                ? t('crew.dashboard.metric.avg_resolution_hint', null, lang)
                : t('crew.dashboard.metric.no_resolution_data', null, lang),
            },
          ]}
          data-testid="crew-metric-strip"
          data-testid-headline="crew-kpi-assigned"
        />
      </div>

      {/* Main grid: jobs | map | focused detail. */}
      <div className="crew-main-grid">
        {/* Left — "Today's Jobs". */}
        <section className="crew-panel crew-jobs-panel" data-testid="crew-jobs-panel">
          <div className="crew-panel-heading">
            <h2 lang={lang}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M8 2v4M16 2v4M3 10h18" />
              </svg>
              {t('crew.dashboard.jobs_title', null, lang)}
            </h2>
            <div style={{ display: 'inline-flex', gap: 4 }}>
              {(
                [
                  ['all', 'crew.list.filter.all'],
                  ['routed', 'crew.list.filter.routed'],
                  ['in_progress', 'crew.list.filter.in_progress'],
                ] as Array<[CrewFilter, string]>
              ).map(([f, key]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  data-testid={`crew-filter-${f}`}
                  lang={lang}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 99,
                    border: `1px solid ${filter === f ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    background: filter === f ? 'var(--color-primary)' : 'transparent',
                    color: filter === f ? 'var(--color-on-primary)' : 'var(--color-ink-secondary)',
                    fontSize: 10,
                    fontWeight: 'var(--weight-semibold)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t(key, null, lang)}
                </button>
              ))}
            </div>
          </div>

          {/*
            The scope strip. It is ALWAYS rendered — even when the
            crew has granted location — because all three columns of
            the main grid carry a strip of the same height, so their
            bodies start on the same line. Dropping it (as an
            earlier version did, when location was granted) shifted
            the job list up by a whole strip and the columns looked
            staggered.
          */}
          <div className="crew-panel-strip crew-map-legend" style={{ justifyContent: 'space-between' }}>
            <span lang={lang}>{scopeLabel(lang, scope)}</span>
            {geo?.state !== 'granted' && (
              <button
                type="button"
                onClick={requestLocation}
                data-testid="crew-location-cta"
                lang={lang}
                style={{
                  padding: '2px 8px',
                  borderRadius: 99,
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-ink-secondary)',
                  fontSize: 9,
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('crew.list.row.distance_pending', null, lang)}
              </button>
            )}
          </div>

          <div className="crew-job-list" data-testid="crew-job-list">
            {loading ? (
              <ListSkeleton />
            ) : error ? (
              <p
                lang={lang}
                role="alert"
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-danger)',
                  padding: 'var(--space-4)',
                  textAlign: 'center',
                }}
              >
                {t('crew.list.error', null, lang)}
              </p>
            ) : tickets.length === 0 ? (
              <div className="crew-panel-empty">
                <p lang={lang} style={{ margin: 0 }}>
                  {t('crew.dashboard.jobs_empty', null, lang)}
                </p>
                <p lang={lang}>{t('crew.dashboard.jobs_empty_hint', null, lang)}</p>
              </div>
            ) : (
              tickets.map((ticket) => (
                <CrewJobRow
                  key={ticket.id}
                  ticket={ticket}
                  estimateMinutes={
                    estimateByCategory.get(ticket.categoryId) ?? null
                  }
                  selected={selected?.id === ticket.id}
                  onSelect={() => setSelectedId(ticket.id)}
                  lang={lang}
                />
              ))
            )}
          </div>
        </section>

        {/* Centre — the map. */}
        <section className="crew-panel crew-map-panel" data-testid="crew-map-panel">
          <div className="crew-panel-heading">
            <h2 lang={lang}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {t('crew.dashboard.map_title', null, lang)}
            </h2>
          </div>
          <div className="crew-panel-strip crew-map-legend">
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
          <div className="crew-map-canvas">
            {mapPins.length > 0 ? (
              <CityActivityMap
                pins={mapPins}
                center={DEFAULT_CENTER}
                showPinMarkers
                userLocation={geo?.state === 'granted' ? { lat: geo.lat, lng: geo.lng } : null}
                showRoute
              />
            ) : (
              <div className="crew-map-loading" />
            )}
          </div>
        </section>

        {/* Right — the focused job. */}
        <section className="crew-detail-panel" data-testid="crew-detail-panel">
          <div className="crew-panel">
            <div className="crew-panel-heading">
              <h2 lang={lang}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 4h16v16H4z" />
                  <path d="M8 9h8M8 13h5" />
                </svg>
                {t('crew.dashboard.detail_title', null, lang)}
              </h2>
            </div>
            {selected ? (
              <>
                {/*
                  The blue band is this column's STRIP — the row
                  under the heading that carries the job's location
                  and status. The other two columns carry a strip of
                  the same height (the scope note and the map
                  legend), so all three bodies start on the same
                  line. The band is rendered here rather than inside
                  `JobDetail` for exactly that reason.
                */}
                <div className="crew-panel-strip crew-detail-header">
                  <span className="crew-detail-loc" lang={lang}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                    {locationText(selected, lang)}
                  </span>
                  <span className="crew-detail-chip" lang={lang}>
                    {t(statusLabelKey(selected.status), null, lang)}
                  </span>
                </div>
                <JobDetail ticket={selected} lang={lang} />
              </>
            ) : (
              <div className="crew-panel-empty">
                <p lang={lang} style={{ margin: 0 }}>
                  {t('crew.dashboard.detail_empty', null, lang)}
                </p>
              </div>
            )}
          </div>

          {/* "Need help?" card. */}
          <div className="crew-help-card">
            <h3 lang={lang}>{t('crew.dashboard.help_title', null, lang)}</h3>
            <p lang={lang}>{t('crew.dashboard.help_body', null, lang)}</p>
            <a href="tel:999" lang={lang}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1z" />
              </svg>
              {t('crew.dashboard.help_call_dispatcher', null, lang)}
            </a>
          </div>
        </section>
      </div>

      {/* Bottom row: recent activity | field tips. */}
      <div className="crew-bottom-grid">
        <section className="crew-panel" data-testid="crew-activity-panel">
          <div className="crew-panel-heading">
            <h2 lang={lang}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {t('crew.dashboard.activity_title', null, lang)}
            </h2>
            <a href="/crew/reports" lang={lang}>
              {t('crew.dashboard.activity_view_all', null, lang)} →
            </a>
          </div>
          {activity.length === 0 ? (
            <div className="crew-panel-empty">
              <p lang={lang} style={{ margin: 0 }}>
                {t('crew.dashboard.activity_empty', null, lang)}
              </p>
            </div>
          ) : (
            <ul className="crew-activity-list">
              {activity.map((item) => (
                <li
                  key={item.id}
                  className={`crew-activity-item${
                    item.tone === 'done'
                      ? ' is-done'
                      : item.tone === 'active'
                        ? ' is-active'
                        : ''
                  }`}
                >
                  <span aria-hidden>
                    {item.tone === 'done' ? (
                      <ICONS.check.icon size={12} weight={ICONS.check.weight} />
                    ) : item.tone === 'active' ? (
                      <ICONS.statusInProgress.icon size={12} weight={ICONS.statusInProgress.weight} />
                    ) : (
                      <ICONS.statusSubmitted.icon size={12} weight={ICONS.statusSubmitted.weight} />
                    )}
                  </span>
                  <p lang={lang}>{item.text}</p>
                  <time dateTime={item.at} lang={lang}>
                    {formatAge(item.at, lang)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="crew-panel" data-testid="crew-tips-panel">
          <div className="crew-field-tips">
            <div>
              <h3 lang={lang}>{t('crew.dashboard.tips_title', null, lang)}</h3>
              <p lang={lang}>{t('crew.dashboard.tips_body', null, lang)}</p>
              <a href="/crew/safety-guide" lang={lang}>
                {t('crew.dashboard.tips_action', null, lang)} →
              </a>
            </div>
            <span className="crew-field-tips-art" aria-hidden>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4v6c0 5-3.4 9.2-8 10-4.6-.8-8-5-8-10V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The ticket id as the crew sees it ("#CF-1024").
 *
 * See `lib/crew/ticket-reference.ts` for why the reference is
 * derived from a hash of the backend id rather than a sequence.
 */
function shortTicketId(id: string): string {
  return ticketReference(id);
}

function CrewJobRow({
  ticket,
  estimateMinutes,
  selected,
  onSelect,
  lang,
}: {
  ticket: CrewTicket;
  /** The crew's own typical time for this category of work. */
  estimateMinutes: number | null;
  selected: boolean;
  onSelect: () => void;
  lang: Language;
}) {
  /*
   * The assignment thumbnail. The crew needs to recognise the job
   * site at a glance — the citizen's photo is the strongest signal.
   * The stored URL can be an inline `data:image/…` URL (the default),
   * an absolute `https://` URL, or a root-relative `/api/blob/…`
   * path, so `firstRenderablePhotoUrl` picks the first one we can
   * actually render. Without a photo, the row falls back to the
   * category glyph.
   */
  const photoUrl = firstRenderablePhotoUrl(ticket.photoUrls);
  const thumbBackground = thumbnailBackground(photoUrl);
  // The estimate reads "1h est" — the crew's own typical time for
  // this category of work. Null when the crew has no finished job
  // of the category to learn from; the row then falls back to the
  // job's age.
  const estimateText =
    estimateMinutes === null
      ? null
      : t('crew.dashboard.job_eta', { time: formatEstimate(estimateMinutes, lang) ?? '' }, lang);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="crew-list-row"
      aria-pressed={selected}
      className={`crew-job-row${selected ? ' is-selected' : ''}`}
    >
      {thumbBackground ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="crew-job-thumb"
          src={photoUrl!}
          alt=""
          aria-hidden
          loading="lazy"
        />
      ) : (
        <span className="crew-job-thumb" aria-hidden>
          <CategoryIcon slug={ticket.categorySlug} size={18} />
        </span>
      )}
      <span>
        {/* Headline: the status dot + the ticket id. */}
        <span className="crew-job-head">
          <i className={`crew-job-dot is-${ticket.status}`} aria-hidden />
          <strong className="crew-job-id" lang={lang}>
            #{shortTicketId(ticket.id)}
          </strong>
        </span>
        {/* The location line. */}
        <span className="crew-job-meta" lang={lang}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {locationText(ticket, lang)}
        </span>
        {/* The time line. The design shows the job's slot time and a
            work estimate: "10:00 AM • 1h est". The distance from the
            crew's position is deliberately NOT here — the design puts
            the round's order on the MAP (the route line), and a
            third number on this line crowds out the two the crew
            reads. */}
        <span className="crew-job-meta" lang={lang}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {formatClockTime(assignedAt(ticket), lang)}
          {estimateText
            ? ` · ${estimateText}`
            : ` · ${formatAge(ticket.createdAt, lang)}`}
        </span>
      </span>
      <span className="crew-job-status">
        <StatusPill status={ticket.status} lang={lang} />
      </span>
    </button>
  );
}

function JobDetail({ ticket, lang }: { ticket: CrewTicket; lang: Language }) {
  const photos = ticket.photoUrls.slice(0, 3);
  return (
    <div className="crew-detail-card">
      {/*
        The blue header band (the job's location + status chip) is
        rendered by the panel as its STRIP, so all three columns of
        the main grid line up. It used to live here, which pushed
        the detail column's content down a whole row relative to
        the other two.
      */}
      <h3 lang={lang}>{categoryText(ticket, lang)}</h3>

      {/*
        The evidence and the description sit SIDE BY SIDE: the photo
        is what the citizen saw, the note is what they said about it.
        The design pairs them in one row so the crew reads the picture
        and the words together.
      */}
      <div className="crew-detail-evidence">
        {photos.length > 0 ? (
          <div className="crew-detail-photos">
            {photos.map((url) => (
              <span key={url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" aria-hidden loading="lazy" />
              </span>
            ))}
          </div>
        ) : null}
        {ticket.note && (
          <p className="crew-detail-description" lang={lang}>
            {ticket.note}
          </p>
        )}
      </div>

      {ticket.reporterName && (
        <p
          className="crew-detail-description"
          lang={lang}
          style={{ marginBottom: 12 }}
        >
          {t('crew.dashboard.detail.reporter', null, lang)}:{' '}
          <strong>{ticket.reporterName}</strong>
        </p>
      )}

      {/* The status trail — the design's vertical ladder. */}
      <ol className="crew-trail" data-testid="crew-detail-trail">
        {TRAIL_STEPS.map((step, stepIndex) => {
          const lookupStatus = step.satisfiedBy ?? step.status;
          const reached = (ticket.trail ?? []).find(
            (e) => e.toStatus === lookupStatus,
          );
          // The step the ticket is currently AT is the active one —
          // the first step that has not been reached yet.
          const isActive =
            !reached &&
            stepIndex ===
              TRAIL_STEPS.findIndex((s) => {
                const lookup = s.satisfiedBy ?? s.status;
                return !(ticket.trail ?? []).some((e) => e.toStatus === lookup);
              });
          return (
            <li
              key={`${step.labelKey}:${stepIndex}`}
              className={
                reached ? 'is-done' : isActive ? 'is-active' : ''
              }
            >
              <span aria-hidden>
                {reached ? (
                  <ICONS.check.icon size={11} weight={ICONS.check.weight} />
                ) : isActive ? (
                  <ICONS.statusInProgress.icon size={11} weight={ICONS.statusInProgress.weight} />
                ) : (
                  <ICONS.statusSubmitted.icon size={11} weight={ICONS.statusSubmitted.weight} />
                )}
              </span>
              <div>
                <strong lang={lang}>{t(step.labelKey, null, lang)}</strong>
                <small lang={lang}>
                  {reached ? formatAbsoluteTime(reached.timestamp, lang) : '—'}
                </small>
              </div>
            </li>
          );
        })}
      </ol>

      {/*
        The design's two actions: attach a photo of the work, and
        declare the job done. Both are crew actions on the job they
        are standing in front of, so they live on the job card — the
        full report stays one link away.
      */}
      <div className="crew-detail-actions">
        <Link
          href={`/crew/tickets/${ticket.id}#add-photo`}
          className="crew-detail-btn is-ghost"
          lang={lang}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {t('crew.dashboard.detail.upload_photo', null, lang)}
        </Link>
        <Link
          href={`/crew/tickets/${ticket.id}#resolve`}
          className="crew-detail-btn is-solid"
          data-testid="crew-detail-mark-done"
          lang={lang}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {t('crew.dashboard.detail.mark_done', null, lang)}
        </Link>
      </div>

      <Link
        href={`/crew/tickets/${ticket.id}`}
        className="crew-detail-link"
        data-testid="crew-detail-open"
        lang={lang}
      >
        {t('crew.dashboard.detail_open', null, lang)} →
      </Link>
    </div>
  );
}

/** The i18n key for a status's label. */
function statusLabelKey(status: TicketStatus): string {
  switch (status) {
    case 'submitted':
      return 'status.submitted';
    case 'routed':
      return 'status.routed';
    case 'in_progress':
      return 'status.in_progress';
    case 'resolved':
      return 'status.resolved';
    case 'closed':
      return 'status.closed';
    case 'cancelled':
      return 'status.cancelled';
  }
}

function StatusPill({ status, lang }: { status: TicketStatus; lang: Language }) {
  // `*-soft` background + saturated `*-status` foreground — see the
  // dispatcher queue's StatusPill for why the saturated token must
  // not be used as the background.
  const map: Record<TicketStatus, { bg: string; fg: string; label: string }> = {
    submitted: {
      bg: 'var(--color-status-submitted-soft)',
      fg: 'var(--color-status-submitted)',
      label: 'status.submitted',
    },
    routed: {
      bg: 'var(--color-status-routed-soft)',
      fg: 'var(--color-status-routed)',
      label: 'status.routed',
    },
    in_progress: {
      bg: 'var(--color-status-in-progress-soft)',
      fg: 'var(--color-status-in-progress)',
      label: 'status.in_progress',
    },
    resolved: {
      bg: 'var(--color-status-resolved-soft)',
      fg: 'var(--color-status-resolved)',
      label: 'status.resolved',
    },
    closed: {
      bg: 'var(--color-surface-raised)',
      fg: 'var(--color-ink-tertiary)',
      label: 'status.closed',
    },
    cancelled: {
      bg: 'var(--color-surface-raised)',
      fg: 'var(--color-ink-tertiary)',
      label: 'status.cancelled',
    },
  };
  const c = map[status];
  return (
    <span
      lang={lang}
      style={{
        padding: '2px var(--space-2)',
        background: c.bg,
        color: c.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize: 10,
        fontWeight: 'var(--weight-bold)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {t(c.label, null, lang)}
    </span>
  );
}

function ListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 60,
            background: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-md)',
          }}
        />
      ))}
    </div>
  );
}



