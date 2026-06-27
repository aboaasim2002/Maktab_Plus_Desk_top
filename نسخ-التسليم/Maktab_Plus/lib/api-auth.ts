import { NextResponse } from 'next/server';
import { getSessionUser, hasPermission, type SessionUser } from './auth';

export async function authorize(
  request: Request,
  permission?: string
): Promise<{ user: SessionUser; error?: never } | { user?: never; error: NextResponse }> {
  const user = await getSessionUser(request);
  if (!user) {
    return { error: NextResponse.json({ error: 'يجب تسجيل الدخول أو أن الاشتراك غير نشط' }, { status: 401 }) };
  }
  if (permission && user.role === 'platform_owner' && !user.organization_id) {
    return {
      error: NextResponse.json(
        { error: 'استخدم لوحة مالك المنصة لإدارة المنشآت' },
        { status: 403 }
      ),
    };
  }
  if (permission && !hasPermission(user, permission)) {
    return { error: NextResponse.json({ error: 'ليس لديك صلاحية لتنفيذ هذه العملية' }, { status: 403 }) };
  }
  return { user };
}

export function requireOrganization(user: SessionUser): string {
  if (!user.organization_id) throw new Error('ORGANIZATION_REQUIRED');
  return user.organization_id;
}
