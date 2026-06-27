import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { authorize } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';

function normalizePhone(value: unknown): string {
  return Array.from(String(value ?? ''), (character) => {
    const code = character.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return character;
  }).join('').replace(/\D/g, '');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(_req, 'clients.view');
  if (auth.error) return auth.error;
  const { id } = await params;
  const db  = getDb();
  const ownOnly = isOwnDataOnly(auth.user);
  const row = db.prepare(`
    SELECT cl.* FROM clients cl
    WHERE cl.id = ? ${ownOnly ? `AND (
      cl.created_by = ?
      OR EXISTS (SELECT 1 FROM contracts c WHERE c.client_id = cl.id AND c.created_by = ?)
      OR EXISTS (SELECT 1 FROM vouchers v WHERE v.client_id = cl.id AND v.created_by = ?)
    )` : ''}
  `).get(...(ownOnly ? [id, auth.user.id, auth.user.id, auth.user.id] : [id]));
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(req, 'clients.edit');
  if (auth.error) return auth.error;
  const { id } = await params;
  const { name, phone, type, opening_balance, notes } = await req.json();
  const db  = getDb();
  const ownOnly = isOwnDataOnly(auth.user);
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const duplicate = (db.prepare('SELECT id, name, phone FROM clients WHERE id <> ? AND phone IS NOT NULL').all(id) as Array<{ id: string; name: string; phone: string }>)
      .find((client) => normalizePhone(client.phone) === normalizedPhone);
    if (duplicate) {
      return NextResponse.json(
        { error: `رقم الجوال مسجل للعميل: ${duplicate.name}` },
        { status: 409 }
      );
    }
  }
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const result = db.prepare(
    `UPDATE clients SET name=?, phone=?, type=?, opening_balance=?, notes=?, updated_at=?, updated_by=?
     WHERE id=? ${ownOnly ? 'AND created_by=?' : ''}`
  ).run(
    name.trim(), phone || null, type, opening_balance ?? 0, notes || null, now, auth.user.id, id,
    ...(ownOnly ? [auth.user.id] : [])
  );
  if (!result.changes) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  audit(auth.user.id, 'update', 'client', id, { name: name.trim() });
  return NextResponse.json(row);
}
