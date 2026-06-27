import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, hashPassword, normalizeUsername } from '@/lib/auth';
import { execute, one, query, transaction } from '@/lib/postgres';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { refreshAccessSignature } from '@/lib/access-integrity';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorize(request, 'users.manage');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const users = await query<{
    id: string;
    arabic_name: string;
    username: string;
    role: string;
    permission_mode: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    permissions: string[];
  }>(`
    SELECT u.id, u.arabic_name, u.username, u.role, u.permission_mode, u.is_active,
      u.created_at, u.updated_at,
      COALESCE(array_agg(up.permission) FILTER (WHERE up.permission IS NOT NULL), '{}') AS permissions
    FROM users u
    LEFT JOIN user_permissions up ON up.user_id = u.id
    WHERE u.organization_id = $1 AND u.role = 'user'
    GROUP BY u.id
    ORDER BY CASE u.role WHEN 'office_owner' THEN 0 ELSE 1 END, u.arabic_name
  `, [organizationId]);
  const response = NextResponse.json(users);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}

export async function POST(request: Request) {
  const auth = await authorize(request, 'users.manage');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const body = await request.json();
  const arabicName = String(body.arabic_name ?? '').trim();
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? '');
  const permissionMode = body.permission_mode === 'all' ? 'all' : 'custom';
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.filter((item: string) => ALL_PERMISSIONS.includes(item as never))
    : [];

  if (!arabicName || !/^[A-Za-z0-9._-]{3,30}$/.test(username) || password.length < 8) {
    return NextResponse.json({
      error: 'أدخل الاسم، واسم مستخدم إنجليزي من 3 إلى 30 حرفًا، وكلمة مرور من 8 أحرف على الأقل',
    }, { status: 400 });
  }
  if (await one('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username])) {
    return NextResponse.json({ error: 'اسم المستخدم مستخدم مسبقًا' }, { status: 409 });
  }

  const user = await transaction(async (client) => {
    const created = await client.query<{ id: string }>(`
      INSERT INTO users
        (organization_id, arabic_name, username, password_hash, role, permission_mode, created_by, access_signature)
      VALUES ($1, $2, $3, $4, 'user', $5, $6, '')
      RETURNING id
    `, [organizationId, arabicName, username, hashPassword(password), permissionMode, auth.user.id]);
    const id = created.rows[0].id;
    if (permissionMode === 'custom') {
      for (const permission of permissions) {
        await client.query(
          'INSERT INTO user_permissions (user_id, permission) VALUES ($1, $2)',
          [id, permission]
        );
      }
    }
    await refreshAccessSignature(client, id);
    return { id };
  });
  await audit(auth.user, 'create', 'user', user.id, { arabicName, username, permissionMode, permissions });
  return NextResponse.json({
    ...user,
    arabic_name: arabicName,
    username,
    role: 'user',
    permission_mode: permissionMode,
    is_active: true,
    permissions: permissionMode === 'custom' ? permissions : [],
  }, { status: 201 });
}
