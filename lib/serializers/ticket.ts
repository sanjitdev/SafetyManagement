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
 */

import type { Ticket, TicketTrailEntry, Prisma } from '@prisma/client';
import type { Role } from '@prisma/client';

const ANONYMIZED_ACTOR_LABEL = {
  bn: 'সিটি কর্পোরেসন',
  en: 'City corporation',
} as const;

/**
 * The set of fields visible to citizens. Anything not in this list is
 * hidden from citizen serializers (PLAT-REQ-001).
 */
const CITIZEN_VISIBLE_FIELDS = [
  'id',
  'cityId',
  'wardId',
  'categoryId',
  'status',
  'locationLng',
  'locationLat',
  'locationLabel',
  'locationLabelBn',
  'note',
  // Photo URLs: only "before" photos (the citizen's own) are visible to
  // citizens; "after" photos (Rashid's proof) are hidden until resolved
  // and even then only on the 1.4 detail page via the public bucket.
  // The API layer filters them separately.
  'photoUrls',
  'createdAt',
  'resolvedAt',
] as const satisfies readonly (keyof Ticket)[];

const INTERNAL_HIDDEN_FROM_CITIZEN = [
  'assignedCrewId',
  'internalNote',
  'reporterId',
] as const satisfies readonly (keyof Ticket)[];

export interface SerializedTicketTrailEntry {
  toStatus: TicketTrailEntry['toStatus'];
  /** Anonymized for citizens; real actor for dispatcher/crew/admin. */
  actorLabel: string;
  note: string | null;
  timestamp: Date;
}

export interface SerializedTicket {
  id: string;
  cityId: string;
  wardId: string;
  categoryId: string;
  status: Ticket['status'];
  locationLng: number;
  locationLat: number;
  locationLabel: string | null;
  locationLabelBn: string | null;
  note: string | null;
  photoUrls: string[];
  createdAt: Date;
  resolvedAt: Date | null;
  // Internal-only fields exposed only to non-citizen roles:
  assignedCrewId: string | null;
  internalNote: string | null;
  reporterId: string;
  trail: SerializedTicketTrailEntry[];
}

export function serializeTicketForRole(
  ticket: Ticket & { trail: TicketTrailEntry[] },
  role: Role,
  language: 'bn' | 'en' = 'bn',
): SerializedTicket {
  const isCitizen = role === 'citizen';
  const trail: SerializedTicketTrailEntry[] = ticket.trail.map((entry) => ({
    toStatus: entry.toStatus,
    actorLabel: isCitizen
      ? ANONYMIZED_ACTOR_LABEL[language]
      : entry.actorId, // dispatcher/crew/admin see the real actor id
    note: entry.note,
    timestamp: entry.timestamp,
  }));

  if (isCitizen) {
    return {
      // Pick only citizen-visible fields; omit the rest.
      ...Object.fromEntries(
        CITIZEN_VISIBLE_FIELDS.map((k) => [k, ticket[k]]),
      ),
      // Internal fields explicitly nulled out:
      assignedCrewId: null,
      internalNote: null,
      reporterId: ticket!.reporterId, // citizens see their own id (it's them)
      trail,
    } as SerializedTicket;
  }

  // Dispatcher / crew / admin: full visibility.
  return {
    ...ticket,
    trail,
  };
}

/**
 * Use this when querying a ticket by id for serialization — drops in the
 * trail with actors included.
 */
export const ticketInclude = {
  trail: {
    orderBy: { timestamp: 'asc' as const },
  },
} satisfies Prisma.TicketInclude;