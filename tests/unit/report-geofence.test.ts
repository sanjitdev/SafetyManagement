/**
 * Unit tests for the geofence bbox helper
 * (lib/report-geofence.ts).
 *
 * Covers Bolt 002-003a Bolt Decision 1 (G1
 * polygon-geofence fallback). The polygon read
 * is deferred to v1.1; v1 ships the
 * `DHAKA_NORTH_BBOX` constant and renders the
 * "out-of-bounds" card against it.
 */

import { describe, expect, it } from 'vitest';
import {
  DHAKA_NORTH_BBOX,
  clampToGeofence,
  inGeofence,
  type GeofenceBbox,
} from '@/lib/report-geofence';

const smallBbox: GeofenceBbox = {
  southLat: 23.7,
  northLat: 23.8,
  westLng: 90.3,
  eastLng: 90.4,
};

describe('inGeofence', () => {
  it('returns true for a point inside the bbox', () => {
    expect(inGeofence(23.75, 90.35, smallBbox)).toBe(true);
  });

  it('returns true for a point exactly on the boundary (inclusive)', () => {
    expect(inGeofence(23.7, 90.35, smallBbox)).toBe(true);
    expect(inGeofence(23.8, 90.35, smallBbox)).toBe(true);
    expect(inGeofence(23.75, 90.3, smallBbox)).toBe(true);
    expect(inGeofence(23.75, 90.4, smallBbox)).toBe(true);
  });

  it('returns false for a point outside the bbox', () => {
    expect(inGeofence(23.69, 90.35, smallBbox)).toBe(false); // south
    expect(inGeofence(23.81, 90.35, smallBbox)).toBe(false); // north
    expect(inGeofence(23.75, 90.29, smallBbox)).toBe(false); // west
    expect(inGeofence(23.75, 90.41, smallBbox)).toBe(false); // east
  });

  it('uses DHAKA_NORTH_BBOX as the v1 fallback', () => {
    // Mirpur (DHAKA_CENTER) is inside DHAKA_NORTH_BBOX.
    expect(inGeofence(23.789, 90.4075, DHAKA_NORTH_BBOX)).toBe(true);
    // A point well outside the bbox (e.g. Old Dhaka south) is out.
    expect(inGeofence(23.71, 90.41, DHAKA_NORTH_BBOX)).toBe(false);
  });
});

describe('clampToGeofence', () => {
  it('returns the point unchanged when inside the bbox', () => {
    expect(clampToGeofence(23.75, 90.35, smallBbox)).toEqual({
      lat: 23.75,
      lng: 90.35,
    });
  });

  it('clamps a south-of-bbox point to the south edge', () => {
    expect(clampToGeofence(23.6, 90.35, smallBbox)).toEqual({
      lat: 23.7,
      lng: 90.35,
    });
  });

  it('clamps a north-of-bbox point to the north edge', () => {
    expect(clampToGeofence(23.9, 90.35, smallBbox)).toEqual({
      lat: 23.8,
      lng: 90.35,
    });
  });

  it('clamps a west-of-bbox point to the west edge', () => {
    expect(clampToGeofence(23.75, 90.2, smallBbox)).toEqual({
      lat: 23.75,
      lng: 90.3,
    });
  });

  it('clamps an east-of-bbox point to the east edge', () => {
    expect(clampToGeofence(23.75, 90.5, smallBbox)).toEqual({
      lat: 23.75,
      lng: 90.4,
    });
  });
});
