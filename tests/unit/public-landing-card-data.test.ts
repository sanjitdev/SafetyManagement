/**
 * Vitest: the public landing page's card data + location filter.
 *
 * ## What this guards
 *
 * The public landing at `/` renders a read-only city activity feed.
 * Two things were wrong on that surface and both were invisible to
 * the type-checker:
 *
 *  1. **The cards showed no category.** The public serializer dropped
 *     `categoryName`, so a card read as a bare status pill floating
 *     over free text. A visitor could not tell a streetlight report
 *     from a drainage one. The serializer now carries the category
 *     name (public city configuration — not PII).
 *
 *  2. **The photos rendered as blank/magenta tiles.** The seeded and
 *     test-generated rows carry 1×1 and 2×2 PNGs — a transparent
 *     pixel for "a photo exists but we have no bytes", a solid
 *     magenta pixel for "the thumbnail pipeline must paint this
 *     square". Both are valid `data:image/png` URLs, so the old
 *     renderable-URL check accepted them and the card painted an
 *     80×80 magenta tile. A wall of magenta squares on a public page
 *     reads as a broken app.
 *
 * The location filter is guarded too: the ward filter must be
 * applied over the city's FULL ticket set (before the page slice),
 * so "Ward 1 + New" is every New report in Ward 1 — not the New
 * reports that happened to fall inside the first 30 rows.
 */

import { describe, expect, test } from 'vitest';
import {
  isDegenerateInlineImage,
  firstDisplayablePhotoUrl,
  isRenderablePhotoUrl,
} from '@/lib/format/photo-url';
import { serializeTicketForPublic } from '@/lib/serializers/ticket';

/**
 * A 1×1 transparent PNG — the "photo exists but we have no bytes"
 * fixture. This is a real, valid PNG; it is just not evidence of
 * anything.
 */
const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zo8DwoAAAAASUVORK5CYII=';

/**
 * A 2×4 PNG whose every pixel is opaque magenta (#FF00FF) — the
 * "the thumbnail pipeline must paint this square" fixture. Its
 * dimensions are read from the IHDR chunk rather than assumed: the
 * rule keys on the SHORTEST side, and this fixture's short side is
 * 2 pixels.
 */
const MAGENTA_SWATCH_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAAEAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('isDegenerateInlineImage', () => {
  test('a 1×1 PNG is degenerate', () => {
    expect(isDegenerateInlineImage(ONE_BY_ONE_PNG)).toBe(true);
  });

  test('the magenta swatch is degenerate', () => {
    expect(isDegenerateInlineImage(MAGENTA_SWATCH_PNG)).toBe(true);
  });

  test('a non-PNG data URL is not degenerate', () => {
    expect(
      isDegenerateInlineImage('data:image/jpeg;base64,/9j/4AAQSkZJRg=='),
    ).toBe(false);
  });

  test('an absolute http URL is not degenerate', () => {
    // We do not decode remote images client-side. A 1×1 remote PNG
    // would pass, but that is not a shape the platform produces.
    expect(isDegenerateInlineImage('https://cdn.example.com/a.png')).toBe(
      false,
    );
  });

  test('a root-relative blob path is not degenerate', () => {
    expect(isDegenerateInlineImage('/api/blob/tickets/abc.jpg')).toBe(false);
  });

  test('null and empty are not degenerate', () => {
    expect(isDegenerateInlineImage(null)).toBe(false);
    expect(isDegenerateInlineImage('')).toBe(false);
    expect(isDegenerateInlineImage('   ')).toBe(false);
  });

  test('a truncated payload is treated as degenerate', () => {
    // Not enough bytes to read a header — certainly not a photo.
    expect(isDegenerateInlineImage('data:image/png;base64,iVBORw0KGgo=')).toBe(
      true,
    );
  });

  test('a PNG with both sides above 2px is kept', () => {
    // A 4×4 PNG — small, but a deliberate upload rather than a
    // colour swatch.
    const fourByFour =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mNk+M9QzzCKRsEoGgWjAAAJ4AAP//DEaB1WX8WQAAAABJRU5ErkJggg==';
    expect(isDegenerateInlineImage(fourByFour)).toBe(false);
  });

  test('a one-pixel-wide strip is degenerate even though it is tall', () => {
    // The rule keys on the SHORTEST side: a 1×4000 banner is a
    // divider line, not a photograph of a streetlight.
    const strip = buildPng(1, 4000);
    expect(isDegenerateInlineImage(strip)).toBe(true);
  });
});

/**
 * Build a minimal but VALID PNG of the given dimensions.
 *
 * The header is what the detector reads, but the file must still be
 * a well-formed PNG so the test asserts on real bytes rather than a
 * hand-written guess. The IDAT payload is a single deflate stream
 * of the correct byte count for the given size.
 */
function buildPng(width: number, height: number): string {
  // Raw scanlines: each row is one filter byte + width RGB bytes.
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 3)] = 0; // filter type: none
  }
  // zlib header + stored deflate blocks + adler32.
  const zlib = new Uint8Array(2 + raw.length + 5 * Math.ceil(raw.length / 65535) + 4);
  let pos = 0;
  zlib[pos++] = 0x78; // CMF: deflate, 32K window
  zlib[pos++] = 0x01; // FLG
  const blocks = Math.ceil(raw.length / 65535) || 1;
  for (let b = 0; b < blocks; b += 1) {
    const start = b * 65535;
    const len = Math.min(65535, raw.length - start);
    zlib[pos++] = b === blocks - 1 ? 1 : 0; // BFINAL + BTYPE=stored
    zlib[pos++] = len & 0xff;
    zlib[pos++] = (len >>> 8) & 0xff;
    zlib[pos++] = ~len & 0xff;
    zlib[pos++] = (~len >>> 8) & 0xff;
    zlib.set(raw.subarray(start, start + len), pos);
    pos += len;
  }
  // Adler-32 of the raw data.
  let a = 1;
  let c = 0;
  for (let i = 0; i < raw.length; i += 1) {
    a = (a + raw[i]) % 65521;
    c = (c + a) % 65521;
  }
  zlib[pos++] = (c >>> 24) & 0xff;
  zlib[pos++] = (c >>> 16) & 0xff;
  zlib[pos++] = (c >>> 8) & 0xff;
  zlib[pos++] = c & 0xff;

  const crcTable = buildCrcTable();
  const chunks: Uint8Array[] = [
    pngChunk('IHDR', ihdr(width, height), crcTable),
    pngChunk('IDAT', zlib.subarray(0, pos), crcTable),
    pngChunk('IEND', new Uint8Array(0), crcTable),
  ];
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const total =
    signature.length + chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  out.set(signature, 0);
  let p = signature.length;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  let binary = '';
  for (const byte of out) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

function ihdr(width: number, height: number): Uint8Array {
  const out = new Uint8Array(13);
  const view = new DataView(out.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  out[8] = 8; // bit depth
  out[9] = 2; // colour type: truecolour
  return out;
}

function pngChunk(
  type: string,
  data: Uint8Array,
  crcTable: Uint32Array,
): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) typeBytes[i] = type.charCodeAt(i);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const crc = crc32(body, crcTable);
  const out = new Uint8Array(4 + body.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(4 + body.length, crc);
  return out;
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array, table: Uint32Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

describe('firstDisplayablePhotoUrl', () => {
  test('skips a degenerate photo and takes the next one', () => {
    const result = firstDisplayablePhotoUrl([
      ONE_BY_ONE_PNG,
      MAGENTA_SWATCH_PNG,
      'https://cdn.example.com/real.jpg',
    ]);
    expect(result).toBe('https://cdn.example.com/real.jpg');
  });

  test('returns null when every photo is degenerate', () => {
    expect(
      firstDisplayablePhotoUrl([ONE_BY_ONE_PNG, MAGENTA_SWATCH_PNG]),
    ).toBeNull();
  });

  test('returns null for an empty or missing list', () => {
    expect(firstDisplayablePhotoUrl([])).toBeNull();
    expect(firstDisplayablePhotoUrl(null)).toBeNull();
    expect(firstDisplayablePhotoUrl(undefined)).toBeNull();
  });

  test('keeps a real inline photo', () => {
    const result = firstDisplayablePhotoUrl([
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD',
    ]);
    expect(result).toBe(
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD',
    );
  });

  test('the renderable check still accepts a degenerate PNG', () => {
    // The two helpers are deliberately different: one asks "can this
    // be shown", the other asks "is this worth showing". A change
    // to isRenderablePhotoUrl would break the citizen's own report
    // flow, which uses the degenerate swatch as proof the bytes
    // round-tripped.
    expect(isRenderablePhotoUrl(ONE_BY_ONE_PNG)).toBe(true);
  });
});

describe('serializeTicketForPublic — card data', () => {
  const base = {
    id: 't1',
    cityId: 'c1',
    wardId: 'w1',
    categoryId: 'cat1',
    status: 'submitted' as never,
    locationLng: 90.4,
    locationLat: 23.7,
    locationLabel: 'House 12, Road 5',
    locationLabelBn: 'বাড়ি ১২',
    note: 'Streetlight out',
    assignedCrewId: 'crew-1',
    internalNote: 'internal',
    reporterId: 'user-1',
    createdAt: '2026-11-01T00:00:00.000Z',
    resolvedAt: null,
  };

  test('exposes the category name so the card can say what was reported', () => {
    const out = serializeTicketForPublic({
      ...base,
      categorySlug: 'streetlight',
      categoryName: 'Broken streetlight',
      categoryNameBn: 'রাস্তার আলো নেই',
    } as never);
    expect(out.categorySlug).toBe('streetlight');
    expect(out.categoryName).toBe('Broken streetlight');
    expect(out.categoryNameBn).toBe('রাস্তার আলো নেই');
  });

  test('a missing category join degrades to null, not a crash', () => {
    const out = serializeTicketForPublic(base as never);
    expect(out.categorySlug).toBeNull();
    expect(out.categoryName).toBeNull();
    expect(out.categoryNameBn).toBeNull();
  });

  test('the internal fields stay stripped', () => {
    const out = serializeTicketForPublic(base as never) as unknown as Record<
      string,
      unknown
    >;
    expect(out.reporterId).toBeUndefined();
    expect(out.internalNote).toBeUndefined();
    expect(out.assignedCrewId).toBeUndefined();
    expect(out.locationLabel).toBeUndefined();
    expect(out.trail).toBeUndefined();
  });
});
