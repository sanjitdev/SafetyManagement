/**
 * GET /api/v1/dispatcher/reassign-options
 *
 * Bolt 009-005 (Wave 4) — the reference data the dispatcher's
 * REASSIGN panel needs: the wards and categories a ticket can be
 * moved to.
 *
 * ── WHY THIS ENDPOINT EXISTS ────────────────────────────────────
 *
 * The reassign panel used to read its options from two hard-coded
 * constants in the page:
 *
 *   const WARD_OPTIONS = [
 *     { id: 'ward_14', label: 'Ward 14 — Mirpur' },
 *     { id: 'ward_15', label: 'Ward 15 — Cantonment' },
 *   ];
 *   const CATEGORY_OPTIONS = [
 *     { id: 'cat_streetlight', label: 'Broken streetlight' },
 *     ...
 *   ];
 *
 * Those lists are wrong in three ways, and each one produces a
 * control that cannot do its job:
 *
 *   1. **They are a snapshot, not the truth.** The dev store seeds
 *      two wards and one category; real Postgres seeds 50 wards
 *      and a category table that changes. A dropdown that lists
 *      two of fifty wards is a dropdown that cannot reach the
 *      other forty-eight.
 *   2. **They are not scoped to the dispatcher's city.** The
 *      reassign PATCH refuses a cross-city move (403
 *      `cross_city_access_denied`), so an option list containing
 *      another city's wards is a list of choices that are all
 *      guaranteed to fail.
 *   3. **They are not scoped to the dispatcher's ward.** A
 *      ward-bound dispatcher may only hold tickets in their own
 *      ward, so a ward they cannot hold is not a choice they can
 *      make.
 *
 * The rule the whole project runs on: a control must never offer
 * a choice the API cannot serve. So the list is read from the
 * store, narrowed to the dispatcher's city, and — for a
 * ward-bound dispatcher — to the ward they hold.
 *
 * ── THE CATEGORY LIST IS NOT WARD-FILTERED ─────────────────────
 *
 * Wards are an authorisation boundary; categories are not. A
 * category belongs to a CITY, and any dispatcher in that city may
 * move a ticket into any of its categories — the department scope
 * decides what they can see in the QUEUE, not what they may
 * RECLASSIFY a ticket they already hold. Filtering the category
 * list by the session's department would leave a streetlight
 * dispatcher unable to reclassify a streetlight ticket as
 * "garbage not collected" for the right crew.
 *
 * Backend-agnostic: works on Prisma or the in-memory dev store.
 */

import { NextResponse } from 'next/server';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';

export async function GET() {
  const session = await getActiveSession();
  try {
    requireRole(session, 'dispatcher');
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const cityId = session!.cityId;

  const [wards, categories] = await Promise.all([
    db.ward.findMany({ where: { cityId } }),
    db.category.findMany({ where: { cityId } }),
  ]);

  // A ward-bound dispatcher can only reach their own ward. The
  // list is narrowed, not filtered to nothing — the reassign panel
  // still needs the CURRENT ward to appear as the selected value.
  const reachableWards = (
    session!.wardId
      ? wards.filter((w) => w.id === session!.wardId)
      : wards
  )
    .map((w) => ({
      id: w.id,
      number: w.number,
      name: w.name,
      nameBn: w.nameBn,
    }))
    .sort((a, b) => a.number - b.number);

  const reachableCategories = categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      nameBn: c.nameBn,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    wards: reachableWards,
    categories: reachableCategories,
    /**
     * Whether the ward list is bound to a single ward. The panel
     * says so rather than showing a one-row control that looks
     * broken.
     */
    wardScoped: Boolean(session!.wardId),
  });
}
