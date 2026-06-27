import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { isOwnDataOnly } from '@/lib/auth';
import { query } from '@/lib/postgres';

export async function GET(request: Request) {
  const auth = await authorize(request, 'audit.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const search = new URL(request.url).searchParams;
  const values: unknown[] = [organizationId];
  const conditions = ['a.organization_id=$1'];
  const add = (sql: string, value: string) => {
    if (!value) return;
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };
  add('a.created_at::date >= ?', search.get('from') ?? '');
  add('a.created_at::date <= ?', search.get('to') ?? '');
  if (isOwnDataOnly(auth.user)) add('a.user_id = ?', auth.user.id);
  else add('a.user_id = ?', search.get('user_id') ?? '');
  const rows = await query(`
    SELECT a.*, u.arabic_name, u.username
    FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.created_at DESC LIMIT 1000
  `, values);
  return NextResponse.json(rows);
}
