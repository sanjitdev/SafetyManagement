/**
 * Blob provider detection (lib/storage/blob-provider.ts).
 *
 * ── Why this module exists ─────────────────────────────────────
 *
 * `lib/storage/blob.ts` is a SERVER-ONLY module: its top-level
 * `import { ApiError } from '@/lib/auth/guards'` pulls in
 * `lib/db-switch.ts` → `lib/auth/session.ts` → `next/headers`,
 * which is server-only by design.
 *
 * Two `'use client'` components need to know whether a real blob
 * provider is configured:
 *
 *   - `app/report/(create)/photo/page.tsx` (citizen photo capture)
 *   - `app/crew/tickets/[id]/page.tsx` (crew after-photo upload)
 *
 * Importing `lib/storage/blob.ts` from a client component breaks the
 * Next.js build:
 *
 *   > "You're importing a component that needs next/headers. That
 *   >  only works in a Server Component which is not supported in the
 *   >  pages/ directory."
 *
 * So the pure, dependency-free part lives here, and the client
 * components import from THIS module. `lib/storage/blob.ts` re-exports
 * the same function so server-side callers have one obvious import.
 *
 * ── What lives here ────────────────────────────────────────────
 *
 * Only functions that are safe in a browser bundle:
 *   - no `next/*` imports
 *   - no `node:fs` / `node:path` imports
 *   - no Prisma import
 *   - no environment secrets beyond the two documented `BLOB_*` vars
 *     it reads (and it reads them from an explicit `env` argument, so
 *     the caller controls what is visible)
 */

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
 * Safe to call from a client component — it reads only the two
 * `BLOB_*` variables, and in the browser those are simply
 * `undefined`, which correctly yields `false` (inline fallback).
 */
export function isBlobProviderActive(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const provider = (env.BLOB_PROVIDER ?? '').trim().toLowerCase();
  if (provider === 's3') return true;
  if (provider === 'local') {
    // An explicitly-configured local directory means the operator
    // WANTS the bytes on disk.
    return (env.BLOB_LOCAL_DIR ?? '').trim().length > 0;
  }
  return false;
}
