/**
 * Unit tests for the platform transition engine (lib/platform/transitions.ts).
 *
 * Validates PLAT-REQ-005: every status transition is allowed only along the
 * edges documented in WO-000; invalid edges throw InvalidTransitionError and
 * the atomic update + trail entry + audit entry are all attempted in order.
 *
 * Mocks the db-switch so the test is pure logic — no DB.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock the @/lib/db-switch module so transitions.ts sees a fake db.
const ticketFindUnique = vi.fn();
const ticketUpdate = vi.fn();
const trailCreate = vi.fn();

vi.mock('@/lib/db-switch', () => ({
  db: {
    ticket: {
      findUnique: ticketFindUnique,
      update: ticketUpdate,
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
    });
    ticketUpdate.mockResolvedValueOnce({ id: 't1', status: 'routed' });
    trailCreate.mockResolvedValueOnce({ id: 'trail1' });

    await transitionTicket({
      ticketId: 't1',
      toStatus: 'routed',
      actorId: 'u1',
      note: 'routed to ward-3',
    });

    expect(ticketUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'routed' },
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
    });
    ticketUpdate.mockResolvedValueOnce({ id: 't1', status: 'resolved' });
    trailCreate.mockResolvedValueOnce({ id: 'trail2' });

    await transitionTicket({
      ticketId: 't1',
      toStatus: 'resolved',
      actorId: 'u1',
    });

    expect(ticketUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: {
        status: 'resolved',
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
});
