import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, hashPassword } from '@/lib/auth';
import { one, pool } from '@/lib/postgres';
import { refreshAccessSignature } from '@/lib/access-integrity';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'هذه العملية خاصة بمالك البرنامج' }, { status: 403 });
  }
  const { id, userId } = await params;
  const password = String((await request.json()).password ?? '');
  if (password.length < 8) {
    return NextResponse.json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, { status: 400 });
  }
  const user = await one<{ id: string; username: string; role: string }>(`
    UPDATE users SET password_hash=$1, is_active=true, updated_at=now()
    WHERE id=$2 AND organization_id=$3
    RETURNING id, username, role
  `, [hashPassword(password), userId, id]);
  if (!user) return NextResponse.json({ error: 'المستخدم غير موجود في هذه المنشأة' }, { status: 404 });
  await refreshAccessSignature(pool, user.id);
  await audit(
    { id: auth.user.id, organization_id: id },
    'reset_password',
    'user',
    user.id,
    { username: user.username, role: user.role }
  );
  return NextResponse.json({ success: true });
}
