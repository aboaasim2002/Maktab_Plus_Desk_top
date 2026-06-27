import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit } from '@/lib/auth';
import { execute, one } from '@/lib/postgres';

function sessionToken(request: Request): string | null {
  return (request.headers.get('cookie') ?? '')
    .split(';').map((part) => part.trim())
    .find((part) => part.startsWith('office_session='))
    ?.split('=').slice(1).join('=') ?? null;
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'هذه العملية خاصة بمالك المنصة' }, { status: 403 });
  }
  const organizationId = String((await request.json()).organization_id ?? '');
  const organization = await one<{ id: string; name: string }>(
    'SELECT id, name FROM organizations WHERE id=$1',
    [organizationId]
  );
  const token = sessionToken(request);
  if (!organization || !token) {
    return NextResponse.json({ error: 'المنشأة أو الجلسة غير صالحة' }, { status: 404 });
  }
  await execute(
    'UPDATE sessions SET active_organization_id=$1 WHERE token=$2 AND user_id=$3',
    [organizationId, token, auth.user.id]
  );
  await audit(
    { id: auth.user.id, organization_id: organizationId },
    'enter_organization',
    'organization',
    organizationId,
    { name: organization.name }
  );
  return NextResponse.json({ success: true, organization });
}

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'هذه العملية خاصة بمالك المنصة' }, { status: 403 });
  }
  const token = sessionToken(request);
  if (!token) return NextResponse.json({ error: 'الجلسة غير صالحة' }, { status: 400 });
  const previousOrganizationId = auth.user.organization_id;
  await execute(
    'UPDATE sessions SET active_organization_id=NULL WHERE token=$1 AND user_id=$2',
    [token, auth.user.id]
  );
  await audit(auth.user, 'leave_organization', 'organization', previousOrganizationId);
  return NextResponse.json({ success: true });
}
