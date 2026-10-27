/**
 * Dispatcher monitor service (lib/dispatcher/monitor.ts).
 *
 * Backs the "Monitor Updates" surface at `/dispatcher/monitor`
 * (UX spec 2.5 — "Monitor Updates", Habib the Handler, screen 5 of 7).
 *
 * Three responsibilities, all pure where possible so the Vitest
 * suite can pin the arithmetic without a database:
 *
 *   1. `buildMonitorRows` — turns the watcher's watched tickets
 *      (with their status trail) into the row shape the page
 *      renders: thumbnail, category + ward, status pill, the
 *      most-recent-activity snippet, and the last 3 trail steps.
 *   2. `buildMonitorCharts` — turns the same ticket set into the
 *      three chart datasets the 280px right-hand strip shows:
 *      today's flow (stacked bar), avg response time (sparkline,
 *      last 7 days), crew load (bars).
 *   3. `acknowledgeMonitorUpdate` — the state-changing write
 *      behind the per-row "✓" button. Writes an audit row.
 *
 * The read path (`listMonitorTickets`) is DB-facing; the chart /
 * row builders are pure and exported so the unit tests can drive
 * them with fixture arrays.
 *
 * Backend-agnostic: goes through the `db` facade in
 * `lib/db-switch.ts`, so it works on Prisma or the in-memory dev
 * store.
 *
 * Scope: the dispatcher's session binds (cityId, wardId,
 * departmentId). The service filters by the session ward; the
 * route is the trust boundary (it calls `requireRole` +
 * `requireSameCity`).
 */

import { db, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { buildActorRoleMap } from '@/lib/identity/actor-role-map';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import type { SessionContext } from '@/lib/auth/session';

/** The statuses a dispatcher "watches" on the monitor surface. */
export const MONITOR_WATCHED_STATUSES = [
  'submitted',
  'routed',
  'in_progress',
  'resolved',
] as const;

export type MonitorWatchedStatus = (typeof MONITOR_WATCHED_STATUSES)[number];

/** The filter chips in the monitor header. */
export type MonitorFilter = 'all' | 'my_ward' | 'my_crews';

export const MONITOR_FILTERS: readonly MonitorFilter[] = [
  'all',
  'my_ward',
  'my_crews',
];

/** The trail steps revealed when a row is expanded. */
export const MONITOR_TRAIL_STEPS = 3;

/** The row shape the monitor page renders. */
export interface MonitorRow {
  id: string;
  status: string;
  categoryId: string;
  wardId: string;
  wardName: string | null;
  assignedCrewId: string | null;
  /** ISO timestamp of the most recent trail entry (or updatedAt). */
  updatedAt: string;
  /** The most recent activity snippet, e.g. "Rashid marked 'In progress' 5 min ago". */
  latestActivity: {
    /** The actor id of the most recent activity (or null when unknown). */
    actorId: string | null;
    /** The status the actor moved the ticket to (or null when unknown). */
    toStatus: string | null;
    /** The ISO timestamp of the activity. */
    timestamp: string;
    /** Whether the row is considered unread for the watcher. */
    unread: boolean;
  };
  /** The last `MONITOR_TRAIL_STEPS` trail entries, oldest first. */
  trail: Array<{
    toStatus: string;
    actorId: string | null;
    actorRole: string | null;
    note: string | null;
    timestamp: string;
  }>;
  /** The latest photo thumbnail URL (null when the ticket has no photo). */
  thumbnailUrl: string | null;
  /** Number of photos uploaded since the ticket was created. */
  photoCount: number;
}

/** One watched ticket as the DB layer sees it. */
export interface WatchedTicket {
  id: string;
  cityId: string;
  wardId: string;
  categoryId: string;
  status: string;
  assignedCrewId: string | null;
  createdAt: string;
  updatedAt: string;
  wardName?: string | null;
  photoUrls: string[];
  trail: Array<{
    toStatus: string;
    actorId: string | null;
    actorRole?: string | null;
    note: string | null;
    timestamp: string;
  }>;
}

/** The stacked "today's flow" bar: one count per status. */
export interface MonitorFlowChart {
  total: number;
  segments: Array<{ status: string; count: number }>;
}

/** The avg-response sparkline: one point per day, oldest first. */
export interface MonitorResponseSparkline {
  points: Array<{ date: string; avgMinutes: number; samples: number }>;
}

/** The crew-load bars: one bar per crew. */
export interface MonitorCrewLoad {
  crewId: string;
  crewName: string;
  openCount: number;
}

/** The whole 280px chart strip. */
export interface MonitorCharts {
  flow: MonitorFlowChart;
  response: MonitorResponseSparkline;
  crewLoad: MonitorCrewLoad[];
}

/** Read input for the monitor list. */
export interface ListMonitorInput {
  session: SessionContext;
  filter?: MonitorFilter;
  limit?: number;
}

/** The monitor read result. */
export interface ListMonitorResult {
  rows: MonitorRow[];
  charts: MonitorCharts;
  /** ISO timestamp of when the list was produced. */
  generatedAt: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Clamp a caller-supplied limit into the accepted band. */
export function clampMonitorLimit(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

/** Normalise a raw filter string into a `MonitorFilter`. */
export function normalizeMonitorFilter(raw: string | undefined): MonitorFilter {
  if (raw && (MONITOR_FILTERS as readonly string[]).includes(raw)) {
    return raw as MonitorFilter;
  }
  return 'all';
}

function toIso(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}

/**
 * Order two ISO timestamps descending (newest first).
 * Returns 0 for equal timestamps so the sort is stable-ish.
 */
export function compareByUpdatedAtDesc(
  a: { updatedAt: string },
  b: { updatedAt: string },
): number {
  if (a.updatedAt === b.updatedAt) return 0;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

/**
 * Build the monitor rows from the watched tickets.
 *
 * Pure: takes the ticket array (already filtered by ward / status)
 * and returns the row shapes. The "unread" flag is derived from
 * the presence of a trail entry newer than the watcher's last-read
 * marker; when the caller has no marker the latest activity counts
 * as unread the first time it is seen.
 *
 * `lastReadAt` is a map of ticketId → ISO timestamp. Tickets absent
 * from the map are treated as unread when they have at least one
 * trail entry.
 */
export function buildMonitorRows(
  tickets: WatchedTicket[],
  options?: { lastReadAt?: Record<string, string> },
): MonitorRow[] {
  const lastReadAt = options?.lastReadAt ?? {};
  return tickets
    .map((t) => {
      const trail = [...t.trail].sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
      );
      const latest = trail.length > 0 ? trail[trail.length - 1] : null;
      const updatedAt = latest ? latest.timestamp : toIso(t.updatedAt);
      const marker = lastReadAt[t.id];
      const unread = latest
        ? marker
          ? latest.timestamp > marker
          : true
        : false;
      return {
        id: t.id,
        status: t.status,
        categoryId: t.categoryId,
        wardId: t.wardId,
        wardName: t.wardName ?? null,
        assignedCrewId: t.assignedCrewId,
        updatedAt,
        latestActivity: {
          actorId: latest?.actorId ?? null,
          toStatus: latest?.toStatus ?? null,
          timestamp: updatedAt,
          unread,
        },
        trail: trail
          .slice(-MONITOR_TRAIL_STEPS)
          .map((e) => ({
            toStatus: e.toStatus,
            actorId: e.actorId ?? null,
            actorRole: e.actorRole ?? null,
            note: e.note,
            timestamp: e.timestamp,
          })),
        thumbnailUrl: t.photoUrls.length > 0 ? t.photoUrls[t.photoUrls.length - 1] : null,
        photoCount: t.photoUrls.length,
      };
    })
    .sort(compareByUpdatedAtDesc);
}

/** ISO day key (YYYY-MM-DD) for a timestamp. */
export function isoDayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Build the "today's flow" stacked bar: the count of watched
 * tickets per status, in the canonical status order.
 */
export function buildFlowChart(tickets: WatchedTicket[]): MonitorFlowChart {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  }
  const segments = MONITOR_WATCHED_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  return { total, segments };
}

/**
 * Build the avg-response sparkline over the last `days` days.
 *
 * "Response time" here is the median gap between a ticket's
 * creation and its first non-`submitted` trail step — the moment
 * the dispatcher picked it up. Days with no samples are emitted
 * with `avgMinutes: 0` and `samples: 0` so the x-axis keeps a
 * fixed number of points.
 *
 * `now` is injectable so the unit tests are deterministic.
 */
export function buildResponseSparkline(
  tickets: WatchedTicket[],
  options?: { days?: number; now?: Date },
): MonitorResponseSparkline {
  const days = options?.days ?? 7;
  const now = options?.now ?? new Date();
  // Build the day buckets, oldest first.
  const buckets: Array<{ date: string; samples: number[] }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86_400_000);
    buckets.push({ date: isoDayKey(d.toISOString()), samples: [] });
  }
  const bucketByDate = new Map(buckets.map((b) => [b.date, b]));

  for (const t of tickets) {
    const firstMove = t.trail
      .filter((e) => e.toStatus !== 'submitted')
      .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))[0];
    if (!firstMove) continue;
    const key = isoDayKey(firstMove.timestamp);
    const bucket = bucketByDate.get(key);
    if (!bucket) continue;
    const createdMs = Date.parse(t.createdAt);
    const movedMs = Date.parse(firstMove.timestamp);
    if (!Number.isFinite(createdMs) || !Number.isFinite(movedMs)) continue;
    const minutes = Math.max(0, Math.round((movedMs - createdMs) / 60_000));
    bucket.samples.push(minutes);
  }

  return {
    points: buckets.map((b) => {
      if (b.samples.length === 0) {
        return { date: b.date, avgMinutes: 0, samples: 0 };
      }
      const avg = Math.round(
        b.samples.reduce((sum, n) => sum + n, 0) / b.samples.length,
      );
      return { date: b.date, avgMinutes: avg, samples: b.samples.length };
    }),
  };
}

/**
 * Build the crew-load bars: how many watched (non-terminal)
 * tickets each crew member currently carries.
 *
 * Crew with no assigned tickets are not emitted — the chart shows
 * the load that exists, not the roster.
 */
export function buildCrewLoad(
  tickets: WatchedTicket[],
  crewNames?: Record<string, string>,
): MonitorCrewLoad[] {
  const open = new Map<string, number>();
  for (const t of tickets) {
    if (!t.assignedCrewId) continue;
    if (t.status === 'resolved') continue;
    open.set(t.assignedCrewId, (open.get(t.assignedCrewId) ?? 0) + 1);
  }
  return [...open.entries()]
    .map(([crewId, openCount]) => ({
      crewId,
      crewName: crewNames?.[crewId] ?? crewId,
      openCount,
    }))
    .sort((a, b) =>
      a.openCount === b.openCount
        ? a.crewId.localeCompare(b.crewId)
        : b.openCount - a.openCount,
    );
}

/** Build the whole chart strip from the watched tickets. */
export function buildMonitorCharts(
  tickets: WatchedTicket[],
  options?: { crewNames?: Record<string, string>; days?: number; now?: Date },
): MonitorCharts {
  return {
    flow: buildFlowChart(tickets),
    response: buildResponseSparkline(tickets, {
      days: options?.days,
      now: options?.now,
    }),
    crewLoad: buildCrewLoad(tickets, options?.crewNames),
  };
}

/**
 * List the dispatcher's watched tickets + the chart strip.
 *
 * The ward filter is applied in code (the dev store's
 * `findMany` does string-equality on every `where` key, and the
 * queue route already documents the same limitation). The
 * department filter is deliberately NOT applied here: the monitor
 * surface is a ward-level feed for the dispatcher's own ward, and
 * the spec's "category + ward" row shape implies all categories in
 * the ward are visible.
 */
export async function listMonitorTickets(
  input: ListMonitorInput,
): Promise<ListMonitorResult> {
  const limit = clampMonitorLimit(input.limit);
  const filter = input.filter ?? 'all';
  const session = input.session;

  const candidates = await db.ticket.findMany({
    where: {
      cityId: session.cityId,
      status: { in: [...MONITOR_WATCHED_STATUSES] as never },
    },
    orderBy: { createdAt: 'desc' },
  });

  const wardTickets = candidates.filter(
    (t) => !session.wardId || t.wardId === session.wardId,
  );

  // Resolve the crew names once (used by the crew-load chart).
  const crewIds = [
    ...new Set(
      wardTickets
        .map((t) => t.assignedCrewId)
        .filter((id): id is string => !!id),
    ),
  ];
  const crewRows = await Promise.all(
    crewIds.map(async (id) => db.user.findUnique({ where: { id } })),
  );
  const crewNames: Record<string, string> = {};
  for (const row of crewRows) {
    if (row) crewNames[row.id] = row.name;
  }

  const watched: WatchedTicket[] = await Promise.all(
    wardTickets.map(async (t) => {
      const withTrail = await getTicketWithTrail(t.id);
      if (!withTrail) {
        return {
          id: t.id,
          cityId: t.cityId,
          wardId: t.wardId,
          categoryId: t.categoryId,
          status: t.status,
          assignedCrewId: t.assignedCrewId,
          createdAt: toIso(t.createdAt),
          updatedAt: toIso(t.updatedAt),
          wardName: null,
          photoUrls: [] as string[],
          trail: [] as WatchedTicket['trail'],
        };
      }
      const actorRoles = await buildActorRoleMap(
        withTrail.trail.map((e) => e.actorId),
      );
      const serialized = serializeTicketForRole(
        withTrail,
        withTrail.trail,
        session.role,
        'bn',
        actorRoles,
      );
      return {
        id: serialized.id,
        cityId: serialized.cityId,
        wardId: serialized.wardId,
        categoryId: serialized.categoryId,
        status: serialized.status,
        assignedCrewId: serialized.assignedCrewId,
        createdAt: serialized.createdAt,
        updatedAt: toIso(withTrail.updatedAt),
        wardName: serialized.wardName,
        photoUrls: serialized.photoUrls,
        trail: serialized.trail.map((e) => ({
          toStatus: e.toStatus,
          actorId: e.actorId,
          actorRole: e.actorRole,
          note: e.note,
          timestamp: e.timestamp,
        })),
      };
    }),
  );

  const rows = buildMonitorRows(watched);

  // Apply the chip filter at the row level:
  //   - 'all'      → every watched ticket
  //   - 'my_ward'  → only the dispatcher's session ward
  //   - 'my_crews' → only tickets assigned to a crew member
  const filteredRows =
    filter === 'my_ward'
      ? rows.filter((r) => !session.wardId || r.wardId === session.wardId)
      : filter === 'my_crews'
        ? rows.filter((r) => !!r.assignedCrewId)
        : rows;

  return {
    rows: filteredRows.slice(0, limit),
    charts: buildMonitorCharts(watched, { crewNames }),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Acknowledge a monitor update for a ticket.
 *
 * State-changing: writes an audit row with the action
 * `ticket.monitor_acknowledge`. The acknowledgement itself is
 * client-held in v1 (the spec's v1 default is "the dispatcher
 * clears the visual notification"), so this route records the
 * intent rather than persisting a per-user read marker — the
 * Prisma schema has no read-marker table and another agent owns
 * migrations.
 *
 * Throws `ApiError` (the route catches and serialises):
 *   - 404 `not_found` when the ticket does not exist or is outside
 *     the dispatcher's ward. Out-of-scope is reported as 404 (not
 *     403) so a dispatcher cannot probe ticket existence outside
 *     their scope.
 *   - 403 `cross_city_access_denied` when the ticket is in
 *     another city.
 */
export async function acknowledgeMonitorUpdate(
  ticketId: string,
  session: SessionContext,
): Promise<{ ticketId: string; acknowledgedAt: string }> {
  const withTrail = await getTicketWithTrail(ticketId);
  if (!withTrail) {
    throw new ApiError(404, 'not_found');
  }
  if (withTrail.cityId !== session.cityId) {
    throw new ApiError(404, 'not_found');
  }
  if (session.wardId && withTrail.wardId !== session.wardId) {
    throw new ApiError(404, 'not_found');
  }

  const acknowledgedAt = new Date().toISOString();
  await writeAudit({
    entityType: 'ticket',
    entityId: ticketId,
    action: 'ticket.monitor_acknowledge',
    actorId: session.userId,
    beforeValue: { acknowledged: false },
    afterValue: { acknowledged: true, acknowledgedAt },
  });

  return { ticketId, acknowledgedAt };
}
