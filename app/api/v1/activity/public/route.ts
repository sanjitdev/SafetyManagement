/**
 * GET /api/v1/activity/public — public (and city-scoped) city activity feed.
 *
 * v1.1 launch-polish hotfix: the public landing at `/` (app/page.tsx)
 * shows a read-only city activity feed for visitors who haven't
 * registered. This endpoint is the data source. After Bolt 008-012,
 * the /feed page (1.13) also uses this endpoint, so it works for
 * every signed-in role (citizen / dispatcher / crew / admin) — the
 * previous version depended on the citizen-only /api/report/bootstrap
 * which 403'd for staff and surfaced the misleading "Could not load
 * feed" error.
 *
 * No auth required — the response is PII-stripped via
 * `serializeTicketForPublic` (see lib/serializers/ticket.ts). Every
 * internal field is removed: no reporterId, no internalNote, no
 * assignedCrewId, no trail, no locationLabel.
 *
 * Defaults: 20 most recent tickets, scoped to:
 *   - the explicit `?cityId=...` if the caller passed one
 *   - else the active session's city (Bolt 008-012) if a session
 *     cookie is present — this is what makes /feed work for an admin
 *     in Chattogram vs Dhaka North without a query string
 *   - else the platform's primary seeded city (v1 = Dhaka North)
 *
 * Polling: the public landing refreshes every 30 s, /feed every 15 s.
 * No user-specific state; no rate limit per user — per-IP only via
 * the in-process token bucket (lib/platform/rate-limit.ts) on the
 * existing `POLL_RATE_LIMIT_PER_SECOND` env var (default 1/s).
 *
 * Response shape:
 *   { tickets: PublicSerializedTicket[], categories: CategoryStub[],
 *     wards: PublicWardStub[], stats: PublicActivityStats }
 *
 * The `categories` array is the city's category list (id, slug, name,
 * nameBn). The /feed page used to call /api/report/bootstrap just to
 * fetch the category list; surfacing it here lets the page make a
 * single round-trip. Categories are not PII — they're public city
 * configuration.
 *
 * The `stats` object carries the landing page's stats row ("reports
 * this month", "resolved", "avg days to resolve") and the per-chip
 * counts for the filter row. Both are city-wide aggregates, so they
 * do NOT change with the `?status=` filter — the chips need to show
 * the size of every group even when another group is selected.
 *
 * Query params:
 *   - `cityId`  — explicit city scope (else the session's city, else
 *                 the platform's primary seeded city).
 *   - `limit`   — page size, 1-50, default 20.
 *   - `status`  — `all` (default) | `new` | `active` | `resolved`.
 *                 Grouped, not per-status: see `STATUS_GROUP`.
 *   - `ward`    — optional ward id (or ward number as a string) to
 *                 narrow the feed to one locality. Omit for the whole
 *                 city. Combined with `status` (AND).
 *
 * The ward filter is applied over the city's FULL ticket set, not
 * over the returned page — a citizen who picks "Ward 14" then
 * narrows to "New" must still be choosing from every Ward-14 report
 * the city holds, not just the 30 rows that happened to be on
 * screen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getTicketWithTrail, getActiveSession } from '@/lib/db-switch';
import { serializeTicketForPublic } from '@/lib/serializers/ticket';

const PublicActivityInput = z.object({
  cityId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /**
   * Status filter for the landing page's filter chips. The chips are
   * grouped, not per-status: "new" = submitted + routed (a report
   * nobody has started working on yet), "active" = in_progress,
   * "resolved" = resolved + closed + cancelled (terminal states).
   */
  status: z.enum(['all', 'new', 'active', 'resolved']).default('all'),
  /**
   * Ward (locality) filter. Accepts a ward id ("cmvtghhkl00182f9o3q8zx2e8")
   * OR the ward number as a string ("14"). The number form is what the
   * landing page's ward chips send — the chips are rendered from the
   * ward list in this response, and the number is the stable, readable
   * label ("14"). The id form is kept so a deep link can pin an exact
   * ward.
   *
   * An unknown ward resolves to "no rows" rather than a 400: a stale
   * bookmark to a deleted ward should show an empty feed, not an
   * error banner on a public page.
   */
  ward: z.string().min(1).optional(),
});

/**
 * Expand a chip group into the concrete ticket statuses it covers.
 *
 * The chips are what a citizen thinks in ("is anyone working on it?"),
 * not the internal status enum ("submitted" vs "routed"). Mapping
 * them here keeps the chip vocabulary in the UI and the status
 * vocabulary in the data layer separate.
 */
const STATUS_GROUP: Record<
  'new' | 'active' | 'resolved',
  Array<'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled'>
> = {
  new: ['submitted', 'routed'],
  active: ['in_progress'],
  resolved: ['resolved', 'closed', 'cancelled'],
};

/**
 * The counters behind the landing page's stats row and filter chips.
 *
 * All counts are city-wide, not affected by the `status` filter — the
 * chips need to show how many reports exist in each group even when
 * a different group is selected.
 */
export interface PublicActivityStats {
  /** Tickets created in the current calendar month. */
  reportsThisMonth: number;
  /** Tickets in a terminal "fixed" state created in the current month. */
  resolvedThisMonth: number;
  /** `resolvedThisMonth / reportsThisMonth`, as a percentage (0-100). */
  resolutionRate: number;
  /** Mean days from creation to resolution over resolved tickets. */
  avgDaysToResolve: number;
  /** Per-chip counts for the filter row. */
  counts: { all: number; new: number; active: number; resolved: number };
}

/**
 * One ward in the city's ward list, as surfaced to the landing
 * page's location filter.
 *
 * `number` is the ward's number within the city (1..N). The landing
 * page's chips send this back as `?ward=<number>` — it is the
 * readable, stable label, whereas `id` is a cuid that means nothing
 * to a citizen.
 *
 * `count` is how many of the city's reports sit in this ward. It is
 * computed over the FULL ticket set (before any status or ward
 * filter), matching the chip-count contract above: the chip shows
 * the size of the group, not the size of the current page.
 */
export interface PublicWardStub {
  id: string;
  number: number;
  name: string;
  nameBn: string | null;
  count: number;
}

/**
 * The ticket statuses the counters group by. Mirrors the Prisma
 * `TicketStatus` enum, kept local so the route has no import cycle
 * with the Prisma client (the endpoint also runs against the dev
 * store, which has no generated client types).
 */
type TicketStatusLike =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

/**
 * The minimum a ticket row must carry for the stats computation.
 * Structurally satisfied by both the Prisma row and the dev-store row.
 */
interface StatsTicket {
  status: string;
  createdAt: Date | string;
  resolvedAt?: Date | string | null;
}

function toMs(value: Date | string): number {
  return typeof value === 'string' ? new Date(value).getTime() : value.getTime();
}

/**
 * Compute the landing page's counters from a city's full ticket set.
 *
 * Exported for unit testing — the dev store and the Prisma path both
 * feed this function, so the numbers cannot drift between them.
 */
export function computeStats(
  tickets: StatsTicket[],
  now: Date = new Date(),
): PublicActivityStats {
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).getTime();

  const counts = { all: tickets.length, new: 0, active: 0, resolved: 0 };

  let reportsThisMonth = 0;
  let resolvedThisMonth = 0;
  let resolveDurations: number[] = [];

  for (const ticket of tickets) {
    const status = ticket.status as TicketStatusLike;

    if (status === 'submitted' || status === 'routed') counts.new += 1;
    else if (status === 'in_progress') counts.active += 1;
    else counts.resolved += 1;

    const createdMs = toMs(ticket.createdAt);
    if (createdMs < monthStart) continue;

    reportsThisMonth += 1;

    // A ticket counts as resolved this month if it reached a terminal
    // state — resolved, closed, or cancelled. `cancelled` is included
    // because a cancelled report is also one the city is no longer
    // working on; excluding it would flatter the resolution rate.
    if (status === 'resolved' || status === 'closed' || status === 'cancelled') {
      resolvedThisMonth += 1;
    }

    if (ticket.resolvedAt) {
      const durationMs = toMs(ticket.resolvedAt) - createdMs;
      // Guard against a negative duration (clock skew or a bad
      // resolvedAt write) — a negative average would be nonsense.
      if (durationMs >= 0) {
        resolveDurations.push(durationMs);
      }
    }
  }

  const avgDaysToResolve =
    resolveDurations.length === 0
      ? 0
      : resolveDurations.reduce((a, b) => a + b, 0) /
        resolveDurations.length /
        (24 * 60 * 60 * 1000);

  return {
    reportsThisMonth,
    resolvedThisMonth,
    resolutionRate:
      reportsThisMonth === 0 ? 0 : Math.round((resolvedThisMonth / reportsThisMonth) * 100),
    avgDaysToResolve: Math.round(avgDaysToResolve * 10) / 10,
    counts,
  };
}

/**
 * The ticket fields the filter needs. Structurally satisfied by both
 * the Prisma row and the dev-store row.
 */
interface FilterableTicket {
  status: string;
  wardId: string;
}

/**
 * Apply the landing page's status + ward filters to a city's tickets.
 *
 * ── The contract that matters ───────────────────────────────────
 *
 * The filters run over the FULL city ticket set, and the caller
 * slices the result afterwards. That ordering is the whole point:
 * a citizen who picks "Ward 1" and then "New" is choosing from every
 * New report in Ward 1 — not from the New reports that happened to
 * fall inside the first 30 rows of the unfiltered feed. Slicing
 * first and filtering second silently returns a short page that
 * looks like "Ward 1 has only these two reports".
 *
 * The status filter and the ward filter combine with AND.
 *
 * The generic preserves the input row type so the caller keeps the
 * full ticket shape (the route hydrates each row afterwards).
 *
 * Exported for unit testing — the dev store and the Prisma path both
 * feed this function, so the two cannot drift.
 */
export function applyPublicFilters<T extends FilterableTicket>(
  tickets: T[],
  status: 'all' | 'new' | 'active' | 'resolved',
  wardId: string | null,
): T[] {
  const statusFilter =
    status === 'all' ? undefined : { in: STATUS_GROUP[status] };
  let filtered =
    statusFilter === undefined
      ? tickets
      : tickets.filter((tk) =>
          statusFilter.in.includes(
            tk.status as (typeof statusFilter.in)[number],
          ),
        );
  if (wardId) {
    filtered = filtered.filter((tk) => tk.wardId === wardId);
  }
  return filtered;
}

/**
 * Resolve the `?ward=` selector to a concrete ward id.
 *
 * Accepts the ward NUMBER (what the landing's chips send) or the
 * ward id (what a deep link carries). A selector that matches no
 * ward in this city resolves to `null`, which yields an empty feed
 * below — a stale bookmark should show "nothing here yet", not an
 * error banner on a public page.
 *
 * The NUMBER is matched first. A ward id is a cuid ("cmvtghhkl…")
 * and never a bare integer, so the two forms cannot collide in
 * practice — but matching the number first means a selector of "1"
 * always means ward 1, which is what a reader (and the chip) means
 * by it. An id-shaped selector contains letters and falls through to
 * the id match.
 */
export function resolveWardSelector(
  selector: string | null | undefined,
  wards: ReadonlyArray<{ id: string; number: number }>,
): string | null {
  if (!selector) return null;
  const trimmed = selector.trim();
  if (!trimmed) return null;

  const byNumber = wards.find((w) => String(w.number) === trimmed);
  if (byNumber) return byNumber.id;

  const byId = wards.find((w) => w.id === trimmed);
  return byId?.id ?? null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = PublicActivityInput.safeParse({
    cityId: url.searchParams.get('cityId') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    ward: url.searchParams.get('ward') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { cityId, limit, status, ward } = parsed.data;

  /**
   * The city-wide counters behind the landing page's stats row
   * ("reports this month", "resolved", "avg days to resolve") and the
   * per-chip counts for the filter row.
   *
   * Initialised here (before the early returns) so the degraded
   * responses below can include it — a landing page that renders
   * "0 reports this month" is materially different from one that
   * renders an empty stats row.
   *
   * Computed from a single unbounded read of the city's tickets rather
   * than a Prisma `count`/`aggregate`. That is deliberate:
   *   - the dev store has no `count`/`aggregate` surface, so a
   *     Prisma-only aggregate would make the landing page's stats
   *     disappear in dev-store mode — the mode the Playwright suite
   *     runs in;
   *   - the counters need a month-window and a resolved-duration
   *     average, which are trivial in JS and awkward across the two
   *     backends' differing aggregate semantics.
   *
   * v1's city is small (a few hundred tickets), so one read is cheap.
   * If a city's ticket count grows into the tens of thousands this
   * should move to a proper aggregate — noted here so the next
   * person to read this knows it was a considered choice.
   */
  let stats: PublicActivityStats = {
    reportsThisMonth: 0,
    resolvedThisMonth: 0,
    resolutionRate: 0,
    avgDaysToResolve: 0,
    counts: { all: 0, new: 0, active: 0, resolved: 0 },
  };

  // Bolt 008-012: resolve the default city in three tiers:
  //   1. explicit `?cityId=...` from the caller
  //   2. the active session's cityId (so /feed works for an admin or
  //      dispatcher in any city without a query string)
  //   3. the platform's primary seeded city (v1 = Dhaka North)
  //
  // We do NOT throw on bad/missing session cookies — getActiveSession
  // returns null for unauthenticated callers, which is the right
  // behaviour for the public landing page.
  let resolvedCityId = cityId ?? null;
  if (!resolvedCityId) {
    try {
      // Bolt 008-012: read the session cookie directly (we're a public
      // endpoint, so we can't rely on the auth middleware having run).
      // `getActiveSession` does the cookie → session-id → store lookup
      // in one call and returns the union shape (userId, role, cityId,
      // wardId, name). For an anonymous visitor the call returns null
      // and we fall through to the alphabetical-first default.
      const session = await getActiveSession();
      if (session?.cityId) {
        resolvedCityId = session.cityId;
      }
    } catch {
      // getActiveSession can throw if the session-id format is
      // malformed. That's not a /feed-breaking failure — fall through
      // to the public default.
    }
  }
  if (!resolvedCityId) {
    // Anonymous / unauthenticated caller — default to the platform's
    // first seeded city (v1 = Dhaka North). Looking up by createdAt
    // ASC is a stable proxy; the City model carries the seed order.
    //
    // If the database is unreachable (outage, suspended compute, quota),
    // degrade to an empty feed rather than a 500: this endpoint backs
    // the public landing page and /feed, both of which are read-only
    // marketing surfaces. A hard 500 there takes down the whole site
    // for a backend fault that a retry would fix.
    try {
      const firstCity = await db.city.findFirst({
        orderBy: { createdAt: 'asc' },
      });
      resolvedCityId = firstCity?.id ?? null;
    } catch {
      return NextResponse.json({ tickets: [], categories: [], wards: [], stats });
    }
  }
  if (!resolvedCityId) {
    // No cities seeded yet — return an empty feed rather than 500.
    return NextResponse.json({ tickets: [], categories: [], wards: [], stats });
  }

  // Bolt 008-012: surface the city's categories in the same response
  // so the /feed page can do the categoryId → name lookup without a
  // second round-trip to the citizen-only /api/report/bootstrap.
  // Category rows are public city configuration (not PII) and small
  // (≈5 rows for v1), so this is a cheap addition. The dev store's
  // `category.findMany` already sorts alphabetically by name; the
  // Prisma path inherits the same default. The shared db-switch type
  // does not expose `orderBy` for categories yet, so we sort in JS
  // here for parity across dev + prod.
  //
  // A database outage degrades to an empty feed rather than a 500 —
  // see the note on the city lookup above.
  let categories: Array<{
    id: string;
    slug: string;
    name: string;
    nameBn: string | null;
  }> = [];
  let wards: PublicWardStub[] = [];
  let tickets: Awaited<ReturnType<typeof db.ticket.findMany>> = [];
  try {
    const categoryRows = await db.category.findMany({
      where: { cityId: resolvedCityId },
    });
    categories = [...categoryRows]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        nameBn: c.nameBn,
      }));

    const allTickets = await db.ticket.findMany({
      where: { cityId: resolvedCityId },
      orderBy: { createdAt: 'desc' },
    });

    stats = computeStats(allTickets);

    /**
     * The city's ward list, for the landing page's location filter.
     *
     * A ward with no reports is still listed — the filter is a map of
     * the city, and a citizen looking for their locality should see
     * it even if nobody has filed yet (count 0). The `count` on each
     * row is computed over the FULL ticket set so the chip shows the
     * size of the locality regardless of which status chip is active.
     *
     * Sorted by ward number (the natural reading order for a city).
     * The dev store's `ward.findMany` already sorts by number; the
     * Prisma path inherits no default order, so we sort in JS here
     * for parity across dev + prod — the same reason the category
     * list is sorted in JS above.
     */
    const wardRows = await db.ward.findMany({
      where: { cityId: resolvedCityId },
    });
    const wardCountById = new Map<string, number>();
    for (const tk of allTickets) {
      wardCountById.set(tk.wardId, (wardCountById.get(tk.wardId) ?? 0) + 1);
    }
    wards = [...wardRows]
      .sort((a, b) => a.number - b.number)
      .map((w) => ({
        id: w.id,
        number: w.number,
        name: w.name,
        nameBn: w.nameBn,
        count: wardCountById.get(w.id) ?? 0,
      }));

    /**
     * Resolve the `?ward=` selector to a concrete ward id, then
     * apply the status + ward filters over the city's FULL ticket
     * set. The slice comes LAST — so "Ward 14 + New" is every New
     * report in Ward 14, not the New reports that happened to fall
     * inside the first 30 rows.
     */
    const selectedWardId = resolveWardSelector(ward, wards);
    const filtered = applyPublicFilters(allTickets, status, selectedWardId);

    tickets = filtered.slice(0, limit);
  } catch {
    return NextResponse.json({ tickets: [], categories: [], wards: [], stats });
  }

  // Bolt 008-011: hydrate each ticket via `getTicketWithTrail` so the
  // public serializer can surface `wardName` / `wardNameBn` (the
  // card renders "Ward 14 — Mirpur" instead of the raw wardId).
  // The trail + photos + reporter fields on the joined row are
  // already dropped by `serializeTicketForPublic`, so this is safe
  // for the anonymous surface.
  //
  // A per-ticket hydration failure must not take down the whole feed
  // — fall back to the un-hydrated row for that one ticket.
  const out = await Promise.all(
    tickets.map(async (t) => {
      try {
        const withTrail = await getTicketWithTrail(t.id);
        return serializeTicketForPublic((withTrail ?? t) as never);
      } catch {
        return serializeTicketForPublic(t as never);
      }
    }),
  );

  return NextResponse.json({ tickets: out, categories, wards, stats });
}
