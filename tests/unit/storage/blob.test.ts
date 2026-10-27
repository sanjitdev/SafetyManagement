/**
 * Unit tests for lib/storage/blob.ts.
 *
 * Coverage:
 *   - Key generation (`buildPhotoKey`) — shape, uniqueness,
 *     sanitisation of the original filename.
 *   - MIME validation (`isAllowedBlobMime`).
 *   - Key safety (`isSafeKey`) — traversal, absolute paths, empty
 *     segments.
 *   - The `local` provider round-trip — put → read back → delete.
 *   - The error paths — bad MIME, bad key, oversize body, missing
 *     S3 dependency, unconfigured S3 bucket.
 *   - `isBlobProviderActive` — the flag that keeps the existing
 *     inline data-URL behaviour (and therefore the Playwright
 *     visual baselines) intact when no blob provider is configured.
 *
 * The vitest environment is `node` (per vitest.config.ts), so the
 * local provider writes to a real temp directory via the injected
 * filesystem seam.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ALLOWED_BLOB_MIME_TYPES,
  DEFAULT_LOCAL_BLOB_DIR,
  MAX_BLOB_BYTES,
  buildPhotoKey,
  deleteObject,
  extensionForMime,
  getBlobStore,
  getSignedUrl,
  isAllowedBlobMime,
  isBlobProviderActive,
  isSafeKey,
  putObject,
  readBlobConfig,
  resetBlobStoreCache,
  resolveLocalPath,
  sanitizeBaseName,
  setLocalFs,
  type BlobConfig,
} from '@/lib/storage/blob';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'cityfix-blob-'));
  resetBlobStoreCache();
});

afterEach(async () => {
  setLocalFs(null);
  resetBlobStoreCache();
  await rm(tmpRoot, { recursive: true, force: true });
});

function localConfig(dir: string): BlobConfig {
  return {
    provider: 'local',
    localDir: dir,
    localBaseUrl: '/api/blob',
    region: 'auto',
    signedUrlTtlSeconds: 900,
  };
}

// =====================================================================
// Pure helpers
// =====================================================================

describe('isAllowedBlobMime', () => {
  it('accepts the allow-listed image types', () => {
    for (const m of ALLOWED_BLOB_MIME_TYPES) {
      expect(isAllowedBlobMime(m)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    expect(isAllowedBlobMime('image/gif')).toBe(false);
    expect(isAllowedBlobMime('image/svg+xml')).toBe(false);
    expect(isAllowedBlobMime('application/pdf')).toBe(false);
    expect(isAllowedBlobMime('')).toBe(false);
  });
});

describe('extensionForMime', () => {
  it('maps each allow-listed MIME to an extension', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/webp')).toBe('webp');
  });

  it('falls back to bin for an unknown type', () => {
    expect(extensionForMime('application/pdf')).toBe('bin');
  });
});

describe('sanitizeBaseName', () => {
  it('strips the directory and the extension', () => {
    expect(sanitizeBaseName('photo.jpg')).toBe('photo');
    expect(sanitizeBaseName('/tmp/a/b/report.png')).toBe('report');
  });

  it('replaces unsafe characters with a dash', () => {
    expect(sanitizeBaseName('my photo!.png')).toBe('my-photo');
  });

  it('returns empty for a missing name', () => {
    expect(sanitizeBaseName(undefined)).toBe('');
    expect(sanitizeBaseName('')).toBe('');
  });

  it('truncates to 64 characters', () => {
    expect(sanitizeBaseName(`${'a'.repeat(200)}.jpg`)).toHaveLength(64);
  });
});

describe('buildPhotoKey', () => {
  it('produces a tickets/<ticketId>/<role>-<rand>-<name>.<ext> key', () => {
    const key = buildPhotoKey({
      ticketId: 'tkt_abc',
      role: 'crew',
      mimeType: 'image/png',
      originalName: 'shot.png',
      randomId: 'deadbeefdeadbeef',
    });
    expect(key).toBe('tickets/tkt_abc/crew-deadbeefdeadbeef-shot.png');
  });

  it('uses the extension derived from the MIME type, not the filename', () => {
    const key = buildPhotoKey({
      ticketId: 'tkt_abc',
      role: 'citizen',
      mimeType: 'image/jpeg',
      originalName: 'shot.png',
      randomId: 'aaaa',
    });
    expect(key.endsWith('.jpg')).toBe(true);
  });

  it('falls back to photo.<ext> when there is no original name', () => {
    const key = buildPhotoKey({
      ticketId: 'tkt_abc',
      role: 'citizen',
      mimeType: 'image/webp',
      randomId: 'aaaa',
    });
    expect(key).toBe('tickets/tkt_abc/citizen-aaaa-photo.webp');
  });

  it('generates distinct keys for two uploads of the same file', () => {
    const args = {
      ticketId: 'tkt_abc',
      role: 'citizen' as const,
      mimeType: 'image/png' as const,
      originalName: 'shot.png',
    };
    const a = buildPhotoKey(args);
    const b = buildPhotoKey(args);
    expect(a).not.toBe(b);
  });

  it('always produces a safe key', () => {
    const key = buildPhotoKey({
      ticketId: 'tkt_abc',
      role: 'citizen',
      mimeType: 'image/png',
      originalName: '../../../etc/passwd',
    });
    expect(isSafeKey(key)).toBe(true);
  });
});

describe('isSafeKey', () => {
  it('accepts a normal relative key', () => {
    expect(isSafeKey('tickets/tkt_1/citizen-a.png')).toBe(true);
  });

  it('rejects traversal segments', () => {
    expect(isSafeKey('../etc/passwd')).toBe(false);
    expect(isSafeKey('tickets/../../etc/passwd')).toBe(false);
  });

  it('rejects absolute paths and backslashes', () => {
    expect(isSafeKey('/etc/passwd')).toBe(false);
    expect(isSafeKey('tickets\\tkt_1\\a.png')).toBe(false);
  });

  it('rejects empty segments and empty keys', () => {
    expect(isSafeKey('tickets//a.png')).toBe(false);
    expect(isSafeKey('')).toBe(false);
  });

  it('rejects an over-long key', () => {
    expect(isSafeKey('a'.repeat(513))).toBe(false);
  });
});

describe('resolveLocalPath', () => {
  it('joins the dir and the key', () => {
    expect(resolveLocalPath('/tmp/blobs', 'a/b.png')).toBe('/tmp/blobs/a/b.png');
  });

  it('returns null for an unsafe key', () => {
    expect(resolveLocalPath('/tmp/blobs', '../a.png')).toBeNull();
  });

  it('normalises a trailing slash on the dir', () => {
    expect(resolveLocalPath('/tmp/blobs/', 'a.png')).toBe('/tmp/blobs/a.png');
  });
});

describe('readBlobConfig', () => {
  it('defaults to the local provider', () => {
    const cfg = readBlobConfig({});
    expect(cfg.provider).toBe('local');
    expect(cfg.localDir).toBe(DEFAULT_LOCAL_BLOB_DIR);
    expect(cfg.localBaseUrl).toBe('/api/blob');
  });

  it('selects s3 when BLOB_PROVIDER=s3', () => {
    const cfg = readBlobConfig({
      BLOB_PROVIDER: 's3',
      BLOB_S3_BUCKET: 'cityfix-photos',
      BLOB_S3_ENDPOINT: 'https://r2.example.com',
      BLOB_S3_REGION: 'auto',
      BLOB_S3_ACCESS_KEY_ID: 'ak',
      BLOB_S3_SECRET_ACCESS_KEY: 'sk',
      BLOB_PUBLIC_BASE_URL: 'https://cdn.example.com',
    });
    expect(cfg.provider).toBe('s3');
    expect(cfg.bucket).toBe('cityfix-photos');
    expect(cfg.endpoint).toBe('https://r2.example.com');
    expect(cfg.publicBaseUrl).toBe('https://cdn.example.com');
  });

  it('falls back to local for an unknown provider value', () => {
    const cfg = readBlobConfig({
      BLOB_PROVIDER: 'gcs',
    });
    expect(cfg.provider).toBe('local');
  });
});

describe('isBlobProviderActive', () => {
  it('is false when nothing is configured (preserves the inline behaviour)', () => {
    expect(isBlobProviderActive({})).toBe(false);
  });

  it('is false for the local provider with no explicit directory', () => {
    expect(
      isBlobProviderActive({ BLOB_PROVIDER: 'local' }),
    ).toBe(false);
  });

  it('is true for the local provider with an explicit directory', () => {
    expect(
      isBlobProviderActive({
        BLOB_PROVIDER: 'local',
        BLOB_LOCAL_DIR: '/var/blobs',
      }),
    ).toBe(true);
  });

  it('is true for the s3 provider', () => {
    expect(
      isBlobProviderActive({ BLOB_PROVIDER: 's3' }),
    ).toBe(true);
  });
});

// =====================================================================
// The local provider — round-trip
// =====================================================================

describe('local provider', () => {
  it('stores bytes and reads them back', async () => {
    const dir = join(tmpRoot, 'blobs');
    const store = await getBlobStore(localConfig(dir));
    expect(store.ok).toBe(true);
    if (!store.ok) return;

    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const put = await store.value.putObject({
      key: 'tickets/tkt_1/citizen-a.png',
      body: bytes,
      contentType: 'image/png',
    });
    expect(put.ok).toBe(true);
    if (!put.ok) return;
    expect(put.value.key).toBe('tickets/tkt_1/citizen-a.png');
    expect(put.value.url).toBe('/api/blob/tickets/tkt_1/citizen-a.png');

    const onDisk = await readFile(
      join(dir, 'tickets/tkt_1/citizen-a.png'),
    );
    expect(new Uint8Array(onDisk)).toEqual(bytes);
  });

  it('deletes an object', async () => {
    const dir = join(tmpRoot, 'blobs');
    const store = await getBlobStore(localConfig(dir));
    if (!store.ok) throw new Error('expected store');
    await store.value.putObject({
      key: 'a.png',
      body: new Uint8Array([1]),
      contentType: 'image/png',
    });
    const del = await store.value.deleteObject('a.png');
    expect(del).toEqual({ ok: true, value: true });
    // A second delete is a no-op (force: true).
    expect(await store.value.deleteObject('a.png')).toEqual({
      ok: true,
      value: true,
    });
  });

  it('returns the stable public URL from getSignedUrl', async () => {
    const store = await getBlobStore(localConfig(join(tmpRoot, 'blobs')));
    if (!store.ok) throw new Error('expected store');
    const res = await store.value.getSignedUrl('a/b.png');
    expect(res).toEqual({ ok: true, value: '/api/blob/a/b.png' });
  });

  it('rejects a non-allow-listed MIME type', async () => {
    const store = await getBlobStore(localConfig(join(tmpRoot, 'blobs')));
    if (!store.ok) throw new Error('expected store');
    const res = await store.value.putObject({
      key: 'a.txt',
      body: new Uint8Array([1]),
      contentType: 'text/plain',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('blob_invalid_mime_type');
  });

  it('rejects an unsafe key', async () => {
    const store = await getBlobStore(localConfig(join(tmpRoot, 'blobs')));
    if (!store.ok) throw new Error('expected store');
    const res = await store.value.putObject({
      key: '../escape.png',
      body: new Uint8Array([1]),
      contentType: 'image/png',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('blob_invalid_key');
  });

  it('rejects an oversize body', async () => {
    const store = await getBlobStore(localConfig(join(tmpRoot, 'blobs')));
    if (!store.ok) throw new Error('expected store');
    const res = await store.value.putObject({
      key: 'a.png',
      body: new Uint8Array(MAX_BLOB_BYTES + 1),
      contentType: 'image/png',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('blob_write_failed');
  });

  it('rejects an unsafe key on getSignedUrl and deleteObject', async () => {
    const store = await getBlobStore(localConfig(join(tmpRoot, 'blobs')));
    if (!store.ok) throw new Error('expected store');
    const signed = await store.value.getSignedUrl('../x.png');
    expect(signed.ok).toBe(false);
    if (!signed.ok) expect(signed.error.code).toBe('blob_invalid_key');
    const del = await store.value.deleteObject('../x.png');
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error.code).toBe('blob_invalid_key');
  });
});

// =====================================================================
// The module-level API
// =====================================================================

describe('module-level putObject / getSignedUrl / deleteObject', () => {
  it('round-trips through the env-configured local provider', async () => {
    // Point the local provider at the temp dir by setting the env
    // var BEFORE the store is created. `getBlobStore` reads the
    // env lazily on first use.
    const previous = process.env.BLOB_PROVIDER;
    const previousDir = process.env.BLOB_LOCAL_DIR;
    process.env.BLOB_PROVIDER = 'local';
    process.env.BLOB_LOCAL_DIR = join(tmpRoot, 'env-blobs');
    resetBlobStoreCache();
    try {
      const put = await putObject({
        key: 'tickets/tkt_9/citizen-x.png',
        body: new Uint8Array([9, 9]),
        contentType: 'image/png',
      });
      expect(put.ok).toBe(true);
      if (!put.ok) return;
      expect(put.value.url).toBe('/api/blob/tickets/tkt_9/citizen-x.png');

      const signed = await getSignedUrl('tickets/tkt_9/citizen-x.png');
      expect(signed.ok).toBe(true);
      if (signed.ok) {
        expect(signed.value).toBe('/api/blob/tickets/tkt_9/citizen-x.png');
      }

      const del = await deleteObject('tickets/tkt_9/citizen-x.png');
      expect(del).toEqual({ ok: true, value: true });
    } finally {
      if (previous === undefined) delete process.env.BLOB_PROVIDER;
      else process.env.BLOB_PROVIDER = previous;
      if (previousDir === undefined) delete process.env.BLOB_LOCAL_DIR;
      else process.env.BLOB_LOCAL_DIR = previousDir;
      resetBlobStoreCache();
    }
  });
});

// =====================================================================
// The S3 provider — error paths (no AWS SDK installed)
// =====================================================================

describe('s3 provider', () => {
  it('reports a missing bucket as not-configured', async () => {
    const store = await getBlobStore({
      provider: 's3',
      localDir: '',
      localBaseUrl: '',
      region: 'auto',
      signedUrlTtlSeconds: 900,
    });
    expect(store.ok).toBe(false);
    if (!store.ok) {
      expect(store.error.code).toBe('blob_provider_not_configured');
    }
  });

  it('reports the missing AWS SDK dependency rather than throwing', async () => {
    const store = await getBlobStore({
      provider: 's3',
      localDir: '',
      localBaseUrl: '',
      bucket: 'cityfix-photos',
      region: 'auto',
      signedUrlTtlSeconds: 900,
    });
    if (store.ok) {
      // The AWS SDK IS installed in this environment — the S3
      // provider must then be constructible. Assert the shape.
      expect(store.value.provider).toBe('s3');
      return;
    }
    expect(store.error.code).toBe('blob_provider_dependency_missing');
  });
});
