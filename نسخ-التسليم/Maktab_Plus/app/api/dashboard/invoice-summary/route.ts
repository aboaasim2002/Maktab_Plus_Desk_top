import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { isOwnDataOnly } from '@/lib/auth';
import { one } from '@/lib/postgres';

export async function GET(request: Request) {
  const auth = await authorize(request, 'dashboard.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const ownOnly = isOwnDataOnly(auth.user);
  const row = await one(`
    SELECT count(*)::int AS invoice_count, COALESCE(sum(total_amount),0)::float8 AS total_amount
    FROM invoices WHERE organization_id=$1 AND invoice_date=CURRENT_DATE
      ${ownOnly ? 'AND created_by=$2' : ''}
  `, ownOnly ? [organizationId, auth.user.id] : [organizationId]);
  return NextResponse.json(row);
}
