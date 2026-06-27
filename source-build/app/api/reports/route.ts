import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { authorize } from '@/lib/api-auth';
import { isOwnDataOnly } from '@/lib/auth';

// GET /api/reports?client_id=...&date_from=...&date_to=...&filter=all|debit|credit
export async function GET(req: Request) {
  const auth = authorize(req, 'reports.view');
  if (auth.error) return auth.error;
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');
  const dateFrom = searchParams.get('date_from') ?? '';
  const dateTo   = searchParams.get('date_to')   ?? '';
  const filter   = searchParams.get('filter')    ?? 'all';

  if (!clientId) return NextResponse.json({ error: 'client_id required' }, { status: 400 });

  const db = getDb();

  // ─── بناء استعلام العمليات ─────────────────────────────────
  const opConds: string[]  = ['client_id = ?'];
  const opVals:  (string | number | null)[] = [clientId];
  if (dateFrom)              { opConds.push('contract_date >= ?'); opVals.push(dateFrom); }
  if (dateTo)                { opConds.push('contract_date <= ?'); opVals.push(dateTo); }
  if (filter === 'debit')    { opConds.push("operation_type = 'debit_on_client'"); }
  if (filter === 'credit')   { opConds.push("operation_type = 'credit_on_client'"); }
  if (isOwnDataOnly(auth.user)) { opConds.push('created_by = ?'); opVals.push(auth.user.id); }

  const operations = db
    .prepare(`SELECT * FROM contracts WHERE ${opConds.join(' AND ')} ORDER BY contract_date ASC`)
    .all(...opVals);

  // ─── بناء استعلام السندات ──────────────────────────────────
  const vConds: string[]  = ['client_id = ?'];
  const vVals:  (string | number | null)[] = [clientId];
  if (dateFrom)              { vConds.push('payment_date >= ?'); vVals.push(dateFrom); }
  if (dateTo)                { vConds.push('payment_date <= ?'); vVals.push(dateTo); }
  if (filter === 'debit')    { vConds.push("voucher_type = 'receipt'"); }
  if (filter === 'credit')   { vConds.push("voucher_type = 'payment'"); }
  if (isOwnDataOnly(auth.user)) { vConds.push('created_by = ?'); vVals.push(auth.user.id); }

  const vouchers = db
    .prepare(`SELECT * FROM vouchers WHERE ${vConds.join(' AND ')} ORDER BY payment_date ASC`)
    .all(...vVals);

  return NextResponse.json({ operations, vouchers });
}
