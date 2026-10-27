/**
 * Blob storage (lib/storage/blob.ts).
 *
 * WO-000 platform layer — the photo-bytes storage seam.
 *
 * WO-000's technical design left "Photo storage" as an open
 * question with the recommendation:
 *
 *   > "S3-compatible blob storage or local filesystem for v1?
 *   >  Recommendation: blob storage with local-filesystem fallback
 *   >  for dev."
 *
 * This module implements both halves of that recommendation:
 *
 *   - `s3`    — any S3-compatible endpoint (AWS S3, Cloudflare R2,
 *               MinIO). Selected by `BLOB_PROVIDER=s3`.
 *   - `local` — a filesystem directory. Selected by
 *               `BLOB_PROVIDER=local`, and the DEFAULT in dev so
 *               the app works with zero configuration.
 *
 * ── Why the provider is selected at runtime ───────────────────
 *
 * The S3 implementation uses a **lazy dynamic import** of
 * `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. The
 * import happens on the FIRST S3 call, not at module load. That
 * keeps this module importable (and unit-testable) in an install
 * that does not yet have the AWS SDK — the `local` provider stays
 * fully functional and the S3 provider reports a clean
 * `blob_provider_dependency_missing` error instead of crashing
 * the import.
 *
 * To enable the S3 provider:
 *
 *   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 *
 * ── The `url` contract ────────────────────────────────────────
 *
 * `putObject` returns BOTH a `url` and a `key`:
 *
 *   - `key` — the provider-side object key. The source of truth
 *     for `deleteObject` / `getSignedUrl`.
 *   - `url` — the URL a browser can render. For the `s3` provider
 *     this is the public base URL + key (or a signed URL); for the
 *     `local` provider it is a `/api/blob/<key>`-shaped path or an
 *     absolute `file://` path.
 *
 * The `TicketPhoto.url` column stays populated with this `url` so
 * the EXISTING citizen + crew serializers keep working unchanged
 * (they read `url` directly). The blob-specific metadata lands in
 * the sibling columns `storageKey` / `mimeType` / `sizeBytes`.
 *
 * ── Error convention ──────────────────────────────────────────
 *
 * Per `team.md`: "NEVER throw exceptions across service-layer
 * boundaries — return Result types or use the established
 * `ApiError` class from `lib/auth/guards.ts`."
 *
 * Every exported function here returns a `Result<T, E>` and NEVER
 * throws. The error type is a discriminated union of stable
 * string codes (not user-facing copy — the code is a constant;
 * the surface that renders it is responsible for localising it).
 */

import { ApiError } from '@/lib/auth/guards';

// =====================================================================
// Types
// =====================================================================

/**
 * The provider selection. `local` is the default in dev;
 * `s3` requires the `BLOB_S3_*` env vars.
 */
export type BlobProvider = 'local' | 's3';

/**
 * The failure codes this module can return. These are stable
 * machine-readable constants — NOT user-facing copy.
 */
export type BlobErrorCode =
  | 'blob_provider_unknown'
  | 'blob_provider_dependency_missing'
  | 'blob_provider_not_configured'
  | 'blob_invalid_mime_type'
  | 'blob_invalid_key'
  | 'blob_write_failed'
  | 'blob_read_failed'
  | 'blob_delete_failed'
  | 'blob_not_found';

export interface BlobError {
  code: BlobErrorCode;
  /** A human-readable detail for logs. Never rendered to a user. */
  detail?: string;
}

export type Result<T, E = BlobError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface PutObjectArgs {
  /** The object key. Must be a safe relative path (see `isSafeKey`). */
  key: string;
  /** The bytes to store. */
  body: Uint8Array;
  /** The MIME type of the bytes. Must be an allow-listed image type. */
  contentType: string;
}

export interface PutObjectResult {
  /** The provider-side object key. */
  key: string;
  /** The URL a browser can render. */
  url: string;
}

export interface BlobStore {
  readonly provider: BlobProvider;
  putObject(args: PutObjectArgs): Promise<Result<PutObjectResult>>;
  getSignedUrl(key: string): Promise<Result<string>>;
  deleteObject(key: string): Promise<Result<true>>;
}

// =====================================================================
// Config
// =====================================================================

/**
 * The MIME types the blob store accepts. Deliberately narrow: the
 * blob store is the ticket-photo pipeline, and every other upload
 * surface in the app already enforces the same allow-list
 * (`lib/crew/upload-photo.ts` + the citizen report route).
 */
export const ALLOWED_BLOB_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedBlobMime = (typeof ALLOWED_BLOB_MIME_TYPES)[number];

/** The maximum size of a single blob (5 MB — same gate as the UI). */
export const MAX_BLOB_BYTES = 5 * 1024 * 1024;

/** The default filesystem directory for the `local` provider. */
export const DEFAULT_LOCAL_BLOB_DIR = '.cityfix-blobs';

export interface BlobConfig {
  provider: BlobProvider;
  /** `local` only — the absolute-or-relative directory to write into. */
  localDir: string;
  /** `local` only — the URL prefix the local files are served under. */
  localBaseUrl: string;
  /** `s3` only. */
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** The public base URL objects are rendered under (`s3` only). */
  publicBaseUrl?: string;
  /** How long a signed URL is valid, in seconds. */
  signedUrlTtlSeconds: number;
}

/**
 * Read the blob configuration from the environment.
 *
 * `BLOB_PROVIDER` selects the implementation. The default is
 * `local` — the app must work with zero configuration in dev.
 */
export function readBlobConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): BlobConfig {
  const raw = (env.BLOB_PROVIDER ?? '').trim().toLowerCase();
  const provider: BlobProvider = raw === 's3' ? 's3' : 'local';
  return {
    provider,
    localDir: (env.BLOB_LOCAL_DIR ?? '').trim() || DEFAULT_LOCAL_BLOB_DIR,
    localBaseUrl: (env.BLOB_LOCAL_BASE_URL ?? '').trim() || '/api/blob',
    endpoint: (env.BLOB_S3_ENDPOINT ?? '').trim() || undefined,
    region: (env.BLOB_S3_REGION ?? '').trim() || 'auto',
    bucket: (env.BLOB_S3_BUCKET ?? '').trim() || undefined,
    accessKeyId: (env.BLOB_S3_ACCESS_KEY_ID ?? '').trim() || undefined,
    secretAccessKey: (env.BLOB_S3_SECRET_ACCESS_KEY ?? '').trim() || undefined,
    publicBaseUrl: (env.BLOB_PUBLIC_BASE_URL ?? '').trim() || undefined,
    signedUrlTtlSeconds: Number(env.BLOB_SIGNED_URL_TTL ?? '900') || 900,
  };
}

// =====================================================================
// Pure helpers (exported for unit tests)
// =====================================================================

/**
 * True when the MIME type is on the allow-list.
 */
export function isAllowedBlobMime(mime: string): mime is AllowedBlobMime {
  return (ALLOWED_BLOB_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * A key is "safe" when it is a relative path with no traversal
 * segment, no leading slash, no backslash, and no empty segment.
 *
 * The local provider writes to the filesystem, so a key like
 * `../../etc/passwd` would escape the blob directory. The S3
 * provider is key-permissive, but the same check applies to both
 * so a key that is valid for one is valid for the other.
 */
export function isSafeKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  if (key.length === 0 || key.length > 512) return false;
  if (key.startsWith('/') || key.startsWith('\\')) return false;
  if (key.includes('\\')) return false;
  if (key.includes('\0')) return false;
  if (key.includes('..')) return false;
  const segments = key.split('/');
  if (segments.some((s) => s.length === 0)) return false;
  return true;
}

/**
 * Build a collision-resistant object key for a photo.
 *
 * Shape: `tickets/<ticketId>/<role>-<random>-<basename>.<ext>`
 *
 * The random segment (16 hex chars from `crypto.randomUUID`)
 * means two uploads of the same file never overwrite each other.
 */
export function buildPhotoKey(args: {
  ticketId: string;
  role: 'citizen' | 'crew';
  mimeType: string;
  originalName?: string;
  randomId?: string;
}): string {
  const ext = extensionForMime(args.mimeType);
  const rand = args.randomId ?? randomId();
  const base = sanitizeBaseName(args.originalName);
  const suffix = base ? `${base}.${ext}` : `photo.${ext}`;
  return `tickets/${args.ticketId}/${args.role}-${rand}-${suffix}`;
}

/**
 * The file extension for an allow-listed MIME type. Unknown types
 * fall back to `bin`.
 */
export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

/**
 * Strip the directory + extension from a user-supplied filename
 * and keep only safe characters. Empty when nothing survives.
 */
export function sanitizeBaseName(name: string | undefined): string {
  if (!name) return '';
  const base = name.split(/[\\/]/).pop() ?? '';
  const withoutExt = base.replace(/\.[^.]+$/, '');
  const safe = withoutExt.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe.slice(0, 64);
}

function randomId(): string {
  // `crypto.randomUUID` is a global in Node 20+ and in every
  // browser the app supports. Fall back to a timestamp + random
  // string if it is missing (very old environments).
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

// =====================================================================
// Local filesystem provider
// =====================================================================

/**
 * The local provider writes the bytes to a directory and serves
 * them back under `localBaseUrl`.
 *
 * The filesystem seam is injectable (`setLocalFs`) so the unit test
 * can run against a real temp directory without touching the
 * repository.
 */
interface LocalFs {
  mkdir(path: string, opts: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  rm(path: string, opts: { force: boolean }): Promise<void>;
  join(...parts: string[]): string;
  dirname(path: string): string;
}

let localFsOverride: LocalFs | null = null;

/**
 * Test-only: inject a filesystem seam. Pass `null` to reset to
 * the Node `fs/promises` implementation.
 */
export function setLocalFs(fs: LocalFs | null): void {
  localFsOverride = fs;
}

async function getLocalFs(): Promise<LocalFs> {
  if (localFsOverride) return localFsOverride;
  const mod = await import('node:fs/promises');
  // `join` / `dirname` live on `node:path`, not `node:fs/promises`.
  const path = await import('node:path');
  return {
    mkdir: (p, opts) => mod.mkdir(p, opts),
    writeFile: (p, data) => mod.writeFile(p, data),
    readFile: async (p) => new Uint8Array(await mod.readFile(p)),
    rm: (p, opts) => mod.rm(p, opts),
    join: (...parts) => path.join(...parts),
    dirname: (p) => path.dirname(p),
  };
}

/**
 * Resolve the on-disk path for a key, refusing any key that
 * escapes the blob directory.
 *
 * The separator is normalised to the platform's so the containment
 * check below works on Windows as well as POSIX. The check is a
 * plain prefix test on the NORMALISED dir + the (already
 * traversal-free) key.
 */
export function resolveLocalPath(dir: string, key: string): string | null {
  if (!isSafeKey(key)) return null;
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  const normalizedDir = dir.replace(/[\\/]+$/, '');
  const path = `${normalizedDir}${sep}${key.split('/').join(sep)}`;
  // Defence in depth: after normalisation the key must still be
  // inside the directory.
  if (!path.startsWith(`${normalizedDir}${sep}`)) return null;
  return path;
}

function localUrlFor(config: BlobConfig, key: string): string {
  const base = config.localBaseUrl.replace(/\/+$/, '');
  return `${base}/${key}`;
}

async function createLocalStore(config: BlobConfig): Promise<BlobStore> {
  return {
    provider: 'local',

    async putObject(args: PutObjectArgs): Promise<Result<PutObjectResult>> {
      if (!isAllowedBlobMime(args.contentType)) {
        return {
          ok: false,
          error: { code: 'blob_invalid_mime_type', detail: args.contentType },
        };
      }
      if (args.body.byteLength > MAX_BLOB_BYTES) {
        return {
          ok: false,
          error: {
            code: 'blob_write_failed',
            detail: `size ${args.body.byteLength} exceeds ${MAX_BLOB_BYTES}`,
          },
        };
      }
      const path = resolveLocalPath(config.localDir, args.key);
      if (!path) {
        return {
          ok: false,
          error: { code: 'blob_invalid_key', detail: args.key },
        };
      }
      try {
        const fs = await getLocalFs();
        await fs.mkdir(fs.dirname(path), { recursive: true });
        await fs.writeFile(path, args.body);
      } catch (e) {
        return {
          ok: false,
          error: { code: 'blob_write_failed', detail: (e as Error).message },
        };
      }
      return {
        ok: true,
        value: { key: args.key, url: localUrlFor(config, args.key) },
      };
    },

    async getSignedUrl(key: string): Promise<Result<string>> {
      // The local provider has no signing. The URL is stable and
      // public within the deployment.
      if (!isSafeKey(key)) {
        return { ok: false, error: { code: 'blob_invalid_key', detail: key } };
      }
      return { ok: true, value: localUrlFor(config, key) };
    },

    async deleteObject(key: string): Promise<Result<true>> {
      const path = resolveLocalPath(config.localDir, key);
      if (!path) {
        return { ok: false, error: { code: 'blob_invalid_key', detail: key } };
      }
      try {
        const fs = await getLocalFs();
        await fs.rm(path, { force: true });
      } catch (e) {
        return {
          ok: false,
          error: { code: 'blob_delete_failed', detail: (e as Error).message },
        };
      }
      return { ok: true, value: true };
    },
  };
}

// =====================================================================
// S3-compatible provider
// =====================================================================

/**
 * The lazily-imported AWS SDK surface this module uses. Declaring
 * it structurally keeps the module importable without the SDK
 * installed.
 */
interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

interface S3Sdk {
  S3Client: new (config: Record<string, unknown>) => S3ClientLike;
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
}

/**
 * The AWS SDK module specifiers, held in variables so TypeScript
 * does not try to resolve them statically. The SDK is an OPTIONAL
 * dependency: the module must import cleanly in an install that
 * has not added `@aws-sdk/client-s3` yet, and only the `s3`
 * provider path requires it.
 */
const S3_CLIENT_MODULE = '@aws-sdk/client-s3';
const S3_PRESIGNER_MODULE = '@aws-sdk/s3-request-presigner';

/**
 * Load `@aws-sdk/client-s3` (and the presigner) on demand.
 *
 * The dynamic import is the whole point: the module must be
 * importable in an install that has not added the AWS SDK yet.
 * The failure is reported as a `Result` error, never as a thrown
 * module-load exception.
 */
async function loadS3Sdk(): Promise<Result<S3Sdk>> {
  try {
    const specifier = S3_CLIENT_MODULE;
    const mod = (await import(
      /* webpackIgnore: true */ specifier
    )) as unknown as Partial<S3Sdk>;
    if (!mod.S3Client || !mod.PutObjectCommand || !mod.DeleteObjectCommand) {
      return {
        ok: false,
        error: {
          code: 'blob_provider_dependency_missing',
          detail: '@aws-sdk/client-s3 did not export the expected symbols',
        },
      };
    }
    return { ok: true, value: mod as S3Sdk };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'blob_provider_dependency_missing',
        detail:
          'install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner: ' +
          (e as Error).message,
      },
    };
  }
}

async function createS3Store(config: BlobConfig): Promise<Result<BlobStore>> {
  if (!config.bucket) {
    return {
      ok: false,
      error: {
        code: 'blob_provider_not_configured',
        detail: 'BLOB_S3_BUCKET is required when BLOB_PROVIDER=s3',
      },
    };
  }
  const sdk = await loadS3Sdk();
  if (!sdk.ok) return sdk;

  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
    sdk.value;

  let client: S3ClientLike;
  try {
    client = new S3Client({
      region: config.region ?? 'auto',
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
      // R2 + MinIO both reject virtual-host-style addressing.
      forcePathStyle: true,
    });
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'blob_provider_not_configured',
        detail: (e as Error).message,
      },
    };
  }

  const publicUrlFor = (key: string): string => {
    if (config.publicBaseUrl) {
      return `${config.publicBaseUrl.replace(/\/+$/, '')}/${key}`;
    }
    if (config.endpoint) {
      return `${config.endpoint.replace(/\/+$/, '')}/${config.bucket}/${key}`;
    }
    return `/${config.bucket}/${key}`;
  };

  const store: BlobStore = {
    provider: 's3',

    async putObject(args: PutObjectArgs): Promise<Result<PutObjectResult>> {
      if (!isAllowedBlobMime(args.contentType)) {
        return {
          ok: false,
          error: { code: 'blob_invalid_mime_type', detail: args.contentType },
        };
      }
      if (!isSafeKey(args.key)) {
        return {
          ok: false,
          error: { code: 'blob_invalid_key', detail: args.key },
        };
      }
      if (args.body.byteLength > MAX_BLOB_BYTES) {
        return {
          ok: false,
          error: {
            code: 'blob_write_failed',
            detail: `size ${args.body.byteLength} exceeds ${MAX_BLOB_BYTES}`,
          },
        };
      }
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: args.key,
            Body: args.body,
            ContentType: args.contentType,
          }),
        );
      } catch (e) {
        return {
          ok: false,
          error: { code: 'blob_write_failed', detail: (e as Error).message },
        };
      }
      return {
        ok: true,
        value: { key: args.key, url: publicUrlFor(args.key) },
      };
    },

    async getSignedUrl(key: string): Promise<Result<string>> {
      if (!isSafeKey(key)) {
        return { ok: false, error: { code: 'blob_invalid_key', detail: key } };
      }
      try {
        // The presigner is an optional companion package. When it
        // is missing, fall back to the stable public URL — the
        // bucket may be public-read (R2 / MinIO are commonly
        // configured that way for photo galleries).
        const presignerSpecifier = S3_PRESIGNER_MODULE;
        const presigner = (await import(
          /* webpackIgnore: true */ presignerSpecifier
        )) as unknown as {
          getSignedUrl?: (
            client: S3ClientLike,
            command: unknown,
            opts: { expiresIn: number },
          ) => Promise<string>;
        };
        if (typeof presigner.getSignedUrl === 'function') {
          const signed = await presigner.getSignedUrl(
            client,
            new GetObjectCommand({ Bucket: config.bucket, Key: key }),
            { expiresIn: config.signedUrlTtlSeconds },
          );
          return { ok: true, value: signed };
        }
      } catch {
        // Fall through to the public URL below.
      }
      return { ok: true, value: publicUrlFor(key) };
    },

    async deleteObject(key: string): Promise<Result<true>> {
      if (!isSafeKey(key)) {
        return { ok: false, error: { code: 'blob_invalid_key', detail: key } };
      }
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
        );
      } catch (e) {
        return {
          ok: false,
          error: { code: 'blob_delete_failed', detail: (e as Error).message },
        };
      }
      return { ok: true, value: true };
    },
  };

  return { ok: true, value: store };
}

// =====================================================================
// Public API
// =====================================================================

/**
 * The cached store instance. The config is read once per process
 * (the env does not change at runtime) and the provider is created
 * once.
 */
let cachedStore: BlobStore | null = null;
let cachedStoreKey: string | null = null;

/**
 * Get the active blob store.
 *
 * The store is created lazily on first use and cached. Pass
 * `config` to force a specific configuration (the unit test uses
 * this to build an isolated store).
 */
export async function getBlobStore(
  config?: BlobConfig,
): Promise<Result<BlobStore>> {
  const effective = config ?? readBlobConfig();
  if (cachedStore && cachedStoreKey === configKey(effective)) {
    return { ok: true, value: cachedStore };
  }
  let store: BlobStore;
  if (effective.provider === 's3') {
    const s3 = await createS3Store(effective);
    if (!s3.ok) return s3;
    store = s3.value;
  } else {
    store = await createLocalStore(effective);
  }
  if (!config) {
    cachedStore = store;
    cachedStoreKey = configKey(effective);
  }
  return { ok: true, value: store };
}

/**
 * Reset the cached store. Test-only.
 */
export function resetBlobStoreCache(): void {
  cachedStore = null;
  cachedStoreKey = null;
}

function configKey(c: BlobConfig): string {
  return [
    c.provider,
    c.localDir,
    c.localBaseUrl,
    c.endpoint ?? '',
    c.region ?? '',
    c.bucket ?? '',
    c.accessKeyId ?? '',
    c.secretAccessKey ?? '',
    c.publicBaseUrl ?? '',
    c.signedUrlTtlSeconds,
  ].join('|');
}

/**
 * Store bytes and get back the key + URL.
 *
 * Never throws — returns a `Result`.
 */
export async function putObject(
  args: PutObjectArgs,
): Promise<Result<PutObjectResult>> {
  const store = await getBlobStore();
  if (!store.ok) return store;
  return store.value.putObject(args);
}

/**
 * Get a URL for an existing object. Never throws.
 */
export async function getSignedUrl(key: string): Promise<Result<string>> {
  const store = await getBlobStore();
  if (!store.ok) return store;
  return store.value.getSignedUrl(key);
}

/**
 * Delete an object. Never throws.
 */
export async function deleteObject(key: string): Promise<Result<true>> {
  const store = await getBlobStore();
  if (!store.ok) return store;
  return store.value.deleteObject(key);
}

/**
 * True when the deployment is configured to use a real blob
 * provider (i.e. NOT the inline-data-URL fallback).
 *
 * The photo pipeline uses this to decide whether to persist the
 * bytes in the blob store or to keep the v1 inline data-URL
 * behaviour. When the blob provider is `local` AND unconfigured
 * (no `BLOB_LOCAL_DIR` set, i.e. the default), the inline
 * behaviour is preserved so the existing Playwright visual
 * baselines stay byte-identical.
 *
 * ── This function lives in `lib/storage/blob-provider.ts` ──────
 *
 * It is re-exported here for server-side convenience, but the
 * IMPLEMENTATION is in the client-safe module. Client components
 * MUST import it from `lib/storage/blob-provider.ts` — importing
 * from this file drags in `next/headers` and breaks the build.
 */
export { isBlobProviderActive } from '@/lib/storage/blob-provider';

/**
 * Convert an `ApiError` into the module's error shape. Used by the
 * route layer so the failure path matches the repo's convention.
 */
export function fromApiError(e: unknown): BlobError {
  if (e instanceof ApiError) {
    return { code: 'blob_write_failed', detail: e.code };
  }
  return { code: 'blob_write_failed', detail: (e as Error).message };
}
