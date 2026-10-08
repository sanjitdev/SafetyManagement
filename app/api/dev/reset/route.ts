/**
 * POST /api/dev/reset — wipe the in-memory dev store and re-seed it.
 *
 * Dev-only: returns 404 unless CITYFIX_DEV_STORE === '1'. Useful for
 * stepping through the demo multiple times.
 */

import { NextResponse } from 'next/server';
import { isDevStore, resetStore } from '@/lib/dev-store';

export async function POST() {
  if (!isDevStore()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  resetStore();
  return NextResponse.json({ ok: true });
}
