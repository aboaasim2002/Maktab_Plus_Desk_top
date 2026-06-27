import { NextResponse } from 'next/server';
import { getSessionUser, hasPermission, type SessionUser } from './auth';

export function authorize(
  request: Request,
  permission?: string
): { user: SessionUser; error?: never } | { user?: never; error: NextResponse } {
  const user = getSessionUser(request);
  if (!user) {
    return { error: NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 }) };
  }
  if (permission && !hasPermission(user, permission)) {
    return { error: NextResponse.json({ error: 'ليس لديك صلاحية لتنفيذ هذه العملية' }, { status: 403 }) };
  }
  return { user };
}
