import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { authorize } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';

const JOIN_ONE = `
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
  WHERE c.id = ?
`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(_req, 'operations.view');
  if (auth.error) return auth.error;
  const { id } = await params;
  const db  = getDb();
  const ownOnly = isOwnDataOnly(auth.user);
  const row = db.prepare(`${JOIN_ONE} ${ownOnly ? 'AND c.created_by = ?' : ''}`)
    .get(...(ownOnly ? [id, auth.user.id] : [id]));
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(mapContractRow(row as Record<string, unknown>));
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(req, 'operations.edit');
  if (auth.error) return auth.error;
  const { id } = await params;
  const { client_id, description, total_amount, operation_type, contract_date, status, notes } =
    await req.json();
  const db  = getDb();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const ownOnly = isOwnDataOnly(auth.user);

  const result = db.prepare(
    `UPDATE contracts
     SET client_id=?, description=?, total_amount=?,
         operation_type=?, contract_date=?, status=?, notes=?, updated_at=?, updated_by=?
     WHERE id=? ${ownOnly ? 'AND created_by=?' : ''}`
  ).run(
    client_id, description.trim(), total_amount,
    operation_type, contract_date, status, notes || null, now, auth.user.id, id,
    ...(ownOnly ? [auth.user.id] : [])
  );
  if (!result.changes) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const row = db.prepare(`${JOIN_ONE} ${ownOnly ? 'AND c.created_by = ?' : ''}`)
    .get(...(ownOnly ? [id, auth.user.id] : [id]));
  audit(auth.user.id, 'update', 'contract', id, { description, total_amount });
  return NextResponse.json(mapContractRow(row as Record<string, unknown>));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(req, 'operations.delete');
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = getDb();
  const ownOnly = isOwnDataOnly(auth.user);
  const operation = db.prepare(
    `SELECT contract_number, description, total_amount
     FROM contracts WHERE id = ? ${ownOnly ? 'AND created_by = ?' : ''}`
  ).get(...(ownOnly ? [id, auth.user.id] : [id])) as
    { contract_number: number; description: string; total_amount: number } | undefined;

  if (!operation) return NextResponse.json({ error: 'العملية غير موجودة أو لا تملك صلاحية حذفها' }, { status: 404 });

  db.prepare(`DELETE FROM contracts WHERE id = ? ${ownOnly ? 'AND created_by = ?' : ''}`)
    .run(...(ownOnly ? [id, auth.user.id] : [id]));
  audit(auth.user.id, 'delete', 'contract', id, operation);
  return NextResponse.json({ success: true });
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
