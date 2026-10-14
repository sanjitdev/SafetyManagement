-- Bolt 007-001 (Intent 007 — Citizen Resolution Visibility)
-- Stage 4 (Implement). Migration shape finalized in the bolt's
-- technical design as Option A: an additive `TicketPhoto` table
-- with `uploadedByRole` discriminator + `uploadedAt` timestamp.
--
-- This migration:
--   1. Creates the new `TicketPhoto` table with a (ticketId, uploadedAt)
--      index for the canonical ordering the citizen detail page renders.
--   2. Drops `Ticket.photoUrls: String[]` (the legacy un-typed array).
--   3. Backfills the new table from the existing array — every pre-existing
--      photo is bucketed as `uploadedByRole='citizen'` because v1 had no
--      way to distinguish citizen vs crew photos at the row level.
--      (Crew photos only started being written with the Bolt 007-001
--      PR; before this migration there are no crew photos in the column.)
--
-- Marker format is unchanged: the `after_photo:<url>` prefix on
-- `TicketTrailEntry.note` is stable per Bolt 004-003 line 113-117.

-- CreateTable
CREATE TABLE "TicketPhoto" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedByRole" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketPhoto_ticketId_uploadedAt_idx" ON "TicketPhoto"("ticketId", "uploadedAt");

-- Backfill: copy every existing Ticket.photoUrls[] element into a new
-- TicketPhoto row with uploadedByRole='citizen'. v1 had no way to
-- distinguish citizen vs crew photos at the array level, so every
-- pre-existing photo is conservatively bucketed as citizen (Before group).
INSERT INTO "TicketPhoto" ("id", "ticketId", "url", "uploadedByRole", "uploadedAt")
SELECT
    'tph_bf_' || substr(md5(random()::text), 1, 12) AS id,
    t."id" AS "ticketId",
    url AS "url",
    'citizen' AS "uploadedByRole",
    t."createdAt" AS "uploadedAt"
FROM "Ticket" t,
LATERAL unnest(t."photoUrls") AS url
WHERE array_length(t."photoUrls", 1) > 0;

-- AddForeignKey
ALTER TABLE "TicketPhoto" ADD CONSTRAINT "TicketPhoto_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE;

-- DropColumn (the legacy array goes away in the same PR that adds the
-- new table). The TicketLike type in lib/serializers/ticket.ts has
-- already been updated to read from `TicketPhoto` rows instead.
ALTER TABLE "Ticket" DROP COLUMN "photoUrls";