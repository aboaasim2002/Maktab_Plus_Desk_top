import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { isOwnDataOnly } from '@/lib/auth';
import { getDb } from '@/lib/sqlite';

export async function GET(request: Request) {
  const auth = authorize(request, 'invoices.reports');
  if (auth.error) return auth.error;

  if (isOwnDataOnly(auth.user)) {
    return NextResponse.json([{
      id: auth.user.id,
      arabic_name: auth.user.arabic_name,
      username: auth.user.username,
    }]);
  }

  const users = getDb().prepare(`
    SELECT DISTINCT u.id, u.arabic_name, u.username
    FROM invoices i
    JOIN users u ON u.id = i.created_by
    ORDER BY u.arabic_name COLLATE NOCASE, u.username COLLATE NOCASE
  `).all();
  return NextResponse.json(users);
}
