import { randomUUID } from 'crypto';
import { getDb } from './sqlite';

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

export function insertInvoiceItems(invoiceId: string, items: InvoiceInputItem[]): void {
  const statement = getDb().prepare(`
    INSERT INTO invoice_items
      (id, invoice_id, service_id, description, quantity, unit_price, line_total, line_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  items.forEach((item, index) => statement.run(
    randomUUID(), invoiceId, item.service_id, item.description, item.quantity,
    item.unit_price, roundMoney(item.quantity * item.unit_price), index
  ));
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

