/**
 * Citizen-facing ticket serializer (lib/serializers/ticket.ts).
 *
 * PLAT-REQ-001 acceptance: internal-only fields (assigned_crew_id, internal
 * note, before-photos from Rashid's perspective) hidden from citizen queries.
 *
 * PLAT-REQ-005 acceptance: citizen-facing serializer maps actor_id to
 * "City corporation" (anonymized).
 *
 * The v1 split: this module exports one serializer per role. The route
 * handler picks based on the session.
 *
 * Backend-agnostic: takes a plain object shape (the same field names appear
 * in both Prisma's Ticket and the dev-store DevTicket) plus a `trail`
 * array of trail entries. The serializer does not touch the DB.
 *
 * Bolt 007-001: photos now arrive as `TicketPhoto` rows (with
 * `uploadedByRole` discriminator) instead of a flat `photoUrls: string[]`.
 * The citizen branch exposes `beforePhotoUrls` (citizen photos) and
 * `afterPhotoUrls` (crew photos); the legacy `photoUrls: string[]` is
 * preserved on every branch as the union of the two arrays, for
 * back-compat with internal consumers. The citizen branch also applies
 * the trail filter (lib/serializers/trail.ts → applyCitizenTrailFilter)
 * which rewrites any `^[a-z_]+:` marker-shaped note to a localized
 * "After photo added" string.
 */

import type { Role, TicketStatus } from '@prisma/client';
import { applyCitizenTrailFilter, bucketPhotosByRole } from './trail';
import type { SlaTone } from '@/lib/dispatcher/sla';

const ANONYMIZED_ACTOR_LABEL = {
  bn: 'সিটি কর্পোরেশন',
  en: 'City corporation',
} as const;

export interface TrailEntryLike {
  toStatus: TicketStatus;
  actorId: string;
  /**
   * The actor's display name, when the backend joined it.
   *
   * Optional on purpose: several callers construct trail rows by
   * hand (audit rehydration, unit fixtures) without an actor
   * lookup. When it is absent the serializer falls back to the
   * actor id, which is what those callers already showed.
   */
  actorName?: string | null;
  note: string | null;
  timestamp: Date | string;
}

/**
 * A single photo row the citizen serializer partitions.
 *
 * The same shape is exposed by:
 *   - Prisma: `TicketPhoto` (uploadedAt is `Date`)
 *   - dev store: `DevTicketPhoto` (uploadedAt is `string` ISO)
 */
export interface PhotoLike {
  id?: string;
  url: string;
  uploadedByRole: string;
  uploadedAt: Date | string;
}

export interface TicketLike {
  id: string;
  cityId: string;
  wardId: string;
  categoryId: string;
  status: TicketStatus;
  locationLng: number;
  locationLat: number;
  locationLabel: string | null;
  locationLabelBn: string | null;
  note: string | null;
  /**
   * Bolt 007-001: the new photo model. `photos[]` is the ordered list
   * of `TicketPhoto` rows (ordered by `uploadedAt` ASC) the citizen
   * serializer partitions into before/after. Callers that don't yet
   * join the new table pass an empty array.
   */
  photos?: PhotoLike[];
  createdAt: Date | string;
  resolvedAt: Date | string | null;
  /**
   * WHY the ticket was closed, and (when it was closed as a
   * duplicate) WHICH ticket it duplicates.
   *
   * Set by the dispatcher dedup-confirm route (DISP-006). These are
   * workflow state, not citizen PII, so the staff branch exposes
   * them — but the citizen branch does not (there is no citizen
   * surface for a duplicate closure yet; see DISP-006 "Out of
   * scope").
   */
  closeReason?: string | null;
  duplicateOfId?: string | null;
  assignedCrewId: string | null;
  internalNote: string | null;
  reporterId: string;
  /**
   * Denormalised ward name(s) for citizens. Populated by
   * `getTicketWithTrail` (lib/db-switch.ts) which joins Ward.
   * Optional because older call sites (dispatcher/crew list
   * endpoints) do not need to surface them; the citizen
   * serializer silently falls back to `null` when the join
   * is absent.
   */
  wardName?: string | null;
  wardNameBn?: string | null;
  /**
   * Bolt 008-002 — Story 002: city + reporter display names,
   * populated by the same join (`getTicketWithTrail`). Same
   * optional / fallback contract as `wardName`. The city
   * names are not citizen-PII (a city is not a person); we
   * expose them to every role.
   */
  cityName?: string | null;
  cityNameBn?: string | null;
  reporterName?: string | null;
  /**
   * The assigned crew member's display name, populated by the same
   * `getTicketWithTrail` join. `null` when no crew is assigned or
   * the join is unavailable — the UI then falls back to the crew id.
   */
  assignedCrewName?: string | null;
  /**
   * Denormalised category display names + slug, populated by the
   * same `getTicketWithTrail` join. `categorySlug` is the stable
   * machine key the UI uses to pick a glyph (the slug is what
   * `categoryIcon` switches on — passing the id there always
   * fell through to the "unknown" glyph). The names let the UI
   * render "Roadside streetlight missing" instead of the raw
   * `cat_streetlight` id.
   */
  categorySlug?: string | null;
  categoryName?: string | null;
  categoryNameBn?: string | null;
  /**
   * The per-category resolution SLA (Wave 4 / bolt 009-005).
   *
   * The caller resolves the `SlaPolicy` row for the ticket's
   * category and passes the target + the computed remaining hours
   * in. The serializer does NOT look the policy up itself — it has
   * no database access, and a serializer that queries would be one
   * N+1 per ticket on a list endpoint.
   *
   * All four fields are optional. A call site that has not adopted
   * the SLA read path yet omits them, and the serializer emits
   * `null` — the same "no target" state a category without a policy
   * produces. A missing value therefore degrades to "no SLA", never
   * to "on time".
   */
  slaTargetHours?: number | null;
  slaRemainingHours?: number | null;
  slaStartedAt?: string | null;
  slaDueAt?: string | null;
  /**
   * The resolved tone. Optional for the same reason as the fields
   * above — a call site that has not adopted the SLA read path
   * omits it, and the serializer emits `null`.
   */
  slaTone?: SlaTone | null;
}

export interface SerializedTicketTrailEntry {
  toStatus: TicketStatus;
  /** Anonymized for citizens; real actor for dispatcher/crew/admin. */
  actorLabel: string;
  /**
   * Intent 008 / Bolt 008-002: raw actor id, exposed only to
   * dispatcher/crew/admin (citizens never see this — the citizen
   * branch anonymises to "City corporation"). The client uses
   * this + `actorRole` to look up a display name via
   * `lib/identity/display-name.ts`.
   */
  actorId: string | null;
  /**
   * The actor's display name, joined server-side.
   *
   * `actorId` cannot be turned into a name on the client: it is
   * backend-specific (the dev store's demo personas are
   * `user_crew_rashid`; a real database's rows are `seed_cit_01`),
   * so an id→name map only fits one backend and printed raw ids on
   * the other. `null` for citizens (anonymised) and when the join
   * is missing.
   */
  actorName: string | null;
  actorRole: 'citizen' | 'dispatcher' | 'crew' | 'admin' | null;
  note: string | null;
  timestamp: string;
}

export interface SerializedTicket {
  id: string;
  cityId: string;
  /**
   * Human-readable city name(s). `null` when the backend join is
   * absent — consumers must fall back to `cityId` in that case.
   */
  cityName: string | null;
  cityNameBn: string | null;
  wardId: string;
  /**
   * Human-readable ward name(s) for the citizen. Resolved by the
   * backend (`getTicketWithTrail`) so the client does not need a
   * second round-trip. `null` when the join is missing or the
   * ward has no display name.
   */
  wardName: string | null;
  wardNameBn: string | null;
  categoryId: string;
  /**
   * Denormalised category display names + slug. `null` when the
   * backend join is absent (older callers) — consumers must fall
   * back to `categoryId` in that case.
   */
  categorySlug: string | null;
  categoryName: string | null;
  categoryNameBn: string | null;
  status: TicketStatus;
  locationLng: number;
  locationLat: number;
  locationLabel: string | null;
  locationLabelBn: string | null;
  note: string | null;
  /**
   * Bolt 007-001: photos are now split into two groups for the citizen
   * branch. `beforePhotoUrls` is the citizen's own photos (the "before"
   * evidence); `afterPhotoUrls` is the crew's photos (the "after"
   * evidence). The After group is hidden when empty. The legacy
   * `photoUrls: string[]` field is the union of the two arrays,
   * preserved for back-compat with internal consumers that have not
   * yet moved to the new fields.
   */
  beforePhotoUrls: string[];
  afterPhotoUrls: string[];
  /**
   * Legacy un-split photo list (Bolt 007-001 back-compat). Source of
   * truth: the union of `beforePhotoUrls` then `afterPhotoUrls`.
   * Empty array when the ticket has no photos.
   */
  photoUrls: string[];
  createdAt: string;
  resolvedAt: string | null;
  /**
   * Why the ticket was closed (`'duplicate'`) and which ticket it
   * duplicates. Staff-only — see the note on `TicketLike`.
   */
  closeReason: string | null;
  duplicateOfId: string | null;
  // Internal-only fields exposed only to non-citizen roles:
  assignedCrewId: string | null;
  internalNote: string | null;
  reporterId: string;
  /**
   * The reporter's display name. Exposed to staff roles only — a
   * dispatcher needs to know WHO filed the report ("Rahim") without
   * having to read a raw `user_citizen_rahim` id. Null when the
   * join is unavailable.
   */
  reporterName: string | null;
  /**
   * The assigned crew member's display name. Staff-only — mirrors
   * `reporterName`: the crew id is backend-specific, so the name
   * has to be resolved by the backend for the surfaces to show
   * "Rashid" on every backend. `null` when no crew is assigned or
   * the join is unavailable.
   */
  assignedCrewName: string | null;
  /**
   * The per-category resolution SLA (Wave 4 / bolt 009-005).
   *
   * Staff-only. A citizen has no work to schedule against a
   * target, so exposing the remaining-time clock to the citizen
   * surface would be noise — and would invite a citizen to read
   * the city's internal service level.
   *
   * `targetHours` is `null` when the ticket's category has no
   * policy, which is a real state (the "Other" category in some
   * cities) and NOT the same as "on time".
   *
   * `remainingHours` is the time LEFT against the target — the
   * number the dispatcher acts on. It is `null` when there is no
   * target, or when the clock has not started (the ticket has not
   * been routed yet).
   */
  slaTargetHours: number | null;
  slaRemainingHours: number | null;
  /**
   * The ISO instant the SLA clock started (when the ticket was
   * routed), and the instant the target expires. `null` when the
   * clock has not started or there is no target.
   */
  slaStartedAt: string | null;
  slaDueAt: string | null;
  /**
   * The resolved SLA TONE.
   *
   * The tone is the server's answer, not the client's: it depends
   * on the warning band (a fraction of the target, so a 168-hour
   * policy warns at a different absolute time than a 48-hour one)
   * and on whether the ticket was resolved against its target.
   *
   * It travels with the row rather than being re-derived in the
   * browser for two reasons. First, a client that re-derives the
   * tone duplicates the warning-band rule, and the two copies
   * drift. Second, the client does not know the target's absolute
   * deadline at the moment of render in the way the server did —
   * a clock read on the client is a different clock read.
   *
   * `null` when there is no target at all. A missing tone means
   * "nothing was promised", which is NOT the same as "on track".
   */
  slaTone: SlaTone | null;
  trail: SerializedTicketTrailEntry[];
}

function splitPhotosForSerializer(
  ticket: TicketLike,
): { before: string[]; after: string[]; union: string[] } {
  const photos = ticket.photos ?? [];
  const { beforePhotoUrls, afterPhotoUrls } = bucketPhotosByRole(photos);
  return {
    before: beforePhotoUrls,
    after: afterPhotoUrls,
    union: [...beforePhotoUrls, ...afterPhotoUrls],
  };
}

export function serializeTicketForRole(
  ticket: TicketLike,
  trail: TrailEntryLike[],
  role: Role,
  language: 'bn' | 'en' = 'bn',
  /**
   * Intent 008 / Bolt 008-002: optional map of actorId → role,
   * used by the dispatcher/crew surfaces to render the trail
   * actor's display name (via lib/identity/display-name.ts). The
   * citizen branch never reads this map (citizens see the
   * anonymised "City corporation" label). When the map is
   * omitted (older callers), `actorRole` falls back to `null`
   * and the page renders the raw id — which is the same UX the
   * old code shipped.
   */
  actorRoles?: Readonly<Record<string, 'citizen' | 'dispatcher' | 'crew' | 'admin'>>,
): SerializedTicket {
  const isCitizen = role === 'citizen';
  const { before, after, union } = splitPhotosForSerializer(ticket);

  // Trail filter: citizen branch rewrites `^[a-z_]+:` marker-shaped notes
  // to the localized "After photo added" string. Non-citizen + public
  // branches pass the trail through unchanged.
  const filteredTrail = isCitizen
    ? applyCitizenTrailFilter(trail, language)
    : trail;

  const serializedTrail: SerializedTicketTrailEntry[] = filteredTrail.map((entry) => ({
    toStatus: entry.toStatus,
    // The staff branch shows the actor's NAME when the backend
    // joined it, and falls back to the raw id when it did not.
    actorLabel: isCitizen
      ? ANONYMIZED_ACTOR_LABEL[language]
      : entry.actorName ?? entry.actorId, // dispatcher/crew/admin see the actor
    actorId: isCitizen ? null : entry.actorId,
    actorName: isCitizen ? null : entry.actorName ?? null,
    actorRole: isCitizen
      ? null
      : actorRoles?.[entry.actorId] ?? null,
    note: entry.note,
    timestamp: typeof entry.timestamp === 'string'
      ? entry.timestamp
      : entry.timestamp.toISOString(),
  }));

  if (isCitizen) {
    return {
      id: ticket.id,
      cityId: ticket.cityId,
      cityName: ticket.cityName ?? null,
      cityNameBn: ticket.cityNameBn ?? null,
      wardId: ticket.wardId,
      wardName: ticket.wardName ?? null,
      wardNameBn: ticket.wardNameBn ?? null,
      categoryId: ticket.categoryId,
      categorySlug: ticket.categorySlug ?? null,
      categoryName: ticket.categoryName ?? null,
      categoryNameBn: ticket.categoryNameBn ?? null,
      status: ticket.status,
      locationLng: ticket.locationLng,
      locationLat: ticket.locationLat,
      locationLabel: ticket.locationLabel,
      locationLabelBn: ticket.locationLabelBn,
      note: ticket.note,
      beforePhotoUrls: before,
      afterPhotoUrls: after,
      photoUrls: union,
      createdAt: typeof ticket.createdAt === 'string'
        ? ticket.createdAt
        : ticket.createdAt.toISOString(),
      resolvedAt: ticket.resolvedAt
        ? (typeof ticket.resolvedAt === 'string'
            ? ticket.resolvedAt
            : ticket.resolvedAt.toISOString())
        : null,
      // Internal fields explicitly nulled out:
      assignedCrewId: null,
      internalNote: null,
      // Workflow state, not PII — but there is no citizen surface
      // for a duplicate closure, so it stays hidden from citizens
      // until that surface exists.
      closeReason: null,
      duplicateOfId: null,
      reporterId: ticket.reporterId, // citizens see their own id (it's them)
      reporterName: null,
      assignedCrewName: null,
      // The SLA clock is staff-only — a citizen has no work to
      // schedule against the city's internal service level.
      slaTargetHours: null,
      slaRemainingHours: null,
      slaStartedAt: null,
      slaDueAt: null,
      slaTone: null,
      trail: serializedTrail,
    };
  }

  // Dispatcher / crew / admin: full visibility. The denormalised ward
  // names are still passed through — internal tools often render them
  // — but the citizen serializer is the primary consumer; this branch
  // does not add new exposure (ward names are not PII).
  return {
    id: ticket.id,
    cityId: ticket.cityId,
    cityName: ticket.cityName ?? null,
    cityNameBn: ticket.cityNameBn ?? null,
    wardId: ticket.wardId,
    wardName: ticket.wardName ?? null,
    wardNameBn: ticket.wardNameBn ?? null,
    categoryId: ticket.categoryId,
    categorySlug: ticket.categorySlug ?? null,
    categoryName: ticket.categoryName ?? null,
    categoryNameBn: ticket.categoryNameBn ?? null,
    status: ticket.status,
    locationLng: ticket.locationLng,
    locationLat: ticket.locationLat,
    locationLabel: ticket.locationLabel,
    locationLabelBn: ticket.locationLabelBn,
    note: ticket.note,
    beforePhotoUrls: before,
    afterPhotoUrls: after,
    photoUrls: union,
    createdAt: typeof ticket.createdAt === 'string'
      ? ticket.createdAt
      : ticket.createdAt.toISOString(),
    resolvedAt: ticket.resolvedAt
      ? (typeof ticket.resolvedAt === 'string'
          ? ticket.resolvedAt
          : ticket.resolvedAt.toISOString())
      : null,
    assignedCrewId: ticket.assignedCrewId,
    internalNote: ticket.internalNote,
    closeReason: ticket.closeReason ?? null,
    duplicateOfId: ticket.duplicateOfId ?? null,
    reporterId: ticket.reporterId,
    reporterName: ticket.reporterName ?? null,
    assignedCrewName: ticket.assignedCrewName ?? null,
    slaTargetHours: ticket.slaTargetHours ?? null,
    slaRemainingHours: ticket.slaRemainingHours ?? null,
    slaStartedAt: ticket.slaStartedAt ?? null,
    slaDueAt: ticket.slaDueAt ?? null,
    slaTone: ticket.slaTone ?? null,
    trail: serializedTrail,
  };
}

/**
 * Public-facing ticket serializer for the anonymous landing page.
 *
 * The v1.1 launch-polish hotfix surfaces a read-only city activity feed
 * for visitors who haven't registered yet. Every internal field is
 * stripped: no `reporterId`, no `internalNote`, no `assignedCrewId`, no
 * trail (the trail reveals dispatcher/crew action notes that are not
 * for public consumption). `locationLabel` is also stripped because it
 * can carry the citizen's home/work address; the ward is enough public
 * granularity.
 *
 * Shape is intentionally narrower than `SerializedTicket` so an
 * accidental leak cannot happen at a route boundary: a public
 * serializer with fewer fields is safer than a citizen serializer
 * with the wrong role.
 *
 * Bolt 007-001: the public branch exposes `beforePhotoUrls` and
 * `afterPhotoUrls` (the split view) for consistency with the citizen
 * branch. The trail is still dropped entirely (the public surface has
 * no progress visibility — only the city activity feed summary).
 */
export interface PublicSerializedTicket {
  id: string;
  cityId: string;
  wardId: string;
  /**
   * Human-readable ward name (Bolt 008-011). The public surface
   * shows a "Ward 14 — Mirpur" pill instead of the raw wardId so
   * the activity feed reads as a public city bulletin, not a DB
   * dump. Ward names are not PII (they're the city's own
   * public-facing boundary labels); `locationLabel` is still
   * stripped because that one can carry a street address.
   */
  wardName: string | null;
  wardNameBn: string | null;
  categoryId: string;
  /**
   * Human-readable category name(s) for the public feed card.
   *
   * The public card previously rendered only a status pill, a free
   * text note and a ward — so a citizen browsing the landing page
   * could not tell WHAT kind of problem a report was about ("Broken
   * streetlight" vs "Drainage blocked"). The category is public city
   * configuration (the same list the city's own taxonomy page shows),
   * so exposing the name leaks nothing.
   *
   * Populated by `getTicketWithTrail`; `null` when the join is
   * absent, and consumers must fall back to `categoryId`.
   */
  categorySlug: string | null;
  categoryName: string | null;
  categoryNameBn: string | null;
  status: TicketStatus;
  locationLng: number;
  locationLat: number;
  note: string | null;
  beforePhotoUrls: string[];
  afterPhotoUrls: string[];
  photoUrls: string[];
  createdAt: string;
}

export function serializeTicketForPublic(
  ticket: TicketLike,
): PublicSerializedTicket {
  const { before, after, union } = splitPhotosForSerializer(ticket);
  return {
    id: ticket.id,
    cityId: ticket.cityId,
    wardId: ticket.wardId,
    wardName: ticket.wardName ?? null,
    wardNameBn: ticket.wardNameBn ?? null,
    categoryId: ticket.categoryId,
    categorySlug: ticket.categorySlug ?? null,
    categoryName: ticket.categoryName ?? null,
    categoryNameBn: ticket.categoryNameBn ?? null,
    status: ticket.status,
    locationLng: ticket.locationLng,
    locationLat: ticket.locationLat,
    note: ticket.note,
    beforePhotoUrls: before,
    afterPhotoUrls: after,
    photoUrls: union,
    createdAt: typeof ticket.createdAt === 'string'
      ? ticket.createdAt
      : ticket.createdAt.toISOString(),
  };
}
