import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit } from '@/lib/auth';
import { getDb } from '@/lib/sqlite';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(request, 'services.manage');
  if (auth.error) return auth.error;
  const { id } = await params;
  const name = String((await request.json()).name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'اسم الخدمة مطلوب' }, { status: 400 });
  const result = getDb().prepare('UPDATE services SET name = ? WHERE id = ?').run(name, id);
  if (!result.changes) return NextResponse.json({ error: 'الخدمة غير موجودة' }, { status: 404 });
  audit(auth.user.id, 'update', 'service', id, { name });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(request, 'services.manage');
  if (auth.error) return auth.error;
  const { id } = await params;
  const service = getDb().prepare('SELECT name FROM services WHERE id = ?').get(id);
  if (!service) return NextResponse.json({ error: 'الخدمة غير موجودة' }, { status: 404 });
  getDb().prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(id);
  audit(auth.user.id, 'delete', 'service', id, service);
  return NextResponse.json({ success: true });
}
