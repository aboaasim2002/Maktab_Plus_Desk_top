import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit } from '@/lib/auth';
import { getDb } from '@/lib/sqlite';

export async function GET(request: Request) {
  const auth = authorize(request, 'invoices.view');
  if (auth.error) return auth.error;
  return NextResponse.json(getDb().prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY name').all());
}

export async function POST(request: Request) {
  const auth = authorize(request, 'services.manage');
  if (auth.error) return auth.error;
  const name = String((await request.json()).name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'اسم الخدمة مطلوب' }, { status: 400 });
  const db = getDb();
  const existing = db.prepare('SELECT * FROM services WHERE name = ? COLLATE NOCASE').get(name) as { id: string; name: string; is_active: number } | undefined;
  if (existing) {
    db.prepare('UPDATE services SET is_active = 1 WHERE id = ?').run(existing.id);
    return NextResponse.json(existing);
  }
  const id = randomUUID();
  db.prepare('INSERT INTO services (id, name, created_by) VALUES (?, ?, ?)').run(id, name, auth.user.id);
  audit(auth.user.id, 'create', 'service', id, { name });
  return NextResponse.json({ id, name, is_active: 1 }, { status: 201 });
}
