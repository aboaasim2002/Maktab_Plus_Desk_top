import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';

export interface InvoiceInputItem {
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

export function sanitizeInvoiceItems(items: unknown): InvoiceInputItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item: Record<string, unknown>) => ({
    service_id: item.service_id ? String(item.service_id) : null,
    description: String(item.description ?? '').trim(),
    quantity: Number(item.quantity ?? 0),
    unit_price: Number(item.unit_price ?? 0),
  })).filter((item) => item.description && item.quantity > 0 && item.unit_price >= 0);
}

export async function insertInvoiceItems(
  client: PoolClient,
  organizationId: string,
  invoiceId: string,
  items: InvoiceInputItem[]
): Promise<void> {
  for (const [index, item] of items.entries()) {
    await client.query(`
      INSERT INTO invoice_items
        (id, organization_id, invoice_id, service_id, description, quantity, unit_price, line_total, line_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      randomUUID(), organizationId, invoiceId, item.service_id, item.description,
      item.quantity, item.unit_price, roundMoney(item.quantity * item.unit_price), index,
    ]);
  }
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

