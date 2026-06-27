import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, hashPassword, normalizeUsername } from '@/lib/auth';
import { getDb } from '@/lib/sqlite';
import { ALL_PERMISSIONS } from '@/lib/permissions';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(request, 'users.manage');
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await request.json();
  const db = getDb();
  const existing = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
  if (!existing) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
  if (existing.role === 'admin' && id !== auth.user.id) {
    return NextResponse.json({ error: 'لا يمكن تعديل المستخدم الرئيسي من مستخدم آخر' }, { status: 400 });
  }

  const arabicName = String(body.arabic_name ?? '').trim();
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? '');
  const mode = existing.role === 'admin' ? 'all' : body.permission_mode === 'all' ? 'all' : 'custom';
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.filter((item: string) => ALL_PERMISSIONS.includes(item as never))
    : [];
  const active = existing.role === 'admin' ? 1 : body.is_active === false ? 0 : 1;

  db.exec('BEGIN');
  try {
    if (password) {
      if (password.length < 6) throw new Error('PASSWORD_SHORT');
      db.prepare(`
        UPDATE users SET arabic_name=?, username=?, password_hash=?, permission_mode=?, is_active=?,
          updated_at=datetime('now','localtime') WHERE id=?
      `).run(arabicName, username, hashPassword(password), mode, active, id);
    } else {
      db.prepare(`
        UPDATE users SET arabic_name=?, username=?, permission_mode=?, is_active=?,
          updated_at=datetime('now','localtime') WHERE id=?
      `).run(arabicName, username, mode, active, id);
    }
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
    const insert = db.prepare('INSERT INTO user_permissions (user_id, permission) VALUES (?, ?)');
    if (mode === 'custom') permissions.forEach((permission: string) => insert.run(id, permission));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (String(error).includes('PASSWORD_SHORT')) {
      return NextResponse.json({ error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' }, { status: 400 });
    }
    throw error;
  }
  audit(auth.user.id, 'update', 'user', id, { arabicName, username, mode, active, permissions });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(request, 'users.manage');
  if (auth.error) return auth.error;
  const { id } = await params;
  if (id === auth.user.id || id === 'admin-default-user') {
    return NextResponse.json({ error: 'لا يمكن حذف المستخدم الحالي أو المستخدم الرئيسي' }, { status: 400 });
  }
  const result = getDb().prepare('DELETE FROM users WHERE id = ? AND role <> ?').run(id, 'admin');
  if (!result.changes) return NextResponse.json({ error: 'تعذر حذف المستخدم' }, { status: 404 });
  audit(auth.user.id, 'delete', 'user', id);
  return NextResponse.json({ success: true });
}
