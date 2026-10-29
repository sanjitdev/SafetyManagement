/**
 * POST /api/v1/crew/tickets/[id]/photos
 *
 * CREW-003 (Intent 004, Unit 003): the "Capture after
 * photo" flow. The crew member pastes a URL (the v1
 * surface; v1.1 wires the real camera / file picker)
 * and the route creates a new `TicketPhoto` row with
 * `uploadedByRole: 'crew'`.
 *
 * The route writes three side-effects per upload:
 *
 *   1. A `TicketPhoto` row with `uploadedByRole: 'crew'`
 *      (Bolt 007-001 — the new "after photo" source of
 *      truth; the legacy `Ticket.photoUrls[]` array is gone).
 *   2. A `TicketTrailEntry` with
 *      `note: 'after_photo:<url>'`. The
 *      `after_photo:` prefix is a stable marker the
 *      audit pipeline can grep on; the citizen
 *      serializer rewrites these to a localized
 *      "After photo added" string in the trail view
 *      (Bolt 007-001 — the citizen branch never surfaces
 *      the raw URL).
 *   3. An `AuditEntry` with action
 *      `ticket.after_photo_added`, recording the new
 *      `photoId` + `uploadedByRole`.
 *
 * Out-of-scope ticket id → 404 (NOT 403).
 *
 * Backend-agnostic: works on Prisma or the in-memory
 * dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { ApiError, requireRole, requireSameCity, requireScope } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/platform/audit';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import {
  buildPhotoKey,
  isAllowedBlobMime,
  isBlobProviderActive,
  putObject,
} from '@/lib/storage/blob';
import { base64ToBytes } from '@/lib/crew/upload-photo';
import { isAcceptablePhotoUrl } from '@/lib/format/photo-url';

/**
 * The photo payload has TWO shapes (see the wire contract in
 * `lib/crew/upload-photo.ts`):
 *
 *   - `{ url }` — the inline data URL (the v1 default; the blob
 *     provider is NOT configured). The bytes stay in the URL.
 *   - `{ dataBase64, mimeType, fileName? }` — the blob path. The
 *     route writes the bytes to the blob provider and persists
 *     the `storageKey` / `mimeType` / `sizeBytes` metadata
 *     alongside the rendered URL.
 *
 * The inline `url` accepts the same shapes the renderer can display
 * (inline image data URL, absolute http(s) URL, or root-relative
 * path). The previous boundary was `z.string().url()`, which in Zod
 * 3.x parses ANY absolute scheme: it rejected the root-relative
 * `/api/blob/…` shape, and it ACCEPTED `javascript:` / `data:text/html`
 * — a stored-URL XSS vector, since the URL is persisted verbatim and
 * later handed to `<img src>` / `background-image: url(...)`.
 */
const PhotoInput = z.union([
  z.object({
    url: z
      .string()
      .max(2_000_000)
      .refine(isAcceptablePhotoUrl, {
        message:
          'photo URL must be an inline image data URL, an http(s) URL, or a root-relative path',
      }),
  }),
  z.object({
    dataBase64: z.string().min(1).max(8_000_000),
    mimeType: z.string().min(1).max(100),
    fileName: z.string().max(255).optional(),
  }),
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'crew');
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PhotoInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ticket = await db.ticket.findUnique({
    where: { id },
  });
  if (!ticket) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Load the joined ticket (category → department) so the
  // scope check can compare on the same `departmentId` the
  // route is authorised against. `db.ticket.findUnique` does
  // not include the category join; `getTicketWithTrail` does.
  // Bolt 007-001: this fix is what makes the after-photo
  // route usable for crews whose session.departmentId is set.
  const withTrail = await getTicketWithTrail(id);
  if (!withTrail) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Out-of-scope ticket → 404 (NOT 403).
  try {
    requireSameCity(session!, ticket.cityId);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    requireScope(
      session!,
      ticket.wardId,
      withTrail.departmentId ?? null,
    );
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (ticket.assignedCrewId !== session!.userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // ── Store the photo ──────────────────────────────────────────
  //
  // Blob path: the client sent raw bytes. The route writes them
  // to the blob provider and persists the metadata. If the write
  // fails the route returns 502 — the photo is NOT recorded with
  // a broken URL.
  //
  // Inline path: the client sent a data URL (or an external
  // URL). Nothing to store; the URL IS the photo.
  let photoUrl: string;
  let storageKey: string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number | null = null;

  if ('dataBase64' in parsed.data) {
    if (!isAllowedBlobMime(parsed.data.mimeType)) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(parsed.data.dataBase64);
    } catch {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const key = buildPhotoKey({
      ticketId: ticket.id,
      role: 'crew',
      mimeType: parsed.data.mimeType,
      originalName: parsed.data.fileName,
    });
    const stored = await putObject({
      key,
      body: bytes,
      contentType: parsed.data.mimeType,
    });
    if (!stored.ok) {
      return NextResponse.json(
        { error: 'photo_storage_failed', detail: stored.error.code },
        { status: 502 },
      );
    }
    photoUrl = stored.value.url;
    storageKey = stored.value.key;
    mimeType = parsed.data.mimeType;
    sizeBytes = bytes.byteLength;
  } else {
    photoUrl = parsed.data.url;
  }

  // Bolt 007-001: create the new `TicketPhoto` row with
  // `uploadedByRole: 'crew'`. The `db.ticketPhoto.create` helper
  // works on both Prisma + dev store; the dev store's
  // `ticketPhotos` Map is keyed by ticketId and the new row is
  // sorted into the list by `uploadedAt` ASC.
  const createdPhoto = await db.ticketPhoto.create({
    data: {
      ticketId: ticket.id,
      url: photoUrl,
      uploadedByRole: 'crew',
      ...(storageKey ? { storageKey } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(sizeBytes != null ? { sizeBytes } : {}),
    },
  });
  await db.trail.create({
    data: {
      ticketId: ticket.id,
      toStatus: ticket.status,
      actorId: session!.userId,
      note: `after_photo:${photoUrl}`,
    },
  });
  await writeAudit({
    entityType: 'ticket',
    entityId: ticket.id,
    action: 'ticket.after_photo_added',
    actorId: session!.userId,
    afterValue: {
      photoId: createdPhoto.id,
      url: photoUrl,
      uploadedByRole: 'crew',
      ...(storageKey ? { storageKey } : {}),
    },
  });

  const refreshed = await getTicketWithTrail(ticket.id);
  if (!refreshed) {
    return NextResponse.json(
      { error: 'post_photo_fetch_failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ticket: serializeTicketForRole(
      refreshed,
      refreshed.trail,
      session!.role,
      'bn',
    ),
  });
}
