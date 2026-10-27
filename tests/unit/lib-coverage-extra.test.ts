/**
 * Unit tests for the remaining small helpers that close the last
 * reachable coverage gaps in `lib/`.
 *
 *  - `buildCsvDocument` (`lib/admin/users.ts`) — the CSV export
 *    document builder.
 *  - `readSystemPrefersDark` (`lib/theme/appearance.ts`) — the live
 *    system colour-scheme probe.
 *  - `bytesToBase64` / `base64ToBytes` (`lib/crew/upload-photo.ts`) —
 *    the base64 codec used by the blob upload path.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { buildCsvDocument, escapeCsvCell } from '@/lib/admin/users';
import { readSystemPrefersDark } from '@/lib/theme/appearance';
import { base64ToBytes, bytesToBase64 } from '@/lib/crew/upload-photo';

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

// ---------------------------------------------------------------------------
// buildCsvDocument
// ---------------------------------------------------------------------------

describe('buildCsvDocument', () => {
  it('emits the header row followed by the data rows', () => {
    const csv = buildCsvDocument(
      ['id', 'name'],
      [
        ['u_1', 'Rahim'],
        ['u_2', 'Habib'],
      ],
    );
    expect(csv).toBe('id,name\r\nu_1,Rahim\r\nu_2,Habib\r\n');
  });

  it('emits only the header for an empty row set', () => {
    expect(buildCsvDocument(['id'], [])).toBe('id\r\n');
  });

  it('escapes the cells that need it', () => {
    const csv = buildCsvDocument(
      ['name', 'note'],
      [['Has, comma', 'Has "quote"']],
    );
    expect(csv).toBe('name,note\r\n"Has, comma","Has ""quote"""\r\n');
  });

  it('renders null and undefined as an empty cell', () => {
    const csv = buildCsvDocument(['a', 'b'], [[null, undefined]]);
    expect(csv).toBe('a,b\r\n,\r\n');
  });

  it('escapes a cell containing a newline', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });
});

// ---------------------------------------------------------------------------
// readSystemPrefersDark
// ---------------------------------------------------------------------------

describe('readSystemPrefersDark', () => {
  it('returns false on the server (no window)', () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(readSystemPrefersDark()).toBe(false);
  });

  it('returns false when matchMedia is unsupported', () => {
    (globalThis as { window?: unknown }).window = {};
    expect(readSystemPrefersDark()).toBe(false);
  });

  it('returns true when the system prefers dark', () => {
    (globalThis as { window?: unknown }).window = {
      matchMedia: (q: string) => ({ matches: true, media: q }),
    };
    expect(readSystemPrefersDark()).toBe(true);
  });

  it('returns false when the system prefers light', () => {
    (globalThis as { window?: unknown }).window = {
      matchMedia: (q: string) => ({ matches: false, media: q }),
    };
    expect(readSystemPrefersDark()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bytesToBase64 / base64ToBytes
// ---------------------------------------------------------------------------

describe('bytesToBase64 / base64ToBytes', () => {
  it('round-trips bytes through base64', () => {
    const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const b64 = bytesToBase64(original);
    expect(b64).toBe('AAEC+vv8/f7/');
    const decoded = base64ToBytes(b64);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('encodes an empty byte array to an empty string', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
  });

  it('decodes an empty string to an empty byte array', () => {
    expect(base64ToBytes('').length).toBe(0);
  });

  it('encodes a payload larger than one chunk', () => {
    // 0x8000 is the chunk size in `bytesToBase64`; a payload that
    // spans several chunks exercises the chunked path.
    const big = new Uint8Array(0x8000 * 2 + 17).fill(65);
    const decoded = base64ToBytes(bytesToBase64(big));
    expect(decoded.length).toBe(big.length);
    expect(decoded[0]).toBe(65);
    expect(decoded[decoded.length - 1]).toBe(65);
  });
});
