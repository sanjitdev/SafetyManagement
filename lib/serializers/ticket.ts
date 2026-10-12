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
 */

import type { Role, TicketStatus } from '@prisma/client';

const ANONYMIZED_ACTOR_LABEL = {
  bn: 'সিটি কর্পোরেশন',
  en: 'City corporation',
} as const;

export interface TrailEntryLike {
  toStatus: TicketStatus;
  actorId: string;
  note: string | null;
  timestamp: Date | string;
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
  photoUrls: string[];
  createdAt: Date | string;
  resolvedAt: Date | string | null;
  assignedCrewId: string | null;
  internalNote: string | null;
  reporterId: string;
}

export interface SerializedTicketTrailEntry {
  toStatus: TicketStatus;
  /** Anonymized for citizens; real actor for dispatcher/crew/admin. */
  actorLabel: string;
  note: string | null;
  timestamp: string;
}

export interface SerializedTicket {
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
  photoUrls: string[];
  createdAt: string;
  resolvedAt: string | null;
  // Internal-only fields exposed only to non-citizen roles:
  assignedCrewId: string | null;
  internalNote: string | null;
  reporterId: string;
  trail: SerializedTicketTrailEntry[];
}

export function serializeTicketForRole(
  ticket: TicketLike,
  trail: TrailEntryLike[],
  role: Role,
  language: 'bn' | 'en' = 'bn',
): SerializedTicket {
  const isCitizen = role === 'citizen';
  const serializedTrail: SerializedTicketTrailEntry[] = trail.map((entry) => ({
    toStatus: entry.toStatus,
    actorLabel: isCitizen
      ? ANONYMIZED_ACTOR_LABEL[language]
      : entry.actorId, // dispatcher/crew/admin see the real actor id
    note: entry.note,
    timestamp: typeof entry.timestamp === 'string'
      ? entry.timestamp
      : entry.timestamp.toISOString(),
  }));

  if (isCitizen) {
    return {
      id: ticket.id,
      cityId: ticket.cityId,
      wardId: ticket.wardId,
      categoryId: ticket.categoryId,
      status: ticket.status,
      locationLng: ticket.locationLng,
      locationLat: ticket.locationLat,
      locationLabel: ticket.locationLabel,
      locationLabelBn: ticket.locationLabelBn,
      note: ticket.note,
      photoUrls: ticket.photoUrls,
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
      reporterId: ticket.reporterId, // citizens see their own id (it's them)
      trail: serializedTrail,
    };
  }

  // Dispatcher / crew / admin: full visibility.
  return {
    id: ticket.id,
    cityId: ticket.cityId,
    wardId: ticket.wardId,
    categoryId: ticket.categoryId,
    status: ticket.status,
    locationLng: ticket.locationLng,
    locationLat: ticket.locationLat,
    locationLabel: ticket.locationLabel,
    locationLabelBn: ticket.locationLabelBn,
    note: ticket.note,
    photoUrls: ticket.photoUrls,
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
    reporterId: ticket.reporterId,
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
 */
export interface PublicSerializedTicket {
  id: string;
  cityId: string;
  wardId: string;
  categoryId: string;
  status: TicketStatus;
  locationLng: number;
  locationLat: number;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
}

export function serializeTicketForPublic(
  ticket: TicketLike,
): PublicSerializedTicket {
  return {
    id: ticket.id,
    cityId: ticket.cityId,
    wardId: ticket.wardId,
    categoryId: ticket.categoryId,
    status: ticket.status,
    locationLng: ticket.locationLng,
    locationLat: ticket.locationLat,
    note: ticket.note,
    photoUrls: ticket.photoUrls,
    createdAt: typeof ticket.createdAt === 'string'
      ? ticket.createdAt
      : ticket.createdAt.toISOString(),
  };
}
