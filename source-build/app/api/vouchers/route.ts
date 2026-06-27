import { NextResponse } from 'next/server';
import { getDb, nextSequence } from '@/lib/sqlite';
import { randomUUID } from 'crypto';
import { authorize } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';

const JOIN_SQL = `
  SELECT v.*,
         cl.id              AS cl_id,
         cl.name            AS cl_name,
         cl.type            AS cl_type,
         cl.phone           AS cl_phone,
         cl.opening_balance AS cl_opening_balance
  FROM vouchers v
  LEFT JOIN clients cl ON cl.id = v.client_id
`;

export async function GET(req: Request) {
  const auth = authorize(req, 'operations.view');
  if (auth.error) return auth.error;
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');
  const db = getDb();
  const conditions: string[] = [];
  const values: string[] = [];
  if (clientId) {
    conditions.push('v.client_id = ?');
    values.push(clientId);
  }
  if (isOwnDataOnly(auth.user)) {
    conditions.push('v.created_by = ?');
    values.push(auth.user.id);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`${JOIN_SQL} ${where} ORDER BY v.payment_date DESC`)
    .all(...values);
  return NextResponse.json(rows.map(mapVoucherRow));
}

export async function POST(req: Request) {
  const auth = authorize(req, 'vouchers.create');
  if (auth.error) return auth.error;
  const { voucher_type, client_id, amount, amount_text, payment_date, description } =
    await req.json();

  const db             = getDb();
  const operation = db.prepare('SELECT 1 FROM contracts WHERE client_id = ? LIMIT 1').get(client_id);
  if (!operation) {
    return NextResponse.json(
      { error: 'هذا العميل ليست له عمليات مسجلة. سجل عملية مدينة أو دائنة أولاً.' },
      { status: 400 }
    );
  }
  const id             = randomUUID();
  const voucher_number = nextSequence('voucher_number');
  const now            = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(
    `INSERT INTO vouchers
       (id, voucher_number, voucher_type, client_id, amount, amount_text,
        payment_date, description, created_at, created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, voucher_number, voucher_type, client_id, amount,
    amount_text, payment_date, description || null, now, auth.user.id, auth.user.id, now
  );

  const row = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id);
  audit(auth.user.id, 'create', 'voucher', id, { voucher_number, voucher_type, amount });
  return NextResponse.json(row, { status: 201 });
}

function mapVoucherRow(row: Record<string, unknown>) {
  const clients = row.cl_id ? {
    id: row.cl_id, name: row.cl_name, type: row.cl_type,
    phone: row.cl_phone, opening_balance: row.cl_opening_balance,
  } : undefined;

  return {
    id: row.id,
    voucher_number: row.voucher_number,
    voucher_type: row.voucher_type,
    client_id: row.client_id,
    amount: row.amount,
    amount_text: row.amount_text,
    payment_date: row.payment_date,
    description: row.description,
    created_at: row.created_at,
    clients,
  };
}
