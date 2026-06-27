import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit } from '@/lib/auth';
import { one, query } from '@/lib/postgres';

export async function GET(request: Request) {
  const auth = await authorize(request, 'invoices.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  return NextResponse.json(await query(
    'SELECT * FROM services WHERE organization_id=$1 AND is_active=true ORDER BY name',
    [organizationId]
  ));
}

export async function POST(request: Request) {
  const auth = await authorize(request, 'services.manage');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const name = String((await request.json()).name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'اسم الخدمة مطلوب' }, { status: 400 });
  const row = await one(`
    INSERT INTO services (organization_id, name, created_by)
    VALUES ($1,$2,$3)
    ON CONFLICT (organization_id, (lower(name)))
    DO UPDATE SET is_active=true
    RETURNING *
  `, [organizationId, name, auth.user.id]);
  await audit(auth.user, 'create', 'service', String(row?.id), { name });
  return NextResponse.json(row, { status: 201 });
}
