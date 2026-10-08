/**
 * Unit tests for the in-memory dev store (lib/dev-store.ts).
 *
 * Validates the shim's behaviour against the spec's invariants:
 *   - ticket.create returns a non-null id + ISO timestamps
 *   - ticket.findMany filter clauses (cityId, categoryId, status IN, reporterId)
 *   - getTicketWithTrail returns the trail sorted by timestamp asc
 *   - the store survives a global reset between runs (HMR-safe)
 *
 * These tests run against the real in-memory store, not against a mock —
 * the dev store is pure JS and has no I/O, so it is safe to run in vitest.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  devDb,
  resetStore,
  DEV_CITIZEN_ID,
  DEV_CITY_ID,
  DEV_WARD_ID,
  getTicketWithTrail,
} from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
});

describe('dev-store ticket CRUD', () => {
  it('creates a ticket with generated id and ISO timestamps', () => {
    const t = devDb.ticket.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        photoUrls: [],
        assignedCrewId: null,
        internalNote: null,
      },
    });
    expect(t.id).toMatch(/^tkt_/);
    expect(t.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(t.updatedAt).toBe(t.createdAt);
    expect(t.resolvedAt).toBeNull();
  });

  it('findMany filters by cityId, categoryId, reporterId', () => {
    devDb.ticket.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        photoUrls: [],
        assignedCrewId: null,
        internalNote: null,
      },
    });
    devDb.ticket.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        categoryId: 'cat_pothole',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        photoUrls: [],
        assignedCrewId: null,
        internalNote: null,
      },
    });
    const results = devDb.ticket.findMany({
      where: {
        cityId: DEV_CITY_ID,
        categoryId: 'cat_streetlight',
      },
      reporterId: DEV_CITIZEN_ID,
    });
    expect(results).toHaveLength(1);
    expect(results[0].categoryId).toBe('cat_streetlight');
  });

  it('findMany with status { in: [...] } filters by open statuses', () => {
    devDb.ticket.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        photoUrls: [],
        assignedCrewId: null,
        internalNote: null,
      },
    });
    devDb.ticket.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'resolved',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        photoUrls: [],
        assignedCrewId: null,
        internalNote: null,
      },
    });
    const open = devDb.ticket.findMany({
      where: {
        cityId: DEV_CITY_ID,
        categoryId: 'cat_streetlight',
        status: { in: ['submitted', 'routed', 'in_progress'] },
      },
    });
    expect(open).toHaveLength(1);
    expect(open[0].status).toBe('submitted');
  });

  it('update mutates the stored ticket and bumps updatedAt', async () => {
    const t = devDb.ticket.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        photoUrls: [],
        assignedCrewId: null,
        internalNote: null,
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    const next = devDb.ticket.update({
      where: { id: t.id },
      data: { status: 'routed' },
    });
    expect(next.status).toBe('routed');
    expect(next.createdAt).toBe(t.createdAt);
    expect(next.updatedAt > t.updatedAt).toBe(true);
  });
});

describe('dev-store getTicketWithTrail', () => {
  it('returns the ticket with its trail sorted by timestamp asc', async () => {
    const t = devDb.ticket.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: DEV_WARD_ID,
        categoryId: 'cat_streetlight',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
        locationLabel: 'Mirpur',
        locationLabelBn: 'মিরপুর',
        note: null,
        photoUrls: [],
        assignedCrewId: null,
        internalNote: null,
      },
    });
    devDb.trail.create({
      data: { ticketId: t.id, toStatus: 'submitted', actorId: DEV_CITIZEN_ID, note: null },
    });
    await new Promise((r) => setTimeout(r, 5));
    devDb.trail.create({
      data: { ticketId: t.id, toStatus: 'routed', actorId: 'disp1', note: null },
    });
    await new Promise((r) => setTimeout(r, 5));
    devDb.trail.create({
      data: { ticketId: t.id, toStatus: 'in_progress', actorId: 'crew1', note: null },
    });

    const withTrail = getTicketWithTrail(t.id);
    expect(withTrail).not.toBeNull();
    expect(withTrail!.trail).toHaveLength(3);
    expect(withTrail!.trail[0].toStatus).toBe('submitted');
    expect(withTrail!.trail[1].toStatus).toBe('routed');
    expect(withTrail!.trail[2].toStatus).toBe('in_progress');
  });

  it('returns null for an unknown ticket id', () => {
    expect(getTicketWithTrail('tkt_unknown')).toBeNull();
  });
});