import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { isOwnDataOnly } from '@/lib/auth';
import { query } from '@/lib/postgres';

export async function GET(request: Request) {
  const auth = await authorize(request, 'reports.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const search = new URL(request.url).searchParams;
  const clientId = search.get('client_id');
  const dateFrom = search.get('date_from') ?? '';
  const dateTo = search.get('date_to') ?? '';
  const filter = search.get('filter') ?? 'all';
  if (!clientId) return NextResponse.json({ error: 'العميل مطلوب' }, { status: 400 });

  const build = (kind: 'contract' | 'voucher') => {
    const values: unknown[] = [organizationId, clientId];
    const dateColumn = kind === 'contract' ? 'contract_date' : 'payment_date';
    const conditions = ['organization_id=$1', 'client_id=$2'];
    if (dateFrom) { values.push(dateFrom); conditions.push(`${dateColumn}>=$${values.length}`); }
    if (dateTo) { values.push(dateTo); conditions.push(`${dateColumn}<=$${values.length}`); }
    if (kind === 'contract' && filter === 'debit') conditions.push("operation_type='debit_on_client'");
    if (kind === 'contract' && filter === 'credit') conditions.push("operation_type='credit_on_client'");
    if (kind === 'voucher' && filter === 'debit') conditions.push("voucher_type='receipt'");
    if (kind === 'voucher' && filter === 'credit') conditions.push("voucher_type='payment'");
    if (isOwnDataOnly(auth.user)) {
      values.push(auth.user.id);
      conditions.push(`created_by=$${values.length}`);
    }
    return { values, conditions, dateColumn };
  };
  const operationQuery = build('contract');
  const voucherQuery = build('voucher');
  const [operations, vouchers] = await Promise.all([
    query(`SELECT * FROM contracts WHERE ${operationQuery.conditions.join(' AND ')}
      ORDER BY ${operationQuery.dateColumn} ASC`, operationQuery.values),
    query(`SELECT * FROM vouchers WHERE ${voucherQuery.conditions.join(' AND ')}
      ORDER BY ${voucherQuery.dateColumn} ASC`, voucherQuery.values),
  ]);
  return NextResponse.json({ operations, vouchers });
}
