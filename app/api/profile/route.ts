import { NextRequest, NextResponse } from 'next/server';
import { db, getActiveSession } from '@/lib/db-switch';

function serializeProfile(user: NonNullable<Awaited<ReturnType<typeof db.user.findUnique>>>) {
  return {
    id: user.id,
    name: user.name,
    nameBn: user.nameBn ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
    role: user.role,
    cityId: user.cityId,
  };
}

export async function GET() {
  const session = await getActiveSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  return NextResponse.json({ profile: serializeProfile(user) });
}

export async function PUT(request: NextRequest) {
  const session = await getActiveSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'invalid_profile' }, { status: 400 });
  }

  const body = payload as { name?: unknown; nameBn?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const nameBnValue = body.nameBn === null ? '' : body.nameBn;
  const nameBn = typeof nameBnValue === 'string' ? nameBnValue.trim() : null;

  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }
  if (nameBn === null || nameBn.length > 80 || /[\u0000-\u001f\u007f]/.test(nameBn)) {
    return NextResponse.json({ error: 'invalid_name_bn' }, { status: 400 });
  }

  const user = await db.user.updateProfile({
    where: { id: session.userId },
    data: { name, nameBn: nameBn || null },
  });

  return NextResponse.json({ profile: serializeProfile(user) });
}
