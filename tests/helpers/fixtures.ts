/**
 * Ticket-fixture coordinate helpers for the Playwright route specs
 * (tests/helpers/fixtures.ts).
 *
 * ── Why this exists ────────────────────────────────────────────
 *
 * The dev store is ONE in-memory database shared by every spec in a
 * run, and it lives for the whole Playwright session. PLAT-REQ-004
 * de-duplicates a new ticket against an existing one at the **exact
 * spot** (the 50 m radius is a PROMPT, not the key). So a ticket
 * created at a fixed coordinate is still there when the NEXT spec —
 * or the next test in the same spec — creates its fixture at the same
 * spot, and the creation comes back as `dedup_match` (a 200 with a
 * `dedup_match` body) instead of a 201.
 *
 * That is the dedup rule working exactly as designed. It is a
 * fixture-isolation defect, not a product bug.
 *
 * ── Why a shared helper, and not a per-file counter ────────────
 *
 * A per-file monotonic counter is not enough. Two different specs
 * that each start their counter at 0 land on the SAME first
 * coordinate, and the second one to run collides with the first. The
 * counters also drift out of step with the store: `tests/22-slow-
 * motion-e2e-demo.spec.ts` calls `POST /api/dev/reset`, which wipes
 * the store's tickets while the counters keep climbing.
 *
 * The fix here is to give each spec file a DISJOINT BAND of
 * coordinates, derived from the file name, and to walk within that
 * band. Two files can then never produce the same spot, whatever the
 * run order and whatever the store contains.
 *
 * ── The geometry ───────────────────────────────────────────────
 *
 * Dhaka's centre is roughly 23.78 N, 90.40 E. One degree of latitude
 * is ~111 km, so 0.001° is ~111 m. The band stride is 0.01° (~1.1 km)
 * and the within-band step is 0.002° (~222 m) — comfortably outside
 * the 50 m dedup prompt radius while staying inside Mirpur
 * (ward_14), the dispatcher's ward.
 *
 * The bands run NORTH-EAST from the centre, so a fixture stays a few
 * kilometres from the seed tickets (which all sit within ~500 m of
 * the centre) and from the city geofence.
 */

/** Dhaka city centre — the anchor every fixture band is measured from. */
export const DHAKA_CENTER = { lat: 23.7804, lng: 90.4004 } as const;

/** Degrees of latitude per band step (~1.1 km). */
const BAND_STRIDE_DEG = 0.01;

/** Degrees of latitude per within-band step (~222 m). */
const WITHIN_BAND_STEP_DEG = 0.002;

/** How many within-band slots a band has before it wraps to the next one. */
const WITHIN_BAND_SLOTS = 40;

/**
 * Derive a stable, non-negative band index from a spec file name.
 *
 * The band index only has to be DIFFERENT between spec files that
 * create tickets. A string hash gives that with no registry to keep
 * in sync — adding a new spec file cannot collide with an existing
 * one by accident, because the hash is over the file name.
 */
function bandIndexFor(fileName: string): number {
  let hash = 0;
  for (let i = 0; i < fileName.length; i += 1) {
    hash = (hash * 31 + fileName.charCodeAt(i)) >>> 0;
  }
  // Keep the band index small enough that every band stays in the
  // northern suburbs, and large enough to separate files.
  return hash % 24;
}

/**
 * Reset the in-memory dev store.
 *
 * The dev server — and therefore the store it holds — lives for the
 * whole PROCESS, not for one Playwright run. A spec that is run
 * twice against the same dev server finds the previous run's
 * tickets still there, and a fixture created at the same coordinate
 * comes back as `dedup_match` (a 200 with a `dedup_match` body)
 * instead of a 201.
 *
 * Coordinate bands alone cannot fix this: they separate spec FILES
 * from each other, but they cannot separate two RUNS of the same
 * file, because both runs start at the same slot of the same band.
 * Resetting the store is what makes a run reproducible.
 *
 * The endpoint is dev-store gated, so this is a no-op (404) against
 * a real database — which is correct: a real database is not
 * disposable, and no spec may wipe it.
 */
export async function resetDevStore(request: {
  post: (url: string) => Promise<{ status: () => number }>;
}): Promise<void> {
  const base = process.env.BASE_URL ?? 'http://localhost:3000';
  const resp = await request.post(`${base}/api/dev/reset`);
  if (resp.status() !== 200) {
    throw new Error(
      `POST /api/dev/reset expected 200, got ${resp.status()} — ` +
        'the dev store is not enabled, so ticket fixtures cannot be isolated.',
    );
  }
}

/**
 * A per-file coordinate generator.
 *
 * Call `freshPin()` once per ticket the spec creates. Every call
 * returns a spot that is (a) unique within this file, (b) in this
 * file's own band, and therefore (c) unique across every other spec
 * file in the run.
 */
export interface PinGenerator {
  /** The next unused spot in this file's band. */
  (): { lat: number; lng: number };
}

/**
 * Create a coordinate generator for a spec file.
 *
 * @param fileName The spec file name, e.g. `11-dispatcher-detail-light.spec.ts`.
 *                 It only has to be stable and unique per file.
 */
export function createPinGenerator(fileName: string): PinGenerator {
  const band = bandIndexFor(fileName);
  let slot = 0;

  return () => {
    const bandStep = Math.floor(slot / WITHIN_BAND_SLOTS);
    const withinBand = slot % WITHIN_BAND_SLOTS;
    slot += 1;

    return {
      lat:
        DHAKA_CENTER.lat +
        (band + 1) * BAND_STRIDE_DEG +
        withinBand * WITHIN_BAND_STEP_DEG,
      // Push the longitude slightly so a spot is never an exact
      // repeat of another band's slot even at the same latitude.
      lng: DHAKA_CENTER.lng - 0.03 - band * 0.002,
    };
  };
}

/**
 * The pinned epoch, in milliseconds — the "now" the dev server seeded
 * its rows from.
 *
 * ── Why a spec needs this ──────────────────────────────────────
 *
 * The dev store seeds its audit rows and tickets relative to a
 * PINNED epoch (`CITYFIX_SEED_NOW`), so that the rendered pages are
 * byte-identical between runs and a committed visual baseline can
 * hold. A spec that builds a query window from the WALL clock is
 * then asking a different question from the one the server answered:
 * the window sits in the future, matches no seeded row, and the
 * count comes back 0.
 *
 * This is exactly what `ADM-007` in `18-admin-audit-light.spec.ts`
 * did — `const now = new Date()` — and it failed with 0 entries where
 * 2 were expected.
 *
 * The helper reads the SAME environment variable the server reads.
 * `NEXT_PUBLIC_` is checked first for the same reason
 * `lib/format/clock.ts` checks it first: it is the one that is
 * guaranteed to be inlined into the client bundle, so the server and
 * the browser cannot disagree about "now".
 */
export function pinnedEpochMs(): number {
  const pinned =
    process.env.NEXT_PUBLIC_CITYFIX_SEED_NOW ?? process.env.CITYFIX_SEED_NOW;
  if (!pinned) {
    // No pin — the server is on the wall clock too, so the wall
    // clock is the correct reference here.
    return Date.now();
  }
  const parsed = Date.parse(pinned);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `CITYFIX_SEED_NOW="${pinned}" is not a valid ISO timestamp — ` +
        'the spec cannot align its query window with the seeded rows.',
    );
  }
  return parsed;
}
