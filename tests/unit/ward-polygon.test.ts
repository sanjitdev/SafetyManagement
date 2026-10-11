/**
 * validatePolygon — pure function unit tests.
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 */

import { describe, expect, it } from 'vitest';
import { validatePolygon } from '@/lib/admin/ward-polygon';

describe('validatePolygon (Bolt 005-002)', () => {
  it('accepts a closed triangle polygon (4 entries)', () => {
    const result = validatePolygon({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects an unclosed ring', () => {
    const result = validatePolygon({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('polygon_not_closed');
    }
  });

  it('rejects too-few-vertices', () => {
    const result = validatePolygon({
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 0], [0, 0]]],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('polygon_too_few_vertices');
    }
  });

  it('rejects non-Polygon type', () => {
    const result = validatePolygon({
      type: 'Point',
      coordinates: [0, 0],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('invalid_polygon');
    }
  });

  it('rejects coordinates out of range', () => {
    const result = validatePolygon({
      type: 'Polygon',
      coordinates: [
        [
          [-200, 0],
          [1, 0],
          [0, 1],
          [-200, 0],
        ],
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('coordinates_out_of_range');
    }
  });

  it('rejects multi-ring polygons (no holes in v1)', () => {
    const result = validatePolygon({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 0],
        ],
        [
          [0.5, 0.5],
          [1.5, 0.5],
          [1.5, 1.5],
          [0.5, 0.5],
        ],
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe('invalid_polygon');
    }
  });
});
