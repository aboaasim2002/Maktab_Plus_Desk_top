import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { randomUUID } from 'crypto';
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

export async function GET(request: Request) {
  const auth = authorize(request, 'clients.view');
  if (auth.error) return auth.error;
  const db   = getDb();
  const rows = isOwnDataOnly(auth.user)
    ? db.prepare(`
        SELECT cl.* FROM clients cl
        WHERE cl.created_by = ?
          OR EXISTS (SELECT 1 FROM contracts c WHERE c.client_id = cl.id AND c.created_by = ?)
          OR EXISTS (SELECT 1 FROM vouchers v WHERE v.client_id = cl.id AND v.created_by = ?)
        ORDER BY cl.name
      `).all(auth.user.id, auth.user.id, auth.user.id)
    : db.prepare('SELECT * FROM clients ORDER BY name').all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = authorize(req, 'clients.create');
  if (auth.error) return auth.error;
  const { name, phone, type, opening_balance, notes } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const db  = getDb();
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const duplicate = (db.prepare('SELECT id, name, phone FROM clients WHERE phone IS NOT NULL').all() as Array<{ id: string; name: string; phone: string }>)
      .find((client) => normalizePhone(client.phone) === normalizedPhone);
    if (duplicate) {
      return NextResponse.json(
        { error: `رقم الجوال مسجل للعميل: ${duplicate.name}` },
        { status: 409 }
      );
    }
  }
  const id  = randomUUID();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(
    `INSERT INTO clients (id, name, phone, type, opening_balance, notes, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), phone || null, type, opening_balance ?? 0, notes || null, now, now, auth.user.id, auth.user.id);

  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  audit(auth.user.id, 'create', 'client', id, { name: name.trim() });
  return NextResponse.json(row, { status: 201 });
}
