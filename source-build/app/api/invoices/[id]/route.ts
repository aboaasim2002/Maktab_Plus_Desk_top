import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { getDb } from '@/lib/sqlite';
import { tafqeet } from '@/lib/tafqeet';
import { insertInvoiceItems, roundMoney, sanitizeInvoiceItems } from '@/lib/invoice-helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(request, 'invoices.view');
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = getDb();
  const ownOnly = isOwnDataOnly(auth.user);
  const invoice = db.prepare(`
    SELECT i.*, cu.arabic_name AS created_by_name, uu.arabic_name AS updated_by_name
    FROM invoices i
    LEFT JOIN users cu ON cu.id = i.created_by
    LEFT JOIN users uu ON uu.id = i.updated_by
    WHERE i.id = ? ${ownOnly ? 'AND i.created_by = ?' : ''}
  `).get(...(ownOnly ? [id, auth.user.id] : [id]));
  if (!invoice) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY line_order').all(id);
  return NextResponse.json({ ...invoice as object, items });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(request, 'invoices.edit');
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await request.json();
  const items = sanitizeInvoiceItems(body.items);
  if (!items.length) return NextResponse.json({ error: 'أضف بندًا واحدًا على الأقل' }, { status: 400 });
  const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  const amountText = tafqeet(total);
  const db = getDb();
  const ownOnly = isOwnDataOnly(auth.user);
  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      UPDATE invoices SET invoice_date=?, customer_name=?, total_amount=?, amount_text=?,
        updated_by=?, updated_at=datetime('now','localtime')
      WHERE id=? ${ownOnly ? 'AND created_by=?' : ''}
    `).run(
      body.invoice_date,
      String(body.customer_name ?? '').trim() || null,
      total,
      amountText,
      auth.user.id,
      id,
      ...(ownOnly ? [auth.user.id] : [])
    );
    if (!result.changes) throw new Error('NOT_FOUND');
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
    insertInvoiceItems(id, items);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (String(error).includes('NOT_FOUND')) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });
    throw error;
  }
  audit(auth.user.id, 'update', 'invoice', id, { total, item_count: items.length });
  return NextResponse.json({ success: true, total_amount: total, amount_text: amountText });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorize(request, 'invoices.delete');
  if (auth.error) return auth.error;
  const { id } = await params;
  const ownOnly = isOwnDataOnly(auth.user);
  const row = getDb().prepare(
    `SELECT invoice_number, total_amount FROM invoices WHERE id = ? ${ownOnly ? 'AND created_by = ?' : ''}`
  ).get(...(ownOnly ? [id, auth.user.id] : [id]));
  if (!row) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });
  getDb().prepare('DELETE FROM invoices WHERE id = ?').run(id);
  audit(auth.user.id, 'delete', 'invoice', id, row);
  return NextResponse.json({ success: true });
}
