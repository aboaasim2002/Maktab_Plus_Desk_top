import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit } from '@/lib/auth';
import { one } from '@/lib/postgres';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'services.manage');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const name = String((await request.json()).name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'اسم الخدمة مطلوب' }, { status: 400 });
  const row = await one(`
    UPDATE services SET name=$1 WHERE id=$2 AND organization_id=$3 RETURNING id
  `, [name, id, organizationId]);
  if (!row) return NextResponse.json({ error: 'الخدمة غير موجودة' }, { status: 404 });
  await audit(auth.user, 'update', 'service', id, { name });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'services.manage');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const service = await one<{ name: string }>(`
    UPDATE services SET is_active=false
    WHERE id=$1 AND organization_id=$2 RETURNING name
  `, [id, organizationId]);
  if (!service) return NextResponse.json({ error: 'الخدمة غير موجودة' }, { status: 404 });
  await audit(auth.user, 'delete', 'service', id, service);
  return NextResponse.json({ success: true });
}
