import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { execute, one } from '@/lib/postgres';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'vouchers.edit');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const body = await request.json();
  const ownOnly = isOwnDataOnly(auth.user);
  const row = await one(`
    UPDATE vouchers v SET voucher_type=$1, client_id=cl.id, amount=$2,
      amount_text=$3, payment_date=$4, description=$5, updated_by=$6, updated_at=now()
    FROM clients cl
    WHERE v.id=$7 AND v.organization_id=$8
      AND cl.id=$9 AND cl.organization_id=$8
      ${ownOnly ? 'AND v.created_by=$10' : ''}
    RETURNING v.*
  `, [
    body.voucher_type, Number(body.amount), body.amount_text, body.payment_date,
    body.description || null, auth.user.id, id, organizationId, body.client_id,
    ...(ownOnly ? [auth.user.id] : []),
  ]);
  if (!row) return NextResponse.json({ error: 'السند غير موجود' }, { status: 404 });
  await audit(auth.user, 'update', 'voucher', id, {
    voucher_type: body.voucher_type, amount: body.amount,
  });
  return NextResponse.json(row);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'vouchers.delete');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const ownOnly = isOwnDataOnly(auth.user);
  const voucher = await one<{ voucher_number: number; voucher_type: string; amount: number }>(`
    SELECT voucher_number, voucher_type, amount FROM vouchers
    WHERE id=$1 AND organization_id=$2 ${ownOnly ? 'AND created_by=$3' : ''}
  `, ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId]);
  if (!voucher) return NextResponse.json({ error: 'السند غير موجود' }, { status: 404 });
  await execute(
    `DELETE FROM vouchers WHERE id=$1 AND organization_id=$2 ${ownOnly ? 'AND created_by=$3' : ''}`,
    ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId]
  );
  await audit(auth.user, 'delete', 'voucher', id, voucher);
  return NextResponse.json({ success: true });
}
