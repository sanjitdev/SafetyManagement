/**
 * Unit tests for the citizen-facing ticket serializer
 * (lib/serializers/ticket.ts).
 *
 * Validates PLAT-REQ-001 acceptance: internal-only fields (assignedCrewId,
 * internalNote) hidden from citizen queries. Validates PLAT-REQ-005: the
 * actor on each trail entry is anonymized for citizens.
 *
 * The serializer is a pure function — no DB, no Next runtime.
 */

import { describe, expect, it } from 'vitest';
import {
  serializeTicketForRole,
  serializeTicketForPublic,
  type TicketLike,
  type TrailEntryLike,
} from '@/lib/serializers/ticket';

const baseTicket: TicketLike = {
  id: 'tkt_123',
  cityId: 'city_dhaka_north',
  wardId: 'ward_14',
  categoryId: 'cat_streetlight',
  status: 'in_progress',
  locationLng: 90.4075,
  locationLat: 23.789,
  locationLabel: 'Mirpur, Dhaka',
  locationLabelBn: 'মিরপুর, ঢাকা',
  note: 'Light out near pole #14B',
  // Bolt 007-001: photos are now an array of {id, url, uploadedByRole, uploadedAt}
  // rows; the serializer partitions this into before/after. Legacy
  // `photoUrls: string[]` is gone.
  photos: [
    {
      id: 'tph_test_1',
      url: 'data:image/jpeg;base64,AAAA',
      uploadedByRole: 'citizen',
      uploadedAt: '2026-10-01T09:59:00.000Z',
    },
  ],
  createdAt: new Date('2026-10-01T10:00:00Z'),
  resolvedAt: null,
  assignedCrewId: 'crew_a',
  internalNote: 'PRIVATE: needs bucket truck',
  reporterId: 'user_citizen_rahim',
  // Backend-joined ward names; the citizen detail page renders these
  // instead of the raw cuid so the citizen sees a real label.
  wardName: 'Mirpur',
  wardNameBn: 'মিরপুর',
};

const trail: TrailEntryLike[] = [
  {
    toStatus: 'submitted',
    actorId: 'user_citizen_rahim',
    note: null,
    timestamp: new Date('2026-10-01T10:00:00Z'),
  },
  {
    toStatus: 'routed',
    actorId: 'user_dispatcher_habib',
    note: 'routed to electrical dept',
    timestamp: new Date('2026-10-01T11:00:00Z'),
  },
  {
    toStatus: 'in_progress',
    actorId: 'user_crew_rashid',
    note: null,
    timestamp: new Date('2026-10-02T08:30:00Z'),
  },
];

describe('serializeTicketForRole — citizen view', () => {
  const out = serializeTicketForRole(baseTicket, trail, 'citizen', 'bn');

  it('strips internal fields (PLAT-REQ-001)', () => {
    expect(out.assignedCrewId).toBeNull();
    expect(out.internalNote).toBeNull();
  });

  it('keeps the citizen-facing fields the citizen needs', () => {
    expect(out.id).toBe('tkt_123');
    expect(out.status).toBe('in_progress');
    // Bolt 007-001: the legacy `photoUrls` is the union of the new
    // before/after arrays. The test fixture has 1 citizen photo, so
    // before has 1 and after is empty.
    expect(out.photoUrls).toEqual(['data:image/jpeg;base64,AAAA']);
    expect(out.beforePhotoUrls).toEqual(['data:image/jpeg;base64,AAAA']);
    expect(out.afterPhotoUrls).toEqual([]);
    expect(out.note).toBe('Light out near pole #14B');
    expect(out.locationLabelBn).toBe('মিরপুর, ঢাকা');
  });

  it('anonymizes the actor label on each trail entry (PLAT-REQ-005)', () => {
    expect(out.trail).toHaveLength(3);
    for (const entry of out.trail) {
      expect(entry.actorLabel).toBe('সিটি কর্পোরেশন');
    }
  });

  it('serializes timestamps as ISO strings, not Date objects', () => {
    expect(typeof out.createdAt).toBe('string');
    expect(typeof out.trail[0].timestamp).toBe('string');
    expect(out.createdAt).toBe('2026-10-01T10:00:00.000Z');
  });

  it('preserves the trail note for the citizen', () => {
    expect(out.trail[1].note).toBe('routed to electrical dept');
  });

  it('surfaces the joined ward name (en) + ward name (bn) on the citizen payload', () => {
    // The detail page renders these directly; without the join, the
    // citizen would see a raw cuid like "ওয়ার্ড cmv53x..." — this
    // regression is the test's reason for existing.
    expect(out.wardName).toBe('Mirpur');
    expect(out.wardNameBn).toBe('মিরপুর');
  });
});

describe('serializeTicketForRole — citizen view, missing ward join', () => {
  it('falls back to null when the backend did not include the ward name', () => {
    // Older call sites (e.g. the dispatcher activity feed) do not pass
    // wardName; the citizen payload must not blow up — it should
    // surface `null` so the detail page can render its own fallback.
    const t: TicketLike = { ...baseTicket };
    delete t.wardName;
    delete t.wardNameBn;
    const out = serializeTicketForRole(t, trail, 'citizen', 'bn');
    expect(out.wardName).toBeNull();
    expect(out.wardNameBn).toBeNull();
  });
});

describe('serializeTicketForRole — dispatcher view', () => {
  const out = serializeTicketForRole(baseTicket, trail, 'dispatcher', 'bn');

  it('exposes internal fields to dispatcher', () => {
    expect(out.assignedCrewId).toBe('crew_a');
    expect(out.internalNote).toBe('PRIVATE: needs bucket truck');
  });

  it('shows the real actor id on trail entries (not anonymized)', () => {
    expect(out.trail[0].actorLabel).toBe('user_citizen_rahim');
    expect(out.trail[1].actorLabel).toBe('user_dispatcher_habib');
    expect(out.trail[2].actorLabel).toBe('user_crew_rashid');
  });

  it('does NOT filter the after_photo marker note (dispatcher sees the raw note)', () => {
    // Build a trail that includes the marker note the citizen filter
    // would rewrite. The dispatcher view must pass it through.
    const tr: TrailEntryLike[] = [
      ...trail,
      {
        toStatus: 'resolved',
        actorId: 'user_crew_rashid',
        note: 'after_photo:data:image/jpeg;base64,DEAD',
        timestamp: '2026-10-04T09:00:00.000Z',
      },
    ];
    const out2 = serializeTicketForRole(baseTicket, tr, 'dispatcher', 'bn');
    expect(out2.trail[3].note).toBe('after_photo:data:image/jpeg;base64,DEAD');
  });

  it('exposes the before/after photo split to dispatcher', () => {
    expect(out.beforePhotoUrls).toEqual(['data:image/jpeg;base64,AAAA']);
    expect(out.afterPhotoUrls).toEqual([]);
    // Legacy union is also kept so any dispatcher UI that hasn't
    // migrated still gets a flat list.
    expect(out.photoUrls).toEqual(['data:image/jpeg;base64,AAAA']);
  });
});

describe('serializeTicketForRole — string-input compatibility', () => {
  it('accepts ISO string timestamps (dev-store shape) as well as Date', () => {
    const t: TicketLike = {
      ...baseTicket,
      createdAt: '2026-10-01T10:00:00.000Z',
    };
    const tr: TrailEntryLike[] = trail.map((e) => ({
      ...e,
      timestamp:
        typeof e.timestamp === 'string'
          ? e.timestamp
          : e.timestamp.toISOString(),
    }));
    const out = serializeTicketForRole(t, tr, 'citizen', 'bn');
    expect(out.createdAt).toBe('2026-10-01T10:00:00.000Z');
    expect(out.trail[1].timestamp).toBe('2026-10-01T11:00:00.000Z');
  });

  it('handles a resolved ticket (resolvedAt as ISO string)', () => {
    const t: TicketLike = {
      ...baseTicket,
      status: 'resolved',
      resolvedAt: '2026-10-04T09:00:00.000Z',
    };
    const out = serializeTicketForRole(t, trail, 'citizen', 'bn');
    expect(out.status).toBe('resolved');
    expect(out.resolvedAt).toBe('2026-10-04T09:00:00.000Z');
  });
});

describe('serializeTicketForRole — empty photos (citizen view)', () => {
  it('returns two empty arrays when the ticket has no photos', () => {
    const t: TicketLike = { ...baseTicket, photos: [] };
    const out = serializeTicketForRole(t, trail, 'citizen', 'bn');
    expect(out.photoUrls).toEqual([]);
    expect(out.beforePhotoUrls).toEqual([]);
    expect(out.afterPhotoUrls).toEqual([]);
  });

  it('handles undefined photos gracefully (defensive)', () => {
    const t: TicketLike = { ...baseTicket };
    delete t.photos;
    const out = serializeTicketForRole(t, trail, 'citizen', 'bn');
    expect(out.photoUrls).toEqual([]);
    expect(out.beforePhotoUrls).toEqual([]);
    expect(out.afterPhotoUrls).toEqual([]);
  });
});

describe('serializeTicketForPublic — v1.1 anonymous landing', () => {
  it('strips every internal / PII field', () => {
    const out = serializeTicketForPublic(baseTicket);
    // Required surface fields are kept:
    expect(out.id).toBe('tkt_123');
    expect(out.cityId).toBe('city_dhaka_north');
    expect(out.wardId).toBe('ward_14');
    expect(out.categoryId).toBe('cat_streetlight');
    expect(out.status).toBe('in_progress');
    expect(out.locationLng).toBe(90.4075);
    expect(out.locationLat).toBe(23.789);
    expect(out.note).toBe('Light out near pole #14B');
    expect(out.photoUrls).toEqual(['data:image/jpeg;base64,AAAA']);
    // Bolt 007-001: the public surface also exposes the new
    // before/after split so the public feed can render either the
    // un-split or the split view.
    expect(out.beforePhotoUrls).toEqual(['data:image/jpeg;base64,AAAA']);
    expect(out.afterPhotoUrls).toEqual([]);
    // Internal fields are NOT in the public type at all — this is
    // a compile-time guarantee; we can also confirm the runtime
    // values aren't present by checking that the keys are absent
    // from a JSON round-trip:
    const json = JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
    expect(json.reporterId).toBeUndefined();
    expect(json.internalNote).toBeUndefined();
    expect(json.assignedCrewId).toBeUndefined();
    expect(json.trail).toBeUndefined();
    expect(json.locationLabel).toBeUndefined();
    expect(json.locationLabelBn).toBeUndefined();
    expect(json.resolvedAt).toBeUndefined();
  });

  it('serializes ISO-string timestamps the same way as Date', () => {
    const t: TicketLike = {
      ...baseTicket,
      createdAt: '2026-10-01T10:00:00.000Z',
    };
    const out = serializeTicketForPublic(t);
    expect(out.createdAt).toBe('2026-10-01T10:00:00.000Z');
  });

  it('exposes the before/after split on the public surface', () => {
    const t: TicketLike = {
      ...baseTicket,
      photos: [
        { id: 'tph_1', url: 'a', uploadedByRole: 'citizen', uploadedAt: '2026-10-01T09:59:00.000Z' },
        { id: 'tph_2', url: 'b', uploadedByRole: 'crew', uploadedAt: '2026-10-02T08:30:00.000Z' },
      ],
    };
    const out = serializeTicketForPublic(t);
    expect(out.beforePhotoUrls).toEqual(['a']);
    expect(out.afterPhotoUrls).toEqual(['b']);
    expect(out.photoUrls).toEqual(['a', 'b']);
  });
});