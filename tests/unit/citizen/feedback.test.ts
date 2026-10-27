/**
 * Unit tests for the citizen feedback service
 * (lib/citizen/feedback.ts).
 *
 * WO-002 — the write path for `Ticket.feedback`.
 *
 * Before this module existed the column was READ by the admin
 * adoption funnel ("Provided feedback" stage) and by the
 * dispatcher crew table (`feedbackRatio`), but never WRITTEN — the
 * citizen detail page only flipped a local React state flag. The
 * funnel stage therefore always read 0 and the crew table always
 * rendered "not enough data".
 *
 * These tests pin:
 *   - the pure helpers (rating vocabulary, serialisation, parsing);
 *   - the write path's rules (ownership, resolved-state,
 *     idempotency, over-write-on-change, audit row);
 *   - the per-crew aggregate the dispatcher crew table reads.
 *
 * The DB-facing parts run against the REAL in-memory dev store
 * (no mocks) — the same approach as
 * `tests/unit/dispatcher/monitor.test.ts` — so the facade wiring
 * (`lib/db-switch.ts` → `lib/dev-store.ts`) is covered too.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEV_CITIZEN_ID,
  DEV_CITY_ID,
  DEV_WARD_ID,
  getStore,
  resetStore,
} from '@/lib/dev-store';
import {
  FEEDBACK_AUDIT_ACTION,
  FEEDBACK_RATINGS,
  aggregateCrewFeedback,
  isFeedbackRating,
  readFeedbackRating,
  serializeFeedback,
  submitTicketFeedback,
} from '@/lib/citizen/feedback';
import { listCityTickets } from '@/lib/admin/users-db';
import { getPerformanceSnapshot } from '@/lib/dispatcher/performance';
import type { SessionContext } from '@/lib/auth/session';

beforeEach(() => {
  resetStore();
});

/** A citizen session over the seeded city + ward. */
const CITIZEN_SESSION: SessionContext = {
  sessionId: 'session_test_citizen',
  userId: DEV_CITIZEN_ID,
  cityId: DEV_CITY_ID,
  wardId: DEV_WARD_ID,
  departmentId: null,
  role: 'citizen',
};

/** A dispatcher session (used to prove the service rejects it). */
const DISPATCHER_SESSION: SessionContext = {
  sessionId: 'session_test_dispatcher',
  userId: 'user_dispatcher_habib',
  cityId: DEV_CITY_ID,
  wardId: DEV_WARD_ID,
  departmentId: null,
  role: 'dispatcher',
};

/** The seeded resolved ticket — the one the citizen can rate. */
const RESOLVED_TICKET_ID = 'ticket_seed_resolved_1';

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

describe('isFeedbackRating', () => {
  it('accepts each of the three canonical ratings', () => {
    for (const r of FEEDBACK_RATINGS) {
      expect(isFeedbackRating(r)).toBe(true);
    }
    expect([...FEEDBACK_RATINGS]).toEqual([
      'positive',
      'negative',
      'neutral',
    ]);
  });

  it('rejects anything else', () => {
    expect(isFeedbackRating('POSITIVE')).toBe(false);
    expect(isFeedbackRating('satisfied')).toBe(false);
    expect(isFeedbackRating('')).toBe(false);
    expect(isFeedbackRating(null)).toBe(false);
    expect(isFeedbackRating(undefined)).toBe(false);
    expect(isFeedbackRating(42)).toBe(false);
  });
});

describe('readFeedbackRating', () => {
  it('reads the rating out of a persisted document', () => {
    expect(readFeedbackRating('{"rating":"positive"}')).toBe('positive');
    expect(
      readFeedbackRating('{"rating":"negative","comment":"still broken"}'),
    ).toBe('negative');
  });

  it('returns null for a missing / blank value', () => {
    expect(readFeedbackRating(null)).toBeNull();
    expect(readFeedbackRating(undefined)).toBeNull();
    expect(readFeedbackRating('')).toBeNull();
    expect(readFeedbackRating('   ')).toBeNull();
  });

  it('returns null for a value that is not a JSON document', () => {
    expect(readFeedbackRating('satisfied')).toBeNull();
    expect(readFeedbackRating('{"rating":')).toBeNull();
  });

  it('returns null for a JSON document without a canonical rating', () => {
    expect(readFeedbackRating('{"comment":"nice"}')).toBeNull();
    expect(readFeedbackRating('{"rating":"happy"}')).toBeNull();
    expect(readFeedbackRating('"positive"')).toBeNull();
    expect(readFeedbackRating('null')).toBeNull();
    expect(readFeedbackRating('42')).toBeNull();
  });
});

describe('serializeFeedback', () => {
  it('writes a rating-only document when there is no comment', () => {
    expect(serializeFeedback({ rating: 'positive' })).toBe(
      '{"rating":"positive"}',
    );
  });

  it('writes the comment when one is supplied', () => {
    expect(
      serializeFeedback({ rating: 'negative', comment: 'not fixed yet' }),
    ).toBe('{"rating":"negative","comment":"not fixed yet"}');
  });

  it('trims the comment and drops a blank one', () => {
    expect(
      serializeFeedback({ rating: 'positive', comment: '  nice  ' }),
    ).toBe('{"rating":"positive","comment":"nice"}');
    expect(
      serializeFeedback({ rating: 'positive', comment: '   ' }),
    ).toBe('{"rating":"positive"}');
  });

  it('round-trips through readFeedbackRating', () => {
    for (const rating of FEEDBACK_RATINGS) {
      const stored = serializeFeedback({ rating, comment: 'hello' });
      expect(readFeedbackRating(stored)).toBe(rating);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The write path                                                      */
/* ------------------------------------------------------------------ */

describe('submitTicketFeedback', () => {
  it('persists a positive rating on the citizen own resolved ticket', async () => {
    const result = await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'positive' },
      CITIZEN_SESSION,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rating).toBe('positive');
    expect(result.value.changed).toBe(true);
    expect(result.value.stored).toBe('{"rating":"positive"}');

    const row = getStore().tickets.get(RESOLVED_TICKET_ID);
    expect(row?.feedback).toBe('{"rating":"positive"}');
    expect(readFeedbackRating(row?.feedback)).toBe('positive');
  });

  it('persists a negative rating with a comment', async () => {
    const result = await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'negative', comment: 'the drain is still blocked' },
      CITIZEN_SESSION,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stored).toContain('"rating":"negative"');
    expect(result.value.stored).toContain('the drain is still blocked');
  });

  it('writes an audit row for the submission', async () => {
    await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'positive' },
      CITIZEN_SESSION,
    );

    const entries = getStore().audit.filter(
      (a) => a.action === FEEDBACK_AUDIT_ACTION,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].entityType).toBe('ticket');
    expect(entries[0].entityId).toBe(RESOLVED_TICKET_ID);
    expect(entries[0].actorId).toBe(DEV_CITIZEN_ID);
    expect(entries[0].beforeValue?.feedback ?? null).toBeNull();
    expect(entries[0].afterValue?.rating).toBe('positive');
  });

  it('is idempotent when the same rating is re-submitted', async () => {
    const first = await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'positive' },
      CITIZEN_SESSION,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.changed).toBe(true);

    const second = await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'positive' },
      CITIZEN_SESSION,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.changed).toBe(false);

    // A no-op does NOT write a second audit row.
    const entries = getStore().audit.filter(
      (a) => a.action === FEEDBACK_AUDIT_ACTION,
    );
    expect(entries).toHaveLength(1);
  });

  it('allows a citizen to change their rating', async () => {
    await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'positive' },
      CITIZEN_SESSION,
    );
    const second = await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'negative' },
      CITIZEN_SESSION,
    );

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.changed).toBe(true);
    expect(second.value.rating).toBe('negative');

    const row = getStore().tickets.get(RESOLVED_TICKET_ID);
    expect(readFeedbackRating(row?.feedback)).toBe('negative');

    // The change is audited with the before/after pair.
    const entries = getStore().audit.filter(
      (a) => a.action === FEEDBACK_AUDIT_ACTION,
    );
    expect(entries).toHaveLength(2);
    expect(entries[1].beforeValue?.feedback).toBe('{"rating":"positive"}');
    expect(entries[1].afterValue?.rating).toBe('negative');
  });

  it('rejects a ticket that does not exist', async () => {
    const result = await submitTicketFeedback(
      'ticket_does_not_exist',
      { rating: 'positive' },
      CITIZEN_SESSION,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_found');
  });

  it('rejects a ticket owned by a different citizen', async () => {
    // Plant a ticket owned by somebody else.
    const store = getStore();
    const now = new Date().toISOString();
    store.tickets.set('ticket_other_owner', {
      id: 'ticket_other_owner',
      cityId: DEV_CITY_ID,
      wardId: DEV_WARD_ID,
      categoryId: 'cat_other',
      reporterId: 'user_citizen_someone_else',
      assignedCrewId: 'user_crew_rashid',
      status: 'resolved',
      locationLng: 90.4,
      locationLat: 23.8,
      locationLabel: 'Somewhere',
      locationLabelBn: 'কোথাও',
      note: 'Not yours.',
      internalNote: null,
      feedback: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: now,
    });

    const result = await submitTicketFeedback(
      'ticket_other_owner',
      { rating: 'positive' },
      CITIZEN_SESSION,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_owner');
  });

  it('rejects a ticket that is not resolved yet', async () => {
    // The seeded in-progress ticket has not been resolved.
    const result = await submitTicketFeedback(
      'ticket_seed_inprogress_1',
      { rating: 'positive' },
      CITIZEN_SESSION,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ticket_not_resolved');
  });

  it('rejects a non-citizen session', async () => {
    const result = await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'positive' },
      DISPATCHER_SESSION,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_owner');
  });

  it('accepts a closed ticket as well as a resolved one', async () => {
    const result = await submitTicketFeedback(
      'ticket_seed_closed_1',
      { rating: 'positive' },
      CITIZEN_SESSION,
    );
    expect(result.ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The per-crew aggregate                                              */
/* ------------------------------------------------------------------ */

describe('aggregateCrewFeedback', () => {
  it('returns an empty list for no tickets', () => {
    expect(aggregateCrewFeedback([])).toEqual([]);
  });

  it('counts positive and negative feedback per crew', () => {
    const rows = aggregateCrewFeedback([
      { id: 't1', assignedCrewId: 'crew_a', feedback: '{"rating":"positive"}' },
      { id: 't2', assignedCrewId: 'crew_a', feedback: '{"rating":"positive"}' },
      { id: 't3', assignedCrewId: 'crew_a', feedback: '{"rating":"negative"}' },
      { id: 't4', assignedCrewId: 'crew_b', feedback: '{"rating":"negative"}' },
    ]);
    expect(rows).toEqual([
      { crewId: 'crew_a', positive: 2, negative: 1 },
      { crewId: 'crew_b', positive: 0, negative: 1 },
    ]);
  });

  it('ignores tickets with no assigned crew', () => {
    const rows = aggregateCrewFeedback([
      { id: 't1', assignedCrewId: null, feedback: '{"rating":"positive"}' },
    ]);
    expect(rows).toEqual([]);
  });

  it('ignores neutral feedback (it is neither positive nor negative)', () => {
    const rows = aggregateCrewFeedback([
      { id: 't1', assignedCrewId: 'crew_a', feedback: '{"rating":"neutral"}' },
      { id: 't2', assignedCrewId: 'crew_a', feedback: '{"rating":"positive"}' },
    ]);
    expect(rows).toEqual([{ crewId: 'crew_a', positive: 1, negative: 0 }]);
  });

  it('ignores tickets with no feedback or an unparseable value', () => {
    const rows = aggregateCrewFeedback([
      { id: 't1', assignedCrewId: 'crew_a', feedback: null },
      { id: 't2', assignedCrewId: 'crew_a', feedback: undefined },
      { id: 't3', assignedCrewId: 'crew_a', feedback: '   ' },
      { id: 't4', assignedCrewId: 'crew_a', feedback: 'satisfied' },
      { id: 't5', assignedCrewId: 'crew_a', feedback: '{"rating":"bogus"}' },
    ]);
    expect(rows).toEqual([]);
  });

  it('reads the rating out of a document that also carries a comment', () => {
    const rows = aggregateCrewFeedback([
      {
        id: 't1',
        assignedCrewId: 'crew_a',
        feedback: '{"rating":"negative","comment":"not fixed"}',
      },
    ]);
    expect(rows).toEqual([{ crewId: 'crew_a', positive: 0, negative: 1 }]);
  });
});

/* ------------------------------------------------------------------ */
/* The end-to-end loop                                                 */
/* ------------------------------------------------------------------ */

describe('the citizen feedback loop', () => {
  it('makes the admin funnel AND the dispatcher crew table read the same value', async () => {
    // 1. The citizen rates their own resolved ticket.
    const written = await submitTicketFeedback(
      RESOLVED_TICKET_ID,
      { rating: 'positive' },
      CITIZEN_SESSION,
    );
    expect(written.ok).toBe(true);

    // 2. The admin adoption funnel counts tickets with a non-empty
    //    `feedback` column. It reads the column through
    //    `listCityTickets` (lib/admin/users-db.ts).
    const rows = await listCityTickets(DEV_CITY_ID);
    const rated = rows.filter((t) => (t.feedback ?? '').trim() !== '');
    expect(rated.map((t) => t.id)).toContain(RESOLVED_TICKET_ID);
    // The column carries the JSON document the service wrote.
    expect(
      readFeedbackRating(rated.find((t) => t.id === RESOLVED_TICKET_ID)?.feedback),
    ).toBe('positive');

    // 3. The dispatcher crew table derives its positive / negative
    //    tally from the SAME column, so the two surfaces agree.
    const crewId = getStore().tickets.get(RESOLVED_TICKET_ID)!.assignedCrewId!;
    const snapshot = await getPerformanceSnapshot(DISPATCHER_SESSION, {
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-20T00:00:00.000Z',
    });
    const crewRow = snapshot.crewTable.find((c) => c.crewId === crewId);
    expect(crewRow).toBeDefined();
    expect(crewRow!.positiveFeedback).toBe(1);
    expect(crewRow!.negativeFeedback).toBe(0);
  });

  it('leaves the admin funnel at zero when no citizen has rated', async () => {
    const rows = await listCityTickets(DEV_CITY_ID);
    const rated = rows.filter((t) => (t.feedback ?? '').trim() !== '');
    expect(rated).toHaveLength(0);
  });
});
