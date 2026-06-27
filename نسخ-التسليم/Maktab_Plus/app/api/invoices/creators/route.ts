import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { isOwnDataOnly } from '@/lib/auth';
import { query } from '@/lib/postgres';

export async function GET(request: Request) {
  const auth = await authorize(request, 'invoices.reports');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  if (isOwnDataOnly(auth.user)) {
    return NextResponse.json([{
      id: auth.user.id, arabic_name: auth.user.arabic_name, username: auth.user.username,
    }]);
  }
  return NextResponse.json(await query(`
    SELECT DISTINCT u.id, u.arabic_name, u.username
    FROM invoices i JOIN users u ON u.id=i.created_by
    WHERE i.organization_id=$1
    ORDER BY u.arabic_name, u.username
  `, [organizationId]));
}
