import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit } from '@/lib/auth';
import { exportOrganizationSql } from '@/lib/database-transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorize(request, 'settings.edit');
  if (auth.error) return auth.error;
  if (auth.user.role !== 'office_owner' && auth.user.role !== 'platform_owner') {
    return Response.json({ error: 'النسخ الاحتياطي متاح لمالك المنشأة فقط' }, { status: 403 });
  }
  const organizationId = requireOrganization(auth.user);
  const sql = await exportOrganizationSql(
    organizationId,
    auth.user.organization_name || 'organization'
  );
  await audit(auth.user, 'backup', 'database');
  const date = new Date().toISOString().slice(0, 10);
  return new Response(sql, {
    headers: {
      'Content-Type': 'application/sql; charset=utf-8',
      'Content-Disposition': `attachment; filename="maktab-plus-organization-${date}.sql"`,
      'Cache-Control': 'no-store',
    },
  });
}
