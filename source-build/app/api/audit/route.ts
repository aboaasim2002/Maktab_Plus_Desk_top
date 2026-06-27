import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { isOwnDataOnly } from '@/lib/auth';
import { getDb } from '@/lib/sqlite';

export async function GET(request: Request) {
  const auth = authorize(request, 'audit.view');
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const userId = searchParams.get('user_id') ?? '';
  const conditions: string[] = [];
  const values: string[] = [];
  if (from) { conditions.push('date(a.created_at) >= ?'); values.push(from); }
  if (to) { conditions.push('date(a.created_at) <= ?'); values.push(to); }
  if (isOwnDataOnly(auth.user)) {
    conditions.push('a.user_id = ?');
    values.push(auth.user.id);
  } else if (userId) {
    conditions.push('a.user_id = ?');
    values.push(userId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = getDb().prepare(`
    SELECT a.*, u.arabic_name, u.username
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    ${where}
    ORDER BY a.created_at DESC LIMIT 1000
  `).all(...values);
  return NextResponse.json(rows);
}
