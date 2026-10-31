/**
 * POST /api/tickets — citizen creates a new report.
 *
 * PLAT-REQ-004: dedup check (prompt, not auto-merge).
 * PLAT-REQ-005: initial trail entry (status=submitted, actor=reporter).
 * PLAT-REQ-007: audit log entry.
 *
 * Returns either:
 *   - 201 with the created ticket (no dedup match)
 *   - 200 with `{dedup_match: true, existing_ticket: {...}}` (no creation)
 *
 * The citizen-facing serializer hides internal fields (PLAT-REQ-001).
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession, getTicketWithTrail } from '@/lib/db-switch';
import { requireRole } from '@/lib/auth/guards';
import { checkDedup } from '@/lib/platform/dedup';
import { writeAudit } from '@/lib/platform/audit';
import { sendTicketPush } from '@/lib/platform/push';
import { serializeTicketForRole } from '@/lib/serializers/ticket';
import {
  buildPhotoKey,
  isAllowedBlobMime,
  putObject,
} from '@/lib/storage/blob';
import { base64ToBytes } from '@/lib/crew/upload-photo';
import { isAcceptablePhotoUrl, MAX_PHOTO_URL_CHARS } from '@/lib/format/photo-url';
import { hasOversizedPhoto } from '@/lib/photo/payload';

/**
 * A photo URL accepted at the API boundary.
 *
 * The citizen's photo picker produces an inline `data:image/…` URL
 * by default (no blob provider is configured out of the box), and
 * the blob providers produce either an absolute `https://` URL or a
 * root-relative `/api/blob/…` path.
 *
 * The previous boundary was `z.string().url()`, which is NOT a safe
 * contract for this field in Zod 3.x:
 *
 *   - It REJECTED the root-relative `/api/blob/…` shape — the local
 *     blob provider's URL — so a report filed with the local
 *     provider failed validation with HTTP 400 and the photo was
 *     never persisted.
 *   - It ACCEPTED `javascript:` and `data:text/html` URLs. Zod's
 *     `url()` check is `new URL(value)`, which parses ANY absolute
 *     scheme, so a stored URL could carry a script scheme — a
 *     stored-URL XSS vector that is persisted verbatim and later
 *     handed to `<img src>` / `background-image: url(...)`.
 *
 * `isAcceptablePhotoUrl` accepts exactly the shapes the renderer can
 * display (see `lib/format/photo-url.ts`) and rejects script
 * schemes, keeping the write and read sides in agreement: a URL
 * shape the API accepts is a shape the renderer can display, and
 * nothing else.
 */
const PhotoUrl = z
  .string()
  .max(MAX_PHOTO_URL_CHARS)
  .refine(isAcceptablePhotoUrl, {
    message:
      'photo URL must be an inline image data URL, an http(s) URL, or a root-relative path',
  });

const CreateTicketInput = z.object({
  cityId: z.string().min(1),
  wardId: z.string().min(1),
  categoryId: z.string().min(1),
  locationLat: z.number().min(-90).max(90),
  locationLng: z.number().min(-180).max(180),
  locationLabel: z.string().max(500).optional(),
  locationLabelBn: z.string().max(500).optional(),
  note: z.string().max(2000).optional(),
  photoUrls: z.array(PhotoUrl).max(5).default([]),
  // WO-000 platform layer — the blob-storage path for the
  // citizen's photos. When a blob provider is configured the
  // client sends the raw bytes (base64) instead of inline data
  // URLs; the route stores them via the blob provider and
  // persists the metadata. Both shapes are accepted so the
  // client can pick at runtime.
  photoBlobs: z
    .array(
      z.object({
        dataBase64: z.string().min(1).max(MAX_PHOTO_URL_CHARS),
        mimeType: z.string().min(1).max(100),
        fileName: z.string().max(255).optional(),
      }),
    )
    .max(5)
    .default([]),
  // When the citizen declines a dedup-match in /report/summary, they
  // re-POST with this set to the existing ticket id. We log it as an
  // audit event so the WO-002 dispatcher can surface possible duplicates
  // for manual review (privacy-respecting, no auto-merge).
  dedupDeclineTicketId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getActiveSession();
  try {
    requireRole(session, 'citizen');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  // ── Photo size pre-check ─────────────────────────────────────
  // The Zod `.max()` failure below is indistinguishable from any
  // other invalid input (a long `note` produces the identical
  // `too_big` issue code), so the dedicated `photo_too_large` code
  // is decided on the RAW payload, where the photo fields are still
  // addressable by name. Status 413 is the honest signal.
  //
  // The client downscales photos to 1600px/q80 before sending
  // (`lib/photo/downscale.ts`), so this only fires for a client
  // that skipped the downscale or for a pathological image.
  if (hasOversizedPhoto(body)) {
    return NextResponse.json(
      { error: 'photo_too_large', max_chars: MAX_PHOTO_URL_CHARS },
      { status: 413 },
    );
  }
  const parsed = CreateTicketInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Per-city isolation: citizens can only file in their own city.
  if (input.cityId !== session!.cityId) {
    return NextResponse.json({ error: 'cross_city_forbidden' }, { status: 403 });
  }

  // The ward and the category are client-supplied. A ticket filed
  // against a ward from another city (or a category from another city)
  // would land outside every dispatcher's scope filter — invisible to
  // the city that owns it — so validate both against the session's city
  // before creating anything.
  const [ward, category] = await Promise.all([
    db.ward.findUnique({ where: { id: input.wardId } }),
    db.category.findUnique({ where: { id: input.categoryId } }),
  ]);
  if (!ward || ward.cityId !== session!.cityId) {
    return NextResponse.json({ error: 'ward_not_in_city' }, { status: 400 });
  }
  if (!category || category.cityId !== session!.cityId) {
    return NextResponse.json({ error: 'category_not_in_city' }, { status: 400 });
  }

  // PLAT-REQ-004 dedup check. If the citizen has already seen a dedup
  // match in /report/summary and explicitly declined it, skip the dedup
  // engine for this attempt — the decline is logged below as its own
  // audit event so the city-side review queue can surface it.
  let dup: { existingTicketId: string; distanceMeters: number; existingTicketStatus: string } | null = null;
  if (!input.dedupDeclineTicketId) {
    dup = await checkDedup({
      cityId: input.cityId,
      categoryId: input.categoryId,
      locationLat: input.locationLat,
      locationLng: input.locationLng,
    });
  }
  if (dup) {
    await writeAudit({
      entityType: 'ticket',
      entityId: dup.existingTicketId,
      action: 'ticket.dedup_detected',
      actorId: session!.userId,
      afterValue: {
        candidateLat: input.locationLat,
        candidateLng: input.locationLng,
        distanceMeters: dup.distanceMeters,
      },
    });
    return NextResponse.json(
      {
        dedup_match: true,
        existing_ticket_id: dup.existingTicketId,
        distance_meters: dup.distanceMeters,
        existing_status: dup.existingTicketStatus,
      },
      { status: 200 },
    );
  }

  // Create the ticket + initial trail entry.
  const created = await db.ticket.create({
    data: {
      cityId: input.cityId,
      wardId: input.wardId,
      categoryId: input.categoryId,
      reporterId: session!.userId,
      status: 'submitted',
      locationLat: input.locationLat,
      locationLng: input.locationLng,
      locationLabel: input.locationLabel ?? null,
      locationLabelBn: input.locationLabelBn ?? null,
      note: input.note ?? null,
    },
  });

  // Bolt 007-001: photos are no longer stored as a flat array on
  // the ticket; they live in `TicketPhoto` rows with `uploadedByRole`
  // discriminator. The citizen's submission writes one `citizen` row
  // per uploaded URL.
  //
  // WO-000 platform layer: when the client sent raw bytes
  // (`photoBlobs`), the route writes them to the blob provider and
  // records the metadata. The inline `photoUrls` path is unchanged
  // (and is what the dev + visual-baseline path uses).
  for (const url of input.photoUrls) {
    await db.ticketPhoto.create({
      data: {
        ticketId: created.id,
        url,
        uploadedByRole: 'citizen',
      },
    });
  }
  for (const blob of input.photoBlobs) {
    if (!isAllowedBlobMime(blob.mimeType)) {
      // A photo with a disallowed MIME type is a client bug (the
      // report form only offers image types). Skip it rather than
      // failing the whole submission — the citizen's report is
      // more valuable than their photo.
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(blob.dataBase64);
    } catch {
      continue;
    }
    const key = buildPhotoKey({
      ticketId: created.id,
      role: 'citizen',
      mimeType: blob.mimeType,
      originalName: blob.fileName,
    });
    const stored = await putObject({
      key,
      body: bytes,
      contentType: blob.mimeType,
    });
    if (!stored.ok) {
      // The blob write failed. The ticket is already created —
      // do NOT fail the submission (the citizen's report is the
      // valuable artefact); log the failure so the city can
      // re-request the photo later.
      await writeAudit({
        entityType: 'ticket',
        entityId: created.id,
        action: 'ticket.photo_storage_failed',
        actorId: session!.userId,
        afterValue: { code: stored.error.code, key },
      });
      continue;
    }
    await db.ticketPhoto.create({
      data: {
        ticketId: created.id,
        url: stored.value.url,
        uploadedByRole: 'citizen',
        storageKey: stored.value.key,
        mimeType: blob.mimeType,
        sizeBytes: bytes.byteLength,
      },
    });
  }

  await db.trail.create({
    data: {
      ticketId: created.id,
      toStatus: 'submitted',
      actorId: session!.userId,
    },
  });

  await writeAudit({
    entityType: 'ticket',
    entityId: created.id,
    action: 'ticket.create',
    actorId: session!.userId,
    afterValue: {
      cityId: created.cityId,
      wardId: created.wardId,
      categoryId: created.categoryId,
    },
  });

  // If the citizen declined a dedup match and re-submitted, log a separate
  // event the city-side review queue can surface in WO-002. The declined
  // ticket id and the new one stay linked by `(cityId, categoryId, coords)`.
  // The decline ALSO creates a `DedupFlag` row (DISP-006) so the
  // dispatcher can confirm / dismiss from /dispatcher/dedup.
  if (input.dedupDeclineTicketId) {
    await writeAudit({
      entityType: 'ticket',
      entityId: created.id,
      action: 'ticket.dedup_declined',
      actorId: session!.userId,
      afterValue: {
        declinedMatchTicketId: input.dedupDeclineTicketId,
      },
    });
    // Look up the original ticket so we can link the flag to it.
    const original = await db.ticket.findUnique({
      where: { id: input.dedupDeclineTicketId },
    });
    if (original) {
      // The flag's scope fields MUST come from the SAME ticket — the
      // newly-created one. `requireScope` (lib/auth/guards.ts) demands
      // an exact match on BOTH wardId and departmentId, and the
      // dispatcher's dedup queue filters on the same pair. Taking the
      // ward from the new ticket but the department from the ORIGINAL
      // ticket's category produced a flag whose scope matched no real
      // dispatcher: the flagged ticket lives in one ward while the
      // department came from another ticket's category, so the flag
      // was listed for nobody and could not be confirmed or dismissed
      // by anyone who could see it.
      //
      // The flagged ticket is the one the dispatcher has to act on, so
      // its ward and its category's department are the flag's scope.
      const flaggedCategory = await db.category.findUnique({
        where: { id: created.categoryId },
      });
      await db.dedupFlag.create({
        data: {
          cityId: created.cityId,
          wardId: created.wardId,
          departmentId: flaggedCategory?.departmentId ?? null,
          ticketId: created.id,
          originalTicketId: original.id,
          citizenReason: null,
        },
      });
    }
  }

  // Best-effort: subscribe the reporter for push on this ticket. The push
  // module stub-logs the fan-out; v1.1 wires the actual wire call.
  await sendTicketPush({ ticketId: created.id, toStatus: 'submitted' }).catch(
    () => undefined,
  );

  const withTrail = await getTicketWithTrail(created.id);
  if (!withTrail) {
    return NextResponse.json({ error: 'post_create_fetch_failed' }, { status: 500 });
  }

  return NextResponse.json(
    {
      ticket: serializeTicketForRole(
        withTrail,
        withTrail.trail,
        session!.role,
        'bn',
      ),
    },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }
  if (session.role !== 'citizen') {
    return NextResponse.json({ error: 'role_not_supported' }, { status: 403 });
  }
  const tickets = await db.ticket.findMany({
    where: { cityId: session.cityId, reporterId: session.userId },
    orderBy: { createdAt: 'desc' },
  });
  const serialized = await Promise.all(
    tickets.map(async (t) => {
      const withTrail = await getTicketWithTrail(t.id);
      if (!withTrail) {
        return serializeTicketForRole(
          t as never,
          [],
          session.role,
          'bn',
        );
      }
      return serializeTicketForRole(
        withTrail,
        withTrail.trail,
        session.role,
        'bn',
      );
    }),
  );
  return NextResponse.json({ tickets: serialized });
}
