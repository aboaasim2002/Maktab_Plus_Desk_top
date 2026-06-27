import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, hashPassword, normalizeUsername } from '@/lib/auth';
import { execute, one, transaction } from '@/lib/postgres';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { refreshAccessSignature } from '@/lib/access-integrity';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'users.manage');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const body = await request.json();
  const existing = await one<{ role: string }>(
    'SELECT role FROM users WHERE id = $1 AND organization_id = $2',
    [id, organizationId]
  );
  if (!existing) return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
  if (existing.role === 'office_owner') {
    return NextResponse.json({ error: 'لا يمكن تعديل حساب مالك المنشأة من شاشة الموظفين' }, { status: 400 });
  }

  const arabicName = String(body.arabic_name ?? '').trim();
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? '');
  const mode = body.permission_mode === 'all' ? 'all' : 'custom';
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.filter((item: string) => ALL_PERMISSIONS.includes(item as never))
    : [];
  const active = body.is_active !== false;

  try {
    await transaction(async (client) => {
      if (password) {
        if (password.length < 8) throw new Error('PASSWORD_SHORT');
        await client.query(`
          UPDATE users SET arabic_name=$1, username=$2, password_hash=$3,
            permission_mode=$4, is_active=$5, updated_at=now()
          WHERE id=$6 AND organization_id=$7
        `, [arabicName, username, hashPassword(password), mode, active, id, organizationId]);
      } else {
        await client.query(`
          UPDATE users SET arabic_name=$1, username=$2, permission_mode=$3,
            is_active=$4, updated_at=now()
          WHERE id=$5 AND organization_id=$6
        `, [arabicName, username, mode, active, id, organizationId]);
      }
      await client.query('DELETE FROM user_permissions WHERE user_id = $1', [id]);
      if (mode === 'custom') {
        for (const permission of permissions) {
          await client.query(
            'INSERT INTO user_permissions (user_id, permission) VALUES ($1, $2)',
            [id, permission]
          );
        }
      }
      await refreshAccessSignature(client, id);
    });
  } catch (error) {
    if (String(error).includes('PASSWORD_SHORT')) {
      return NextResponse.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });
    }
    if (String(error).includes('users_username_lower_uidx')) {
      return NextResponse.json({ error: 'اسم المستخدم مستخدم مسبقًا' }, { status: 409 });
    }
    throw error;
  }
  await audit(auth.user, 'update', 'user', id, { arabicName, username, mode, active, permissions });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'users.manage');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  if (id === auth.user.id) {
    return NextResponse.json({ error: 'لا يمكن حذف المستخدم الحالي' }, { status: 400 });
  }
  const changes = await execute(`
    DELETE FROM users
    WHERE id = $1 AND organization_id = $2 AND role = 'user'
  `, [id, organizationId]);
  if (!changes) return NextResponse.json({ error: 'تعذر حذف المستخدم' }, { status: 404 });
  await audit(auth.user, 'delete', 'user', id);
  return NextResponse.json({ success: true });
}
