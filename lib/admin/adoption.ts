/**
 * Admin adoption-dashboard domain logic (lib/admin/adoption.ts).
 *
 * Backs the 4.7 Post-launch Adoption Dashboard
 * (`/admin/cities/[id]/adoption`) and its API route.
 *
 * ---------------------------------------------------------------------------
 * SCHEMA MAPPING — READ THIS BEFORE THE PRISMA MIGRATION LANDS
 * ---------------------------------------------------------------------------
 *
 * 1. `SlaPolicy` — NOT IN SCHEMA and NOT NEEDED. The "avg time to
 *    resolve" hero stat is computed from the ticket rows themselves
 *    (`resolvedAt - createdAt` over the resolved tickets in range).
 *    No policy row is consulted anywhere on this page.
 *
 * 2. "Registered citizens" — there is NO registration-event table.
 *    The closest available proxy is the number of `citizen`-role
 *    `User` rows whose `createdAt` falls inside the range. A citizen
 *    who registered before the range opens is NOT counted, so the
 *    stat reads "citizens who registered during this period" rather
 *    than "total citizens". TODO(migration): add a
 *    `RegistrationEvent` table (or a `registeredAt` column on
 *    `User`) if a true cumulative citizen count is needed.
 *
 * 3. The adoption funnel's "Visit" stage — there is NO page-view /
 *    analytics-event table. The funnel's first stage is therefore
 *    reported as the number of DISTINCT ticket reporters in range
 *    ("people who reached the report flow"). The page labels this
 *    stage explicitly so the admin is not misled. TODO(migration):
 *    add an `AnalyticsEvent` table to back a real visit count.
 *
 * 4. "Provided feedback" — `Ticket.feedback` EXISTS (a free-text
 *    slot on the ticket row, written by the citizen after a
 *    resolution). The fifth funnel stage counts the tickets in range
 *    whose `feedback` is non-empty. Tickets that reached a terminal
 *    status but carry no feedback text are NOT counted.
 *
 * 5. "Crew response time" — median time from "assigned" to "started
 *    work". The `Ticket` model has `assignedCrewId` and a
 *    `TicketTrailEntry` trail; the "routed"/"assigned" moment is
 *    the trail entry whose `toStatus` is `routed`, and the "started
 *    work" moment is the entry whose `toStatus` is `in_progress`.
 *    The median is over the tickets that have BOTH entries.
 *
 * 6. "Citizen retention" (% of citizens who submitted a 2nd report
 *    within 30 days) — computed from the ticket rows: group by
 *    `reporterId`, and a citizen counts as retained when their
 *    second report was filed ≤ 30 days after their first.
 *
 * 7. "Staff activity" (% of dispatchers / crews who logged in this
 *    week) — `Session.lastSeenAt` EXISTS (verified in the schema).
 *    A staff member counts as active when they have a session whose
 *    `lastSeenAt` falls inside the last 7 days.
 *
 * 8. "Compare with Dhaka" — the overlay compares the current city's
 *    metrics with the Dhaka city (`slug === 'dhaka-north'`). The
 *    comparison is computed over the SAME date range so the two are
 *    like-for-like.
 */

import type { TicketStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/** A ticket row, trimmed to what the derivation needs. */
export interface AdoptionTicketRow {
  id: string;
  cityId: string;
  wardId: string;
  reporterId: string;
  status: TicketStatus | string;
  assignedCrewId: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date | null;
  resolvedAt?: string | Date | null;
  /** The citizen's post-resolution feedback. Non-empty ⇒ feedback given. */
  feedback?: string | null;
}

/** A trail entry row, trimmed to what the derivation needs. */
export interface AdoptionTrailRow {
  ticketId: string;
  toStatus: TicketStatus | string;
  timestamp: string | Date;
}

/** A session row, trimmed to what the derivation needs. */
export interface AdoptionSessionRow {
  userId: string;
  lastSeenAt: string | Date;
  expiresAt?: string | Date | null;
}

/** A staff (dispatcher / crew / supervisor) row. */
export interface AdoptionStaffRow {
  id: string;
  role: string;
}

/** A ward row, trimmed to what the derivation needs. */
export interface AdoptionWardRow {
  id: string;
  number: number;
  name: string;
  nameBn: string | null;
}

/** A city row, trimmed to what the derivation needs. */
export interface AdoptionCityRow {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface AdoptionHeroStat {
  key: 'registeredCitizens' | 'reportsReceived' | 'resolutionRate' | 'avgTimeToResolve';
  value: number;
  /** The unit for the value: 'count' | 'percent' | 'duration'. */
  unit: 'count' | 'percent' | 'duration';
  /** Percentage change vs the immediately-preceding window of the same length. */
  deltaPercent: number | null;
  /** The raw duration in milliseconds (only for the duration stat). */
  durationMs: number | null;
}

export interface AdoptionFunnelStage {
  key: 'visit' | 'registered' | 'submitted' | 'secondReport' | 'feedback';
  count: number;
  /** Conversion rate from the previous stage, 0..1. Null for the first stage. */
  conversion: number | null;
}

export interface AdoptionDailyPoint {
  date: string; // YYYY-MM-DD
  submitted: number;
  resolved: number;
  registered: number;
}

export interface AdoptionWardActivity {
  wardId: string;
  wardNumber: number;
  wardName: string;
  wardNameBn: string | null;
  reports: number;
  resolved: number;
  /** 0..1 — the intensity used by the heatmap's colour ramp. */
  intensity: number;
}

export interface AdoptionEngagementSignal {
  key: 'staffActivity' | 'citizenRetention' | 'crewResponseTime';
  /** 0..100 for the two percentage signals; milliseconds for the third. */
  value: number;
  unit: 'percent' | 'duration';
  /** The denominator detail rendered under the signal. */
  detail: {
    active: number;
    total: number;
  };
}

export interface AdoptionHealthFlag {
  key: string;
  /** 'staff' | 'backlog' | 'coverage' — decides the pill colour. */
  kind: 'staff' | 'backlog' | 'coverage';
  /** Interpolation vars for the `admin.adoption.health.*` copy. */
  vars: Record<string, string | number>;
  /** Where the flag links to. */
  href: string;
}

export interface AdoptionComparison {
  cityId: string;
  cityName: string;
  reportsReceived: number;
  resolutionRate: number;
  registeredCitizens: number;
  daily: AdoptionDailyPoint[];
}

export interface AdoptionDashboardResult {
  cityId: string;
  from: string;
  to: string;
  hero: AdoptionHeroStat[];
  funnel: AdoptionFunnelStage[];
  daily: AdoptionDailyPoint[];
  wards: AdoptionWardActivity[];
  engagement: AdoptionEngagementSignal[];
  healthFlags: AdoptionHealthFlag[];
  /** The Dhaka overlay, when the comparison toggle is on. */
  comparison: AdoptionComparison | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/** `YYYY-MM-DD` for a timestamp, in UTC. */
export function toDateKey(value: string | Date): string {
  const iso = toIso(value);
  if (iso === null) return '1970-01-01';
  return iso.slice(0, 10);
}

/** Inclusive ISO range check. */
export function inRange(
  value: string | Date | null | undefined,
  fromIso: string,
  toIso_: string,
): boolean {
  const iso = toIso(value);
  if (iso === null) return false;
  return iso >= fromIso && iso <= toIso_;
}

/** The ISO timestamp `days` before `to`. */
export function shiftDays(to: string, days: number): string {
  return new Date(Date.parse(to) - days * 86_400_000).toISOString();
}

/**
 * Every date key between `from` and `to` inclusive, so the daily
 * chart has a stable x-axis even on days with no activity.
 */
export function dateRangeKeys(fromIso: string, toIso_: string): string[] {
  const start = Date.parse(fromIso);
  const end = Date.parse(toIso_);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const keys: string[] = [];
  // Cap the series at 180 days so a "since launch" range on an old
  // city cannot produce an unbounded array.
  const maxDays = 180;
  let cursor = start;
  let i = 0;
  while (cursor <= end && i < maxDays) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
    i += 1;
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Hero stats
// ---------------------------------------------------------------------------

const TERMINAL_RESOLVED: readonly string[] = ['resolved'];

/**
 * The four 4.7 hero cards, each with a delta against the preceding
 * window of the same length.
 */
export function buildHeroStats(
  current: {
    registeredCitizens: number;
    reportsReceived: number;
    resolved: number;
    resolutionRate: number;
    avgResolveMs: number | null;
  },
  previous: {
    registeredCitizens: number;
    reportsReceived: number;
    resolved: number;
    resolutionRate: number;
    avgResolveMs: number | null;
  },
): AdoptionHeroStat[] {
  return [
    {
      key: 'registeredCitizens',
      value: current.registeredCitizens,
      unit: 'count',
      deltaPercent: percentDelta(current.registeredCitizens, previous.registeredCitizens),
      durationMs: null,
    },
    {
      key: 'reportsReceived',
      value: current.reportsReceived,
      unit: 'count',
      deltaPercent: percentDelta(current.reportsReceived, previous.reportsReceived),
      durationMs: null,
    },
    {
      key: 'resolutionRate',
      value: current.resolutionRate,
      unit: 'percent',
      deltaPercent: percentDelta(current.resolutionRate, previous.resolutionRate),
      durationMs: null,
    },
    {
      key: 'avgTimeToResolve',
      value: current.avgResolveMs === null ? 0 : Math.round(current.avgResolveMs),
      unit: 'duration',
      // A shorter average resolve time is an IMPROVEMENT, so the
      // delta is inverted: -20% duration reads as +20% better.
      deltaPercent:
        current.avgResolveMs === null || previous.avgResolveMs === null
          ? null
          : negate(percentDelta(current.avgResolveMs, previous.avgResolveMs)),
      durationMs: current.avgResolveMs,
    },
  ];
}

/**
 * Percentage change from `previous` to `current`.
 * Returns null when there is no meaningful baseline (both zero).
 */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Flip the sign of a delta (null-safe). */
function negate(value: number | null): number | null {
  return value === null ? null : -value;
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export interface FunnelInputs {
  /** Distinct ticket reporters in range. See SCHEMA MAPPING §3. */
  visitors: number;
  /** Citizen-role users created in range. */
  registered: number;
  /** Tickets submitted in range. */
  submitted: number;
  /** Citizens who filed a 2nd report within 30 days of their first. */
  secondReport: number;
  /** Tickets whose `feedback` slot is non-empty. */
  feedback: number;
}

/**
 * Build the 5-stage adoption funnel with the conversion rate from
 * the previous stage.
 */
export function buildFunnel(inputs: FunnelInputs): AdoptionFunnelStage[] {
  const raw: { key: AdoptionFunnelStage['key']; count: number }[] = [
    { key: 'visit', count: inputs.visitors },
    { key: 'registered', count: inputs.registered },
    { key: 'submitted', count: inputs.submitted },
    { key: 'secondReport', count: inputs.secondReport },
    { key: 'feedback', count: inputs.feedback },
  ];
  return raw.map((stage, i) => ({
    key: stage.key,
    count: stage.count,
    conversion:
      i === 0
        ? null
        : raw[i - 1].count === 0
          ? null
          : Math.round((stage.count / raw[i - 1].count) * 1000) / 1000,
  }));
}

// ---------------------------------------------------------------------------
// Daily activity
// ---------------------------------------------------------------------------

/**
 * The three-line daily activity chart:
 * reports submitted, reports resolved, citizens registered.
 */
export function buildDailySeries(
  tickets: AdoptionTicketRow[],
  citizens: { createdAt: string | Date }[],
  fromIso: string,
  toIso_: string,
): AdoptionDailyPoint[] {
  const keys = dateRangeKeys(fromIso, toIso_);
  const byDate = new Map<string, AdoptionDailyPoint>(
    keys.map((k) => [k, { date: k, submitted: 0, resolved: 0, registered: 0 }]),
  );
  const touch = (dateKey: string): AdoptionDailyPoint | undefined =>
    byDate.get(dateKey);

  for (const t of tickets) {
    const created = toIso(t.createdAt);
    if (created && inRange(created, fromIso, toIso_)) {
      const p = touch(toDateKey(created));
      if (p) p.submitted += 1;
    }
    const resolved = toIso(t.resolvedAt);
    if (resolved && inRange(resolved, fromIso, toIso_)) {
      const p = touch(toDateKey(resolved));
      if (p) p.resolved += 1;
    }
  }
  for (const c of citizens) {
    const created = toIso(c.createdAt);
    if (created && inRange(created, fromIso, toIso_)) {
      const p = touch(toDateKey(created));
      if (p) p.registered += 1;
    }
  }
  return keys.map((k) => byDate.get(k)!);
}

// ---------------------------------------------------------------------------
// Ward heatmap
// ---------------------------------------------------------------------------

/**
 * Per-ward report density with a 0..1 intensity for the colour ramp.
 */
export function buildWardActivity(
  tickets: AdoptionTicketRow[],
  wards: AdoptionWardRow[],
): AdoptionWardActivity[] {
  const counts = new Map<string, { reports: number; resolved: number }>();
  for (const t of tickets) {
    const entry = counts.get(t.wardId) ?? { reports: 0, resolved: 0 };
    entry.reports += 1;
    if (TERMINAL_RESOLVED.includes(t.status)) entry.resolved += 1;
    counts.set(t.wardId, entry);
  }
  const max = Math.max(
    1,
    ...wards.map((w) => (counts.get(w.id)?.reports ?? 0)),
  );
  return wards
    .map((w) => {
      const entry = counts.get(w.id) ?? { reports: 0, resolved: 0 };
      return {
        wardId: w.id,
        wardNumber: w.number,
        wardName: w.name,
        wardNameBn: w.nameBn,
        reports: entry.reports,
        resolved: entry.resolved,
        intensity: Math.round((entry.reports / max) * 1000) / 1000,
      };
    })
    .sort((a, b) => a.wardNumber - b.wardNumber);
}

// ---------------------------------------------------------------------------
// Engagement signals
// ---------------------------------------------------------------------------

/** Median of a numeric list. Returns null for an empty list. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The three 4.7 engagement signals.
 *
 * - Staff activity: % of staff who have a session `lastSeenAt` in
 *   the last 7 days.
 * - Citizen retention: % of citizens who filed a 2nd report within
 *   30 days of their first.
 * - Crew response time: median ms from "assigned" (trail `routed`)
 *   to "started work" (trail `in_progress`).
 */
export function buildEngagementSignals(input: {
  staff: AdoptionStaffRow[];
  sessions: AdoptionSessionRow[];
  tickets: AdoptionTicketRow[];
  trail: AdoptionTrailRow[];
}): AdoptionEngagementSignal[] {
  // --- Staff activity -------------------------------------------------
  const staffIds = new Set(input.staff.map((s) => s.id));
  const activeSince = shiftDays(new Date().toISOString(), 7);
  const activeStaff = new Set<string>();
  for (const s of input.sessions) {
    if (!staffIds.has(s.userId)) continue;
    const seen = toIso(s.lastSeenAt);
    if (seen && seen >= activeSince) activeStaff.add(s.userId);
  }

  // --- Citizen retention ----------------------------------------------
  const firstReportByCitizen = new Map<string, number>();
  const secondReportByCitizen = new Map<string, number>();
  for (const t of input.tickets) {
    const created = toIso(t.createdAt);
    if (!created) continue;
    const ms = Date.parse(created);
    const first = firstReportByCitizen.get(t.reporterId);
    if (first === undefined) {
      firstReportByCitizen.set(t.reporterId, ms);
    } else if (!secondReportByCitizen.has(t.reporterId)) {
      secondReportByCitizen.set(t.reporterId, ms);
    }
  }
  let retained = 0;
  for (const [citizenId, secondMs] of secondReportByCitizen) {
    const firstMs = firstReportByCitizen.get(citizenId);
    if (firstMs === undefined) continue;
    if (secondMs - firstMs <= 30 * 86_400_000) retained += 1;
  }
  const citizensTotal = firstReportByCitizen.size;

  // --- Crew response time ---------------------------------------------
  const routedAt = new Map<string, number>();
  const startedAt = new Map<string, number>();
  for (const e of input.trail) {
    const ts = toIso(e.timestamp);
    if (!ts) continue;
    const ms = Date.parse(ts);
    if (e.toStatus === 'routed' && !routedAt.has(e.ticketId)) {
      routedAt.set(e.ticketId, ms);
    }
    if (e.toStatus === 'in_progress' && !startedAt.has(e.ticketId)) {
      startedAt.set(e.ticketId, ms);
    }
  }
  const responseDurations: number[] = [];
  for (const [ticketId, startedMs] of startedAt) {
    const routedMs = routedAt.get(ticketId);
    if (routedMs === undefined) continue;
    if (startedMs >= routedMs) responseDurations.push(startedMs - routedMs);
  }
  const medianResponse = median(responseDurations);

  return [
    {
      key: 'staffActivity',
      value:
        input.staff.length === 0
          ? 0
          : Math.round((activeStaff.size / input.staff.length) * 100),
      unit: 'percent',
      detail: { active: activeStaff.size, total: input.staff.length },
    },
    {
      key: 'citizenRetention',
      value:
        citizensTotal === 0
          ? 0
          : Math.round((retained / citizensTotal) * 100),
      unit: 'percent',
      detail: { active: retained, total: citizensTotal },
    },
    {
      key: 'crewResponseTime',
      value: medianResponse === null ? 0 : Math.round(medianResponse),
      unit: 'duration',
      detail: {
        active: responseDurations.length,
        total: input.tickets.length,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Health flags
// ---------------------------------------------------------------------------

export interface HealthFlagInputs {
  /** Staff rows with their most-recent session timestamp (null = never). */
  staffLastSeen: { id: string; role: string; lastSeenAt: string | null }[];
  /** Tickets still unassigned, with the age in days. */
  unassignedOlderThan: number;
  unassignedCount: number;
  /** Wards with no reports in the last N days. */
  silentWards: { wardNumber: number; days: number }[];
  cityId: string;
}

/**
 * Detect the 4.7 health flags:
 *   - dispatchers who haven't logged in for 7+ days
 *   - tickets unassigned for 7+ days
 *   - wards with no reports in 14+ days
 */
export function buildHealthFlags(input: HealthFlagInputs): AdoptionHealthFlag[] {
  const flags: AdoptionHealthFlag[] = [];

  // 1. Staff who haven't been seen for 7 days.
  const staleThreshold = shiftDays(new Date().toISOString(), 7);
  const staleDispatchers = input.staffLastSeen.filter(
    (s) =>
      s.role === 'dispatcher' &&
      (s.lastSeenAt === null || s.lastSeenAt < staleThreshold),
  );
  if (staleDispatchers.length > 0) {
    flags.push({
      key: 'stale_dispatchers',
      kind: 'staff',
      vars: { count: staleDispatchers.length },
      href: `/admin/cities/${input.cityId}/users`,
    });
  }

  // 2. Unassigned backlog.
  if (input.unassignedOlderThan > 0) {
    flags.push({
      key: 'unassigned_backlog',
      kind: 'backlog',
      vars: {
        count: input.unassignedCount,
        days: input.unassignedOlderThan,
      },
      href: `/admin/tickets?status=submitted`,
    });
  }

  // 3. Silent wards.
  for (const ward of input.silentWards) {
    flags.push({
      key: `silent_ward_${ward.wardNumber}`,
      kind: 'coverage',
      vars: { ward: ward.wardNumber, days: ward.days },
      href: `/admin/tickets?wardId=${input.cityId}`,
    });
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Full dashboard
// ---------------------------------------------------------------------------

export interface AdoptionDashboardInput {
  cityId: string;
  citySlug: string;
  fromIso: string;
  toIso_: string;
  tickets: AdoptionTicketRow[];
  citizens: { id: string; createdAt: string | Date }[];
  staff: AdoptionStaffRow[];
  sessions: AdoptionSessionRow[];
  trail: AdoptionTrailRow[];
  wards: AdoptionWardRow[];
  /** The Dhaka city row, when the comparison overlay is requested. */
  comparisonCity: AdoptionCityRow | null;
  comparisonTickets: AdoptionTicketRow[];
  comparisonCitizens: { id: string; createdAt: string | Date }[];
}

/**
 * Assemble the whole 4.7 dashboard payload.
 */
export function buildAdoptionDashboard(
  input: AdoptionDashboardInput,
): AdoptionDashboardResult {
  const { fromIso, toIso_ } = input;

  // --- Current window --------------------------------------------------
  const currentTickets = input.tickets.filter((t) =>
    inRange(t.createdAt, fromIso, toIso_),
  );
  const currentCitizens = input.citizens.filter((c) =>
    inRange(c.createdAt, fromIso, toIso_),
  );
  const resolvedCurrent = currentTickets.filter((t) => {
    const resolved = toIso(t.resolvedAt);
    return resolved !== null && inRange(resolved, fromIso, toIso_);
  });
  const resolutionRate =
    currentTickets.length === 0
      ? 0
      : Math.round((resolvedCurrent.length / currentTickets.length) * 100);
  const avgResolveMs = averageResolveDuration(resolvedCurrent);

  // --- Previous window (same length, immediately before) ---------------
  const windowMs = Math.max(0, Date.parse(toIso_) - Date.parse(fromIso));
  const prevTo = new Date(Date.parse(fromIso)).toISOString();
  const prevFrom = new Date(Date.parse(fromIso) - windowMs).toISOString();
  const prevTickets = input.tickets.filter((t) =>
    inRange(t.createdAt, prevFrom, prevTo),
  );
  const prevCitizens = input.citizens.filter((c) =>
    inRange(c.createdAt, prevFrom, prevTo),
  );
  const prevResolved = prevTickets.filter((t) => {
    const resolved = toIso(t.resolvedAt);
    return resolved !== null && inRange(resolved, prevFrom, prevTo);
  });
  const prevResolutionRate =
    prevTickets.length === 0
      ? 0
      : Math.round((prevResolved.length / prevTickets.length) * 100);

  const hero = buildHeroStats(
    {
      registeredCitizens: currentCitizens.length,
      reportsReceived: currentTickets.length,
      resolved: resolvedCurrent.length,
      resolutionRate,
      avgResolveMs,
    },
    {
      registeredCitizens: prevCitizens.length,
      reportsReceived: prevTickets.length,
      resolved: prevResolved.length,
      resolutionRate: prevResolutionRate,
      avgResolveMs: averageResolveDuration(prevResolved),
    },
  );

  // --- Funnel ----------------------------------------------------------
  const distinctReporters = new Set(currentTickets.map((t) => t.reporterId));
  const secondReporters = new Set<string>();
  {
    const first = new Map<string, number>();
    for (const t of currentTickets) {
      const ms = Date.parse(toIso(t.createdAt) ?? '');
      if (Number.isNaN(ms)) continue;
      const prev = first.get(t.reporterId);
      if (prev === undefined) first.set(t.reporterId, ms);
      else secondReporters.add(t.reporterId);
    }
  }
  const funnel = buildFunnel({
    visitors: distinctReporters.size,
    registered: currentCitizens.length,
    submitted: currentTickets.length,
    secondReport: secondReporters.size,
    feedback: currentTickets.filter((t) => (t.feedback ?? '').trim() !== '').length,
  });

  // --- Daily + wards ---------------------------------------------------
  const daily = buildDailySeries(
    input.tickets,
    input.citizens,
    fromIso,
    toIso_,
  );
  const wards = buildWardActivity(currentTickets, input.wards);

  // --- Engagement ------------------------------------------------------
  const engagement = buildEngagementSignals({
    staff: input.staff,
    sessions: input.sessions,
    tickets: input.tickets,
    trail: input.trail,
  });

  // --- Health flags ----------------------------------------------------
  const healthFlags = buildHealthFlags(
    buildHealthFlagInput(input, currentTickets, resolvedCurrent),
  );

  // --- Comparison ------------------------------------------------------
  let comparison: AdoptionComparison | null = null;
  if (input.comparisonCity) {
    const cmpTickets = input.comparisonTickets.filter((t) =>
      inRange(t.createdAt, fromIso, toIso_),
    );
    const cmpResolved = cmpTickets.filter((t) => {
      const resolved = toIso(t.resolvedAt);
      return resolved !== null && inRange(resolved, fromIso, toIso_);
    });
    comparison = {
      cityId: input.comparisonCity.id,
      cityName: input.comparisonCity.name,
      reportsReceived: cmpTickets.length,
      resolutionRate:
        cmpTickets.length === 0
          ? 0
          : Math.round((cmpResolved.length / cmpTickets.length) * 100),
      registeredCitizens: input.comparisonCitizens.filter((c) =>
        inRange(c.createdAt, fromIso, toIso_),
      ).length,
      daily: buildDailySeries(
        input.comparisonTickets,
        input.comparisonCitizens,
        fromIso,
        toIso_,
      ),
    };
  }

  return {
    cityId: input.cityId,
    from: fromIso,
    to: toIso_,
    hero,
    funnel,
    daily,
    wards,
    engagement,
    healthFlags,
    comparison,
  };
}

/**
 * The average `resolvedAt - createdAt` over the given tickets, in
 * milliseconds. Null when none of them are resolved.
 */
export function averageResolveDuration(
  tickets: AdoptionTicketRow[],
): number | null {
  let total = 0;
  let n = 0;
  for (const t of tickets) {
    const created = toIso(t.createdAt);
    const resolved = toIso(t.resolvedAt);
    if (!created || !resolved) continue;
    const ms = Date.parse(resolved) - Date.parse(created);
    if (!Number.isFinite(ms) || ms < 0) continue;
    total += ms;
    n += 1;
  }
  if (n === 0) return null;
  return Math.round(total / n);
}

function buildHealthFlagInput(
  input: AdoptionDashboardInput,
  currentTickets: AdoptionTicketRow[],
  currentResolved: AdoptionTicketRow[],
): HealthFlagInputs {
  // Staff last-seen: MAX(Session.lastSeenAt) per staff member.
  const lastSeenByStaff = new Map<string, string>();
  for (const s of input.sessions) {
    const seen = toIso(s.lastSeenAt);
    if (!seen) continue;
    const prev = lastSeenByStaff.get(s.userId);
    if (prev === undefined || seen > prev) lastSeenByStaff.set(s.userId, seen);
  }
  const staffLastSeen = input.staff.map((s) => ({
    id: s.id,
    role: s.role,
    lastSeenAt: lastSeenByStaff.get(s.id) ?? null,
  }));

  // Unassigned backlog: tickets still unassigned, oldest first.
  const now = Date.now();
  const unassigned = currentTickets.filter(
    (t) => t.assignedCrewId === null && t.status === 'submitted',
  );
  let oldestUnassignedDays = 0;
  for (const t of unassigned) {
    const created = toIso(t.createdAt);
    if (!created) continue;
    const days = Math.floor((now - Date.parse(created)) / 86_400_000);
    if (days > oldestUnassignedDays) oldestUnassignedDays = days;
  }

  // Silent wards: no reports in the last 14 days.
  const silentDays = 14;
  const cutoff = shiftDays(new Date().toISOString(), silentDays);
  const wardsWithRecentReports = new Set(
    currentTickets
      .filter((t) => {
        const created = toIso(t.createdAt);
        return created !== null && created >= cutoff;
      })
      .map((t) => t.wardId),
  );
  const silentWards = input.wards
    .filter((w) => !wardsWithRecentReports.has(w.id))
    .map((w) => ({ wardNumber: w.number, days: silentDays }));

  return {
    staffLastSeen,
    unassignedOlderThan: oldestUnassignedDays,
    unassignedCount: unassigned.length,
    silentWards,
    cityId: input.cityId,
  };
}

// ---------------------------------------------------------------------------
// CSV export rows
// ---------------------------------------------------------------------------

/**
 * The CSV export shape: one row per day of the daily series plus a
 * totals column set. Kept next to the dashboard so the export and
 * the chart can never drift.
 */
export function buildAdoptionCsvRows(
  dashboard: AdoptionDashboardResult,
): { header: readonly string[]; rows: (readonly unknown[])[] } {
  const header = [
    'date',
    'reports_submitted',
    'reports_resolved',
    'citizens_registered',
  ];
  const rows = dashboard.daily.map((d) => [
    d.date,
    d.submitted,
    d.resolved,
    d.registered,
  ]);
  return { header, rows };
}
