import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, hashPassword, normalizeUsername } from '@/lib/auth';
import { getDb } from '@/lib/sqlite';
import { ALL_PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = authorize(request, 'users.manage');
  if (auth.error) return auth.error;
  const db = getDb();
  const users = db.prepare(`
    SELECT id, arabic_name, username, role, permission_mode, is_active, created_at, updated_at
    FROM users ORDER BY role DESC, arabic_name
  `).all() as Array<{
    id: string;
    arabic_name: string;
    username: string;
    role: string;
    permission_mode: string;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;
  const permissionStatement = db.prepare('SELECT permission FROM user_permissions WHERE user_id = ?');
  const response = NextResponse.json(users.map((user) => ({
    ...user,
    is_active: Boolean(user.is_active),
    permissions: (permissionStatement.all(user.id) as Array<{ permission: string }>).map((item) => item.permission),
  })));
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}

export async function POST(request: Request) {
  const auth = authorize(request, 'users.manage');
  if (auth.error) return auth.error;
  const body = await request.json();
  const arabicName = String(body.arabic_name ?? '').trim();
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? '');
  const permissionMode = body.permission_mode === 'all' ? 'all' : 'custom';
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.filter((item: string) => ALL_PERMISSIONS.includes(item as never))
    : [];

  if (!arabicName || !/^[A-Za-z0-9._-]{3,30}$/.test(username) || password.length < 6) {
    return NextResponse.json({
      error: 'أدخل الاسم العربي، واسم مستخدم إنجليزي من 3 إلى 30 حرفًا، وكلمة مرور من 6 أحرف على الأقل',
    }, { status: 400 });
  }

  const db = getDb();
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
    return NextResponse.json({ error: 'اسم المستخدم مستخدم مسبقًا، اختر اسمًا آخر' }, { status: 409 });
  }
  const id = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO users (id, arabic_name, username, password_hash, permission_mode, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, arabicName, username, hashPassword(password), permissionMode, auth.user.id);
    const insertPermission = db.prepare('INSERT INTO user_permissions (user_id, permission) VALUES (?, ?)');
    if (permissionMode === 'custom') permissions.forEach((permission: string) => insertPermission.run(id, permission));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Create user failed:', error);
    return NextResponse.json({ error: 'تعذر حفظ المستخدم في قاعدة البيانات' }, { status: 500 });
  }
  audit(auth.user.id, 'create', 'user', id, { arabicName, username, permissionMode, permissions });
  return NextResponse.json({
    id,
    arabic_name: arabicName,
    username,
    role: 'user',
    permission_mode: permissionMode,
    is_active: true,
    permissions: permissionMode === 'custom' ? permissions : [],
  }, { status: 201 });
}
