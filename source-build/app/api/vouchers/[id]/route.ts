import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { authorize } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(req, 'vouchers.edit');
  if (auth.error) return auth.error;
  const { id } = await params;
  const { voucher_type, client_id, amount, amount_text, payment_date, description } =
    await req.json();
  const db = getDb();
  const ownOnly = isOwnDataOnly(auth.user);

  const result = db.prepare(
    `UPDATE vouchers
     SET voucher_type=?, client_id=?, amount=?, amount_text=?, payment_date=?, description=?,
         updated_by=?, updated_at=datetime('now','localtime')
     WHERE id=? ${ownOnly ? 'AND created_by=?' : ''}`
  ).run(
    voucher_type,
    client_id,
    amount,
    amount_text,
    payment_date,
    description || null,
    auth.user.id,
    id,
    ...(ownOnly ? [auth.user.id] : [])
  );
  if (!result.changes) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const row = db.prepare(
    `SELECT * FROM vouchers WHERE id = ? ${ownOnly ? 'AND created_by = ?' : ''}`
  ).get(...(ownOnly ? [id, auth.user.id] : [id]));
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  audit(auth.user.id, 'update', 'voucher', id, { voucher_type, amount });
  return NextResponse.json(row);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(req, 'vouchers.delete');
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = getDb();
  const ownOnly = isOwnDataOnly(auth.user);
  const voucher = db.prepare(
    `SELECT voucher_number, voucher_type, amount
     FROM vouchers WHERE id = ? ${ownOnly ? 'AND created_by = ?' : ''}`
  ).get(...(ownOnly ? [id, auth.user.id] : [id])) as
    { voucher_number: number; voucher_type: string; amount: number } | undefined;

  if (!voucher) return NextResponse.json({ error: 'السند غير موجود أو لا تملك صلاحية حذفه' }, { status: 404 });

  db.prepare(`DELETE FROM vouchers WHERE id = ? ${ownOnly ? 'AND created_by = ?' : ''}`)
    .run(...(ownOnly ? [id, auth.user.id] : [id]));
  audit(auth.user.id, 'delete', 'voucher', id, voucher);
  return NextResponse.json({ success: true });
}
