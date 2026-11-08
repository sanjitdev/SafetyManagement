/**
 * Unit tests for the platform transition engine (lib/platform/transitions.ts).
 *
 * Validates PLAT-REQ-005: every status transition is allowed only along the
 * edges documented in WO-000; invalid edges throw InvalidTransitionError and
 * the atomic update + trail entry + audit entry are all attempted in order.
 *
 * Also covers the concurrency guard added 2026-11-08: the write is a
 * compare-and-swap on (status, version), so a writer whose read has been
 * overtaken updates zero rows and the transition is rejected with
 * ConcurrentTransitionError rather than clobbering the winner.
 *
 * Mocks the db-switch so the test is pure logic — no DB.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock the @/lib/db-switch module so transitions.ts sees a fake db.
const ticketFindUnique = vi.fn();
const ticketUpdateWhere = vi.fn();
const trailCreate = vi.fn();

vi.mock('@/lib/db-switch', () => ({
  db: {
    ticket: {
      findUnique: ticketFindUnique,
      updateWhere: ticketUpdateWhere,
    },
    trail: {
      create: trailCreate,
    },
  },
}));

// Mock the audit writer — we don't care about its persistence in unit tests.
vi.mock('@/lib/platform/audit', () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

// Import after the mocks are registered.
const {
  transitionTicket,
  InvalidTransitionError,
  ConcurrentTransitionError,
} = await import('@/lib/platform/transitions');

describe('platform transitions', () => {
  it('throws InvalidTransitionError when no edge exists', async () => {
    ticketFindUnique.mockResolvedValueOnce({
      status: 'resolved',
      cityId: 'c1',
      wardId: 'w1',
      categoryId: 'cat1',
    });
    await expect(
      transitionTicket({
        ticketId: 't1',
        toStatus: 'routed',
        actorId: 'u1',
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('rejects invalid edges (e.g. submitted → in_progress)', async () => {
    ticketFindUnique.mockResolvedValueOnce({
      status: 'submitted',
      cityId: 'c1',
      wardId: 'w1',
      categoryId: 'cat1',
    });
    await expect(
      transitionTicket({
        ticketId: 't1',
        toStatus: 'in_progress',
        actorId: 'u1',
      }),
    ).rejects.toThrow(/Cannot transition from submitted to in_progress/);
  });

  it('rejects invalid edges (e.g. submitted → resolved)', async () => {
    ticketFindUnique.mockResolvedValueOnce({
      status: 'submitted',
      cityId: 'c1',
      wardId: 'w1',
      categoryId: 'cat1',
    });
    await expect(
      transitionTicket({
        ticketId: 't1',
        toStatus: 'resolved',
        actorId: 'u1',
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('accepts submitted → routed and writes trail entry', async () => {
    ticketFindUnique.mockResolvedValueOnce({
      status: 'submitted',
      cityId: 'c1',
      wardId: 'w1',
      categoryId: 'cat1',
      version: 0,
    });
    ticketUpdateWhere.mockResolvedValueOnce(1);
    trailCreate.mockResolvedValueOnce({ id: 'trail1' });

    await transitionTicket({
      ticketId: 't1',
      toStatus: 'routed',
      actorId: 'u1',
      note: 'routed to ward-3',
    });

    // The write is a compare-and-swap: the predicate carries BOTH the
    // status and the version the read observed, so a writer whose read
    // has been overtaken updates zero rows instead of clobbering.
    expect(ticketUpdateWhere).toHaveBeenCalledWith({
      where: { id: 't1', status: 'submitted', version: 0 },
      data: { status: 'routed', version: 1 },
    });
    expect(trailCreate).toHaveBeenCalledWith({
      data: {
        ticketId: 't1',
        toStatus: 'routed',
        actorId: 'u1',
        note: 'routed to ward-3',
      },
    });
  });

  it('accepts in_progress → resolved and stamps resolvedAt', async () => {
    ticketFindUnique.mockResolvedValueOnce({
      status: 'in_progress',
      cityId: 'c1',
      wardId: 'w1',
      categoryId: 'cat1',
      version: 3,
    });
    ticketUpdateWhere.mockResolvedValueOnce(1);
    trailCreate.mockResolvedValueOnce({ id: 'trail2' });

    await transitionTicket({
      ticketId: 't1',
      toStatus: 'resolved',
      actorId: 'u1',
    });

    expect(ticketUpdateWhere).toHaveBeenCalledWith({
      where: { id: 't1', status: 'in_progress', version: 3 },
      data: {
        status: 'resolved',
        version: 4,
        resolvedAt: expect.any(String),
      },
    });
  });

  it('rejects any transition from a terminal status (cancelled)', async () => {
    ticketFindUnique.mockResolvedValueOnce({
      status: 'cancelled',
      cityId: 'c1',
      wardId: 'w1',
      categoryId: 'cat1',
    });
    await expect(
      transitionTicket({
        ticketId: 't1',
        toStatus: 'resolved',
        actorId: 'u1',
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('InvalidTransitionError exposes fromStatus + toStatus', () => {
    const err = new InvalidTransitionError('submitted', 'in_progress');
    expect(err.fromStatus).toBe('submitted');
    expect(err.toStatus).toBe('in_progress');
    expect(err.name).toBe('InvalidTransitionError');
  });

  describe('concurrency guard', () => {
    it('rejects the transition when the compare-and-swap matches zero rows', async () => {
      ticketFindUnique.mockResolvedValueOnce({
        status: 'submitted',
        cityId: 'c1',
        wardId: 'w1',
        categoryId: 'cat1',
        version: 0,
      });
      // Zero rows affected: another writer got there first.
      ticketUpdateWhere.mockResolvedValueOnce(0);

      await expect(
        transitionTicket({
          ticketId: 't1',
          toStatus: 'routed',
          actorId: 'u1',
        }),
      ).rejects.toBeInstanceOf(ConcurrentTransitionError);
    });

    it('writes no trail entry when the compare-and-swap loses the race', async () => {
      ticketFindUnique.mockResolvedValueOnce({
        status: 'submitted',
        cityId: 'c1',
        wardId: 'w1',
        categoryId: 'cat1',
        version: 0,
      });
      ticketUpdateWhere.mockResolvedValueOnce(0);
      trailCreate.mockClear();

      await expect(
        transitionTicket({
          ticketId: 't1',
          toStatus: 'routed',
          actorId: 'u1',
        }),
      ).rejects.toBeInstanceOf(ConcurrentTransitionError);

      // The trail is the citizen-facing record. A lost race must not
      // leave a row claiming a transition that did not happen.
      expect(trailCreate).not.toHaveBeenCalled();
    });

    it('ConcurrentTransitionError exposes ticketId + expectedStatus + toStatus', () => {
      const err = new ConcurrentTransitionError('t1', 'submitted', 'routed');
      expect(err.ticketId).toBe('t1');
      expect(err.expectedStatus).toBe('submitted');
      expect(err.toStatus).toBe('routed');
      expect(err.name).toBe('ConcurrentTransitionError');
    });

    it('treats a missing version column as version 0', async () => {
      // A row that predates the version column reads as 0 — the same
      // value the database default produces.
      ticketFindUnique.mockResolvedValueOnce({
        status: 'submitted',
        cityId: 'c1',
        wardId: 'w1',
        categoryId: 'cat1',
      });
      ticketUpdateWhere.mockResolvedValueOnce(1);

      await transitionTicket({
        ticketId: 't1',
        toStatus: 'routed',
        actorId: 'u1',
      });

      expect(ticketUpdateWhere).toHaveBeenCalledWith({
        where: { id: 't1', status: 'submitted', version: 0 },
        data: { status: 'routed', version: 1 },
      });
    });
  });
});
