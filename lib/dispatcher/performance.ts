/**
 * Dispatcher performance snapshot service
 * (lib/dispatcher/performance.ts).
 *
 * Backs the "Ward Performance Snapshot" surface at
 * `/dispatcher/performance` (UX spec 2.7 — Habib the Handler,
 * screen 7 of 7).
 *
 * The page is a **snapshot**: it does NOT poll. It refreshes when
 * the date range changes or when the dispatcher reloads.
 *
 * The response shape (per the API contract):
 *
 *   {
 *     hero: {
 *       totalReports:   { value, delta },
 *       resolutionRate: { value, delta },
 *       avgTimeToResolve: { valueMs, deltaMs }
 *     },
 *     submittedVsResolved: [{ date, submitted, resolved }],
 *     categoryBreakdown:   [{ categoryId, count }],
 *     statusBreakdown:     [{ status, count }],
 *     crewTable:           [{ crewId, crewName, specialty,
 *                            jobsCompleted, avgTimeToResolveMs,
 *                            positiveFeedback, negativeFeedback,
 *                            feedbackRatio | null }],
 *     longTail:            [{ id, categoryId, createdAt, ageMs,
 *                            assignedCrewId, assignedCrewName }]
 *   }
 *
 * Pure builders (`buildPerformanceSnapshot`, `buildHeroStats`,
 * `buildSubmittedVsResolved`, `buildCategoryBreakdown`,
 * `buildStatusBreakdown`, `buildCrewTable`, `buildLongTail`) are
 * exported so the Vitest suite can pin the arithmetic without a
 * database. The DB-facing wrapper (`getPerformanceSnapshot`)
 * goes through the `db` facade so it works on Prisma or the
 * in-memory dev store.
 *
 * Date-range handling follows the pattern in
 * `lib/admin/tickets-query.ts`: the range is applied in JS
 * (the dev store's `findMany` does string-equality on every
 * `where` key, so a `{gte, lte}` clause never matches there).
 */

import { db } from '@/lib/db-switch';
import { aggregateCrewFeedback } from '@/lib/citizen/feedback';
import type { SessionContext } from '@/lib/auth/session';

/** The number of days in the default range (last 7 days). */
export const PERFORMANCE_DEFAULT_DAYS = 7;

/** The number of days in the widest supported range. */
export const PERFORMANCE_MAX_DAYS = 90;

/** The long-tail list shows at most this many open tickets. */
export const PERFORMANCE_LONG_TAIL_LIMIT = 10;

/** The statuses that count as "open" for the long-tail list. */
export const PERFORMANCE_OPEN_STATUSES = [
  'submitted',
  'routed',
  'in_progress',
] as const;

/** A ticket as the performance service sees it. */
export interface PerfTicket {
  id: string;
  cityId: string;
  wardId: string;
  categoryId: string;
  status: string;
  assignedCrewId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /**
   * WO-002 — the citizen's post-resolution feedback document
   * (see `lib/citizen/feedback.ts`). `null` when the citizen has
   * not rated the resolution. The crew table's positive /
   * negative tally is derived from it by
   * `aggregateCrewFeedback`.
   */
  feedback?: string | null;
}

/** A crew member as the performance service sees them. */
export interface PerfCrew {
  id: string;
  name: string;
  specialty: string | null;
}

/** The date range the snapshot covers. */
export interface PerfRange {
  fromIso: string;
  toIso: string;
}

/** One hero stat card. */
export interface PerfHeroStat {
  value: number;
  delta: number;
}

export interface PerfHero {
  totalReports: PerfHeroStat;
  resolutionRate: PerfHeroStat;
  avgTimeToResolve: { valueMs: number; deltaMs: number };
}

/** One point on the submitted-vs-resolved line chart. */
export interface PerfSubmittedVsResolvedPoint {
  date: string;
  submitted: number;
  resolved: number;
}

/** One row of the category breakdown bar chart. */
export interface PerfCategoryRow {
  categoryId: string;
  count: number;
}

/** One segment of the status donut. */
export interface PerfStatusRow {
  status: string;
  count: number;
}

/** One row of the sortable crew performance table. */
export interface PerfCrewRow {
  crewId: string;
  crewName: string;
  specialty: string | null;
  jobsCompleted: number;
  avgTimeToResolveMs: number | null;
  positiveFeedback: number;
  negativeFeedback: number;
  /**
   * positive / (positive + negative), or null when there are fewer
   * than 5 feedback samples (the spec's "not enough data" rule).
   */
  feedbackRatio: number | null;
}

/** One row of the long-tail unresolved list. */
export interface PerfLongTailRow {
  id: string;
  categoryId: string;
  createdAt: string;
  ageMs: number;
  assignedCrewId: string | null;
  assignedCrewName: string | null;
}

/** The full snapshot payload. */
export interface PerfSnapshot {
  hero: PerfHero;
  submittedVsResolved: PerfSubmittedVsResolvedPoint[];
  categoryBreakdown: PerfCategoryRow[];
  statusBreakdown: PerfStatusRow[];
  crewTable: PerfCrewRow[];
  longTail: PerfLongTailRow[];
  /** The range the snapshot covers (echoed back for the header). */
  range: PerfRange;
  /**
   * The ward the snapshot covers. `wardId` is the raw id;
   * `wardLabel` / `wardLabelBn` are the bare ward numbers
   * ("14" / "১৪") — the page header's "Ward {ward}" template
   * supplies the surrounding word.
   */
  ward: {
    wardId: string | null;
    wardLabel: string | null;
    wardLabelBn: string | null;
  };
}

/** The feedback sample count below which the ratio is suppressed. */
export const FEEDBACK_MIN_SAMPLES = 5;

/**
 * Convert ASCII digits to Bangla digits (০১২৩৪৫৬৭৮৯).
 *
 * The Bangla header reads "ওয়ার্ড ১৪", so the ward number needs
 * Bangla numerals when the locale is Bangla.
 */
export function toBanglaDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}

/**
 * Resolve a `from` / `to` pair into an ISO range.
 *
 * When `from` is missing the range is the last `days` days ending
 * at `to` (or now). When `to` is missing the range ends now.
 */
export function resolvePerfRange(options?: {
  from?: string;
  to?: string;
  days?: number;
  now?: Date;
}): PerfRange {
  const now = options?.now ?? new Date();
  const toIso = options?.to ?? now.toISOString();
  const days = Math.max(1, Math.min(PERFORMANCE_MAX_DAYS, options?.days ?? PERFORMANCE_DEFAULT_DAYS));
  const fromIso = options?.from
    ? options.from
    : new Date(Date.parse(toIso) - days * 86_400_000).toISOString();
  return { fromIso, toIso };
}

/** ISO day key (YYYY-MM-DD) for a timestamp. */
export function perfDayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** True when `iso` falls inside the range (inclusive on both ends). */
export function inPerfRange(iso: string, range: PerfRange): boolean {
  return iso >= range.fromIso && iso <= range.toIso;
}

/**
 * Build the hero stat cards for a range + its "previous period"
 * (the equally-long window immediately before it).
 */
export function buildHeroStats(
  current: PerfTicket[],
  previous: PerfTicket[],
): PerfHero {
  const totalReports = current.length;
  const prevTotal = previous.length;

  const rate = (rows: PerfTicket[]): number => {
    if (rows.length === 0) return 0;
    const resolved = rows.filter(
      (t) => t.status === 'resolved' || t.status === 'closed',
    ).length;
    return Math.round((resolved / rows.length) * 100);
  };

  const avgResolve = (rows: PerfTicket[]): number | null => {
    const durations = rows
      .filter((t) => t.resolvedAt)
      .map((t) => Date.parse(t.resolvedAt as string) - Date.parse(t.createdAt))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (durations.length === 0) return null;
    return Math.round(
      durations.reduce((sum, n) => sum + n, 0) / durations.length,
    );
  };

  const resolutionRate = rate(current);
  const prevResolutionRate = rate(previous);
  const avgTimeToResolve = avgResolve(current);
  const prevAvgTimeToResolve = avgResolve(previous);

  return {
    totalReports: {
      value: totalReports,
      delta: totalReports - prevTotal,
    },
    resolutionRate: {
      value: resolutionRate,
      delta: resolutionRate - prevResolutionRate,
    },
    avgTimeToResolve: {
      valueMs: avgTimeToResolve ?? 0,
      // A negative delta means "faster this period" — we report
      // the raw difference so the page can invert the sign when
      // it renders the arrow.
      deltaMs:
        avgTimeToResolve !== null && prevAvgTimeToResolve !== null
          ? avgTimeToResolve - prevAvgTimeToResolve
          : 0,
    },
  };
}

/**
 * Build the submitted-vs-resolved line chart: one point per day
 * in the range, oldest first. Days with no activity are emitted
 * with zero counts so the x-axis is continuous.
 */
export function buildSubmittedVsResolved(
  tickets: PerfTicket[],
  range: PerfRange,
): PerfSubmittedVsResolvedPoint[] {
  const days: string[] = [];
  const start = Date.parse(range.fromIso);
  const end = Date.parse(range.toIso);
  // Cap the number of buckets so a wide custom range cannot blow
  // up the DOM (a 90-day range → 91 points, which is fine).
  const step = 86_400_000;
  const total = Math.floor((end - start) / step);
  for (let i = 0; i <= total && i <= PERFORMANCE_MAX_DAYS + 1; i += 1) {
    days.push(perfDayKey(new Date(start + i * step).toISOString()));
  }
  const byDate = new Map<string, { submitted: number; resolved: number }>();
  for (const d of days) byDate.set(d, { submitted: 0, resolved: 0 });
  for (const t of tickets) {
    const createdKey = perfDayKey(t.createdAt);
    const createdBucket = byDate.get(createdKey);
    if (createdBucket) createdBucket.submitted += 1;
    if (t.resolvedAt) {
      const resolvedKey = perfDayKey(t.resolvedAt);
      const resolvedBucket = byDate.get(resolvedKey);
      if (resolvedBucket) resolvedBucket.resolved += 1;
    }
  }
  return days.map((date) => ({
    date,
    submitted: byDate.get(date)?.submitted ?? 0,
    resolved: byDate.get(date)?.resolved ?? 0,
  }));
}

/**
 * Build the category breakdown: one row per category, sorted by
 * count descending (ties broken by categoryId for stability).
 */
export function buildCategoryBreakdown(tickets: PerfTicket[]): PerfCategoryRow[] {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([categoryId, count]) => ({ categoryId, count }))
    .sort((a, b) =>
      a.count === b.count
        ? a.categoryId.localeCompare(b.categoryId)
        : b.count - a.count,
    );
}

/** The canonical status order for the donut chart. */
export const PERFORMANCE_STATUS_ORDER = [
  'submitted',
  'routed',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
] as const;

/**
 * Build the status breakdown (the current snapshot). Every status
 * in the canonical order is emitted, even when its count is zero,
 * so the donut legend is stable.
 */
export function buildStatusBreakdown(tickets: PerfTicket[]): PerfStatusRow[] {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  }
  return PERFORMANCE_STATUS_ORDER.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
}

/**
 * Build the crew performance table.
 *
 * "Jobs completed" counts the tickets in the range that were
 * resolved (or closed) and assigned to the crew.
 * "Avg time to resolve" is the mean creation → resolution time
 * over those jobs; null when the crew has no timed job.
 * "Citizen feedback" is the positive / negative ratio, suppressed
 * (null) when fewer than `FEEDBACK_MIN_SAMPLES` tickets carry
 * feedback — the spec's "not enough data" rule.
 */
export function buildCrewTable(
  tickets: PerfTicket[],
  crew: PerfCrew[],
  feedback?: { crewId: string; positive: number; negative: number }[],
): PerfCrewRow[] {
  const feedbackByCrew = new Map<string, { positive: number; negative: number }>();
  for (const f of feedback ?? []) {
    feedbackByCrew.set(f.crewId, { positive: f.positive, negative: f.negative });
  }

  return crew.map((c) => {
    const mine = tickets.filter((t) => t.assignedCrewId === c.id);
    const completed = mine.filter(
      (t) => t.status === 'resolved' || t.status === 'closed',
    );
    const durations = completed
      .filter((t) => t.resolvedAt)
      .map((t) => Date.parse(t.resolvedAt as string) - Date.parse(t.createdAt))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const fb = feedbackByCrew.get(c.id) ?? { positive: 0, negative: 0 };
    const fbTotal = fb.positive + fb.negative;
    return {
      crewId: c.id,
      crewName: c.name,
      specialty: c.specialty,
      jobsCompleted: completed.length,
      avgTimeToResolveMs:
        durations.length === 0
          ? null
          : Math.round(
              durations.reduce((sum, n) => sum + n, 0) / durations.length,
            ),
      positiveFeedback: fb.positive,
      negativeFeedback: fb.negative,
      feedbackRatio:
        fbTotal < FEEDBACK_MIN_SAMPLES
          ? null
          : Math.round((fb.positive / fbTotal) * 100),
    };
  });
}

/**
 * Build the long-tail list: the oldest still-open tickets in the
 * ward, oldest first, capped at `PERFORMANCE_LONG_TAIL_LIMIT`.
 */
export function buildLongTail(
  tickets: PerfTicket[],
  crewNames?: Record<string, string>,
  limit: number = PERFORMANCE_LONG_TAIL_LIMIT,
): PerfLongTailRow[] {
  const now = Date.now();
  return tickets
    .filter((t) => (PERFORMANCE_OPEN_STATUSES as readonly string[]).includes(t.status))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      categoryId: t.categoryId,
      createdAt: t.createdAt,
      ageMs: Math.max(0, now - Date.parse(t.createdAt)),
      assignedCrewId: t.assignedCrewId,
      assignedCrewName: t.assignedCrewId
        ? crewNames?.[t.assignedCrewId] ?? t.assignedCrewId
        : null,
    }));
}

/**
 * Assemble the whole snapshot from a ticket set + the crew roster.
 * Pure — the unit tests drive this directly.
 */
export function buildPerformanceSnapshot(options: {
  current: PerfTicket[];
  previous: PerfTicket[];
  range: PerfRange;
  crew: PerfCrew[];
  crewNames?: Record<string, string>;
  feedback?: { crewId: string; positive: number; negative: number }[];
  ward?: {
    wardId: string | null;
    wardLabel: string | null;
    wardLabelBn: string | null;
  };
  now?: Date;
}): PerfSnapshot {
  const now = options.now ?? new Date();
  return {
    hero: buildHeroStats(options.current, options.previous),
    submittedVsResolved: buildSubmittedVsResolved(options.current, options.range),
    categoryBreakdown: buildCategoryBreakdown(options.current),
    statusBreakdown: buildStatusBreakdown(options.current),
    crewTable: buildCrewTable(options.current, options.crew, options.feedback),
    longTail: buildLongTail(options.current, options.crewNames, PERFORMANCE_LONG_TAIL_LIMIT),
    range: options.range,
    ward: options.ward ?? {
      wardId: null,
      wardLabel: null,
      wardLabelBn: null,
    },
  };
}

/**
 * Load the ward's tickets + crew roster and build the snapshot.
 *
 * Ward scoping happens here (the dispatcher's session ward). The
 * route is the trust boundary (`requireRole` + `requireSameCity`).
 */
export async function getPerformanceSnapshot(
  session: SessionContext,
  options?: { from?: string; to?: string; days?: number; now?: Date },
): Promise<PerfSnapshot> {
  const now = options?.now ?? new Date();
  const range = resolvePerfRange({
    from: options?.from,
    to: options?.to,
    days: options?.days,
    now,
  });
  // The previous period is the equally-long window immediately
  // before the current one.
  const rangeMs = Date.parse(range.toIso) - Date.parse(range.fromIso);
  const previousRange: PerfRange = {
    fromIso: new Date(Date.parse(range.fromIso) - rangeMs).toISOString(),
    toIso: range.fromIso,
  };

  const all = await db.ticket.findMany({
    where: { cityId: session.cityId },
    orderBy: { createdAt: 'desc' },
  });

  const ward = all.filter(
    (t) => !session.wardId || t.wardId === session.wardId,
  );

  const toPerf = (t: (typeof ward)[number]): PerfTicket => ({
    id: t.id,
    cityId: t.cityId,
    wardId: t.wardId,
    categoryId: t.categoryId,
    status: t.status,
    assignedCrewId: t.assignedCrewId,
    createdAt:
      typeof t.createdAt === 'string'
        ? t.createdAt
        : (t.createdAt as Date).toISOString(),
    updatedAt:
      typeof t.updatedAt === 'string'
        ? t.updatedAt
        : (t.updatedAt as Date).toISOString(),
    resolvedAt: t.resolvedAt
      ? typeof t.resolvedAt === 'string'
        ? t.resolvedAt
        : (t.resolvedAt as Date).toISOString()
      : null,
    // WO-002 — carry the citizen's feedback document so the crew
    // table's positive / negative tally can be derived from it.
    // The dev store and Prisma both expose the column directly.
    feedback: (t as { feedback?: string | null }).feedback ?? null,
  });

  const perfTickets = ward.map(toPerf);
  const current = perfTickets.filter((t) =>
    inPerfRange(t.createdAt, range),
  );
  const previous = perfTickets.filter((t) =>
    inPerfRange(t.createdAt, previousRange),
  );

  // The crew roster: crew users in the dispatcher's ward.
  const crewRows = await db.user.findMany({
    where: {
      cityId: session.cityId,
      role: 'crew',
      ...(session.wardId ? { wardId: session.wardId } : {}),
    },
    orderBy: { name: 'asc' },
  });
  // The v1 schema has no specialty column; the crew's
  // `departmentId` is the closest available proxy. Resolve it to
  // the department's DISPLAY NAME — the raw `dept_streetlight` id
  // used to land in the "Specialty" column of the crew table.
  const departmentNames: Record<string, string> = {};
  const departmentIds = [
    ...new Set(
      crewRows
        .map((c) => c.departmentId)
        .filter((d): d is string => typeof d === 'string' && d.length > 0),
    ),
  ];
  for (const deptId of departmentIds) {
    const dept = await db.department.findUnique({ where: { id: deptId } });
    if (dept?.name) departmentNames[deptId] = dept.name;
  }
  const crew: PerfCrew[] = crewRows.map((c) => ({
    id: c.id,
    name: c.name,
    // The v1 schema has no specialty column; the crew's
    // `departmentId` is the closest available proxy.
    specialty: c.departmentId
      ? (departmentNames[c.departmentId] ?? c.departmentId)
      : null,
  }));
  const crewNames: Record<string, string> = {};
  for (const c of crew) crewNames[c.id] = c.name;

  // The ward label for the page header
  // ("Ward 14 · Performance snapshot"). The dispatcher's session
  // carries the ward id; the ward record carries the number.
  //
  // We deliberately carry the bare NUMBER, not the ward's full name
  // ("Ward 14 — Mirpur"): the header template already supplies the
  // "Ward {ward}" / "ওয়ার্ড {ward}" prefix, so a full name would
  // render as "Ward Ward 14 — Mirpur".
  let wardLabel: string | null = null;
  let wardLabelBn: string | null = null;
  if (session.wardId) {
    const wardRow = await db.ward.findUnique({ where: { id: session.wardId } });
    if (wardRow) {
      wardLabel = String(wardRow.number);
      wardLabelBn = toBanglaDigits(String(wardRow.number));
    } else {
      wardLabel = session.wardId;
      wardLabelBn = session.wardId;
    }
  }

  return buildPerformanceSnapshot({
    current,
    previous,
    range,
    crew,
    crewNames,
    // WO-002 — the citizen feedback aggregate. Derived from the
    // tickets in the CURRENT range only: the crew table is a
    // snapshot of this period, and mixing in the previous period's
    // feedback would make the ratio disagree with the "jobs
    // completed" column next to it (which counts the current
    // range only).
    feedback: aggregateCrewFeedback(current),
    ward: { wardId: session.wardId ?? null, wardLabel, wardLabelBn },
    now,
  });
}
