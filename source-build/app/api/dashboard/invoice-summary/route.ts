import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { getDb } from '@/lib/sqlite';
import { isOwnDataOnly } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = authorize(request, 'dashboard.view');
  if (auth.error) return auth.error;
  const ownOnly = isOwnDataOnly(auth.user);
  const row = getDb().prepare(`
    SELECT COUNT(*) AS invoice_count, COALESCE(SUM(total_amount), 0) AS total_amount
    FROM invoices
    WHERE invoice_date = date('now','localtime') ${ownOnly ? 'AND created_by = ?' : ''}
  `).get(...(ownOnly ? [auth.user.id] : [])) as { invoice_count: number; total_amount: number };
  return NextResponse.json(row);
}
