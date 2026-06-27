import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { one, query } from '@/lib/postgres';

function normalizePhone(value: unknown): string {
  return Array.from(String(value ?? ''), (character) => {
    const code = character.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return character;
  }).join('').replace(/\D/g, '');
}

export async function GET(request: Request) {
  const auth = await authorize(request, 'clients.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const ownOnly = isOwnDataOnly(auth.user);
  const rows = await query(`
    SELECT cl.* FROM clients cl
    WHERE cl.organization_id = $1
      ${ownOnly ? `AND (
        cl.created_by = $2
        OR EXISTS (SELECT 1 FROM contracts c WHERE c.client_id=cl.id AND c.created_by=$2)
        OR EXISTS (SELECT 1 FROM vouchers v WHERE v.client_id=cl.id AND v.created_by=$2)
      )` : ''}
    ORDER BY cl.name
  `, ownOnly ? [organizationId, auth.user.id] : [organizationId]);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const auth = await authorize(request, 'clients.create');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { name, phone, type, opening_balance, notes } = await request.json();
  if (!String(name ?? '').trim()) {
    return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 });
  }
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const existing = await query<{ name: string; phone: string }>(`
      SELECT name, phone FROM clients
      WHERE organization_id=$1 AND phone IS NOT NULL
    `, [organizationId]);
    const duplicate = existing.find((client) => normalizePhone(client.phone) === normalizedPhone);
    if (duplicate) {
      return NextResponse.json(
        { error: `رقم الجوال مسجل للعميل: ${duplicate.name}` },
        { status: 409 }
      );
    }
  }
  const row = await one(`
    INSERT INTO clients
      (organization_id, name, phone, type, opening_balance, notes, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
    RETURNING *
  `, [
    organizationId, String(name).trim(), phone || null, type,
    Number(opening_balance ?? 0), notes || null, auth.user.id,
  ]);
  await audit(auth.user, 'create', 'client', String(row?.id), { name: String(name).trim() });
  return NextResponse.json(row, { status: 201 });
}
