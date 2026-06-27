import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { execute, one, query } from '@/lib/postgres';

function normalizePhone(value: unknown): string {
  return Array.from(String(value ?? ''), (character) => {
    const code = character.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return character;
  }).join('').replace(/\D/g, '');
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'clients.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const ownOnly = isOwnDataOnly(auth.user);
  const row = await one(`
    SELECT cl.* FROM clients cl
    WHERE cl.id=$1 AND cl.organization_id=$2
      ${ownOnly ? `AND (
        cl.created_by=$3
        OR EXISTS (SELECT 1 FROM contracts c WHERE c.client_id=cl.id AND c.created_by=$3)
        OR EXISTS (SELECT 1 FROM vouchers v WHERE v.client_id=cl.id AND v.created_by=$3)
      )` : ''}
  `, ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId]);
  if (!row) return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'clients.edit');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const { name, phone, type, opening_balance, notes } = await request.json();
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const existing = await query<{ name: string; phone: string }>(`
      SELECT name, phone FROM clients
      WHERE organization_id=$1 AND id<>$2 AND phone IS NOT NULL
    `, [organizationId, id]);
    const duplicate = existing.find((client) => normalizePhone(client.phone) === normalizedPhone);
    if (duplicate) {
      return NextResponse.json({ error: `رقم الجوال مسجل للعميل: ${duplicate.name}` }, { status: 409 });
    }
  }
  const ownOnly = isOwnDataOnly(auth.user);
  const row = await one(`
    UPDATE clients SET name=$1, phone=$2, type=$3, opening_balance=$4, notes=$5,
      updated_at=now(), updated_by=$6
    WHERE id=$7 AND organization_id=$8 ${ownOnly ? 'AND created_by=$9' : ''}
    RETURNING *
  `, [
    String(name).trim(), phone || null, type, Number(opening_balance ?? 0),
    notes || null, auth.user.id, id, organizationId,
    ...(ownOnly ? [auth.user.id] : []),
  ]);
  if (!row) return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
  await audit(auth.user, 'update', 'client', id, { name: String(name).trim() });
  return NextResponse.json(row);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'clients.delete');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const ownOnly = isOwnDataOnly(auth.user);
  const values = ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId];
  const condition = `id=$1 AND organization_id=$2 ${ownOnly ? 'AND created_by=$3' : ''}`;
  const client = await one<{ name: string }>(`SELECT name FROM clients WHERE ${condition}`, values);
  if (!client) return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
  const [contractCount, voucherCount] = await Promise.all([
    one<{ count: number }>(
      'SELECT count(*)::int AS count FROM contracts WHERE client_id=$1 AND organization_id=$2',
      [id, organizationId]
    ),
    one<{ count: number }>(
      'SELECT count(*)::int AS count FROM vouchers WHERE client_id=$1 AND organization_id=$2',
      [id, organizationId]
    ),
  ]);
  const changes = await execute(`DELETE FROM clients WHERE ${condition}`, values);
  if (!changes) return NextResponse.json({ error: 'تعذر حذف العميل' }, { status: 404 });
  const deleted = {
    contracts: contractCount?.count ?? 0,
    vouchers: voucherCount?.count ?? 0,
  };
  await audit(auth.user, 'delete', 'client', id, { name: client.name, ...deleted });
  return NextResponse.json({ success: true, deleted });
}
