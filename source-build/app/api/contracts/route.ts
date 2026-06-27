import { NextResponse } from 'next/server';
import { getDb, nextSequence } from '@/lib/sqlite';
import { randomUUID } from 'crypto';
import { authorize } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';

const JOIN_SQL = `
  SELECT c.*,
         cl.id              AS cl_id,
         cl.name            AS cl_name,
         cl.type            AS cl_type,
         cl.phone           AS cl_phone,
         cl.opening_balance AS cl_opening_balance,
         cl.notes           AS cl_notes,
         cl.created_at      AS cl_created_at,
         cl.updated_at      AS cl_updated_at
  FROM contracts c
  LEFT JOIN clients cl ON cl.id = c.client_id
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
    conditions.push('c.client_id = ?');
    values.push(clientId);
  }
  if (isOwnDataOnly(auth.user)) {
    conditions.push('c.created_by = ?');
    values.push(auth.user.id);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`${JOIN_SQL} ${where} ORDER BY c.contract_date DESC`)
    .all(...values);
  return NextResponse.json(rows.map(mapContractRow));
}

export async function POST(req: Request) {
  const auth = authorize(req, 'operations.create');
  if (auth.error) return auth.error;
  const { client_id, description, total_amount, operation_type, contract_date, status, notes } =
    await req.json();

  const db              = getDb();
  const id              = randomUUID();
  const contract_number = nextSequence('contract_number');
  const now             = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(
    `INSERT INTO contracts
       (id, contract_number, client_id, description, total_amount,
        operation_type, contract_date, status, notes, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, contract_number, client_id, description.trim(), total_amount,
    operation_type ?? 'debit_on_client', contract_date, status ?? 'active',
    notes || null, now, now, auth.user.id, auth.user.id
  );

  const row = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  audit(auth.user.id, 'create', 'contract', id, { contract_number, description, total_amount });
  return NextResponse.json(row, { status: 201 });
}

function mapContractRow(row: Record<string, unknown>) {
  const clients = row.cl_id ? {
    id: row.cl_id,
    name: row.cl_name,
    type: row.cl_type,
    phone: row.cl_phone,
    opening_balance: row.cl_opening_balance,
    notes: row.cl_notes,
    created_at: row.cl_created_at,
    updated_at: row.cl_updated_at,
  } : undefined;

  return {
    id: row.id,
    contract_number: row.contract_number,
    client_id: row.client_id,
    description: row.description,
    total_amount: row.total_amount,
    operation_type: row.operation_type,
    contract_date: row.contract_date,
    status: row.status,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    clients,
  };
}
