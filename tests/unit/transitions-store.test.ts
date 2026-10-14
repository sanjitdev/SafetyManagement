/**
 * Backend-agnostic transitions test (lib/platform/transitions.ts).
 *
 * Complements tests/unit/transitions.test.ts: that file mocks the db so
 * the engine's logic is verified in isolation. This file runs the same
 * engine against the real in-memory dev store, confirming that:
 *   - the store + the engine agree on the ticket shape
 *   - the resolvedAt stamp lands correctly
 *   - the trail entries are appended and recoverable
 *
 * This is the closest thing to an integration test we have for the
 * platform layer in the dev-store mode.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  transitionTicket,
  InvalidTransitionError,
} from '@/lib/platform/transitions';
import {
  devDb,
  resetStore,
  DEV_CITIZEN_ID,
  getTicketWithTrail,
} from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
});

describe('transitionTicket (real dev-store)', () => {
  it('submitted → routed updates the ticket and appends a trail entry', async () => {
    const t = devDb.ticket.create({
      data: {
        cityId: 'city_dhaka_north',
        wardId: 'ward_14',
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        assignedCrewId: null,
        internalNote: null,
      },
    });

    await transitionTicket({
      ticketId: t.id,
      toStatus: 'routed',
      actorId: 'user_dispatcher_habib',
      note: 'routed to electrical dept',
    });

    const updated = devDb.ticket.findUnique({ where: { id: t.id } });
    expect(updated!.status).toBe('routed');
    const withTrail = getTicketWithTrail(t.id);
    expect(withTrail!.trail).toHaveLength(1);
    expect(withTrail!.trail[0].toStatus).toBe('routed');
    expect(withTrail!.trail[0].note).toBe('routed to electrical dept');
  });

  it('routed → in_progress → resolved stamps resolvedAt', async () => {
    const t = devDb.ticket.create({
      data: {
        cityId: 'city_dhaka_north',
        wardId: 'ward_14',
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        assignedCrewId: null,
        internalNote: null,
      },
    });
    await transitionTicket({
      ticketId: t.id,
      toStatus: 'routed',
      actorId: 'user_dispatcher_habib',
    });
    await transitionTicket({
      ticketId: t.id,
      toStatus: 'in_progress',
      actorId: 'user_crew_rashid',
    });
    await transitionTicket({
      ticketId: t.id,
      toStatus: 'resolved',
      actorId: 'user_crew_rashid',
    });

    const withTrail = getTicketWithTrail(t.id);
    expect(withTrail!.status).toBe('resolved');
    expect(withTrail!.resolvedAt).not.toBeNull();
    expect(withTrail!.trail).toHaveLength(3);
    expect(withTrail!.trail.map((e) => e.toStatus)).toEqual([
      'routed',
      'in_progress',
      'resolved',
    ]);
  });

  it('rejects invalid edges (submitted → in_progress)', async () => {
    const t = devDb.ticket.create({
      data: {
        cityId: 'city_dhaka_north',
        wardId: 'ward_14',
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        assignedCrewId: null,
        internalNote: null,
      },
    });
    await expect(
      transitionTicket({
        ticketId: t.id,
        toStatus: 'in_progress',
        actorId: 'user_dispatcher_habib',
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('rejects further transitions after resolved (terminal)', async () => {
    const t = devDb.ticket.create({
      data: {
        cityId: 'city_dhaka_north',
        wardId: 'ward_14',
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        assignedCrewId: null,
        internalNote: null,
      },
    });
    await transitionTicket({ ticketId: t.id, toStatus: 'routed', actorId: 'u1' });
    await transitionTicket({
      ticketId: t.id,
      toStatus: 'in_progress',
      actorId: 'u2',
    });
    await transitionTicket({ ticketId: t.id, toStatus: 'resolved', actorId: 'u2' });
    await expect(
      transitionTicket({
        ticketId: t.id,
        toStatus: 'routed',
        actorId: 'u2',
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});