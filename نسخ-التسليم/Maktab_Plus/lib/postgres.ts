import { randomBytes, scryptSync } from 'crypto';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { refreshAccessSignature } from './access-integrity';

types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

declare global {
  // eslint-disable-next-line no-var
  var _maktabPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _maktabSchemaReady: Promise<void> | undefined;
}

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://maktab_plus:maktab_plus@127.0.0.1:5433/maktab_plus';

export const pool = global._maktabPool ?? new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_SIZE || 10),
  ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
});

if (process.env.NODE_ENV !== 'production') global._maktabPool = pool;

function platformOwnerHash(): string {
  const password = process.env.MAIN_OWNER_PASSWORD;
  if (!password) {
    throw new Error('MAIN_OWNER_PASSWORD is required when creating the platform owner');
  }
  const salt = randomBytes(16).toString('hex');
  return `scrypt$v1$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

const schemaSql = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('platform_owner', 'office_owner', 'user');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'suspended', 'expired', 'cancelled');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_number BIGINT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    subscription_status subscription_status NOT NULL DEFAULT 'trial',
    subscription_starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    subscription_ends_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE SEQUENCE IF NOT EXISTS organization_customer_number_seq START WITH 1001;
  ALTER TABLE organizations ADD COLUMN IF NOT EXISTS customer_number BIGINT;
  ALTER TABLE organizations
    ALTER COLUMN customer_number SET DEFAULT nextval('organization_customer_number_seq');
  DO $$
  DECLARE
    organization_row RECORD;
    highest_number BIGINT;
  BEGIN
    SELECT MAX(customer_number) INTO highest_number FROM organizations;
    IF highest_number IS NULL THEN
      PERFORM setval('organization_customer_number_seq', 1001, false);
    ELSE
      PERFORM setval('organization_customer_number_seq', GREATEST(highest_number, 1001), true);
    END IF;

    FOR organization_row IN
      SELECT id FROM organizations WHERE customer_number IS NULL ORDER BY created_at, id
    LOOP
      UPDATE organizations
      SET customer_number = nextval('organization_customer_number_seq')
      WHERE id = organization_row.id;
    END LOOP;
  END $$;
  ALTER TABLE organizations ALTER COLUMN customer_number SET NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS organizations_customer_number_uidx
    ON organizations (customer_number);
  CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_lower_uidx ON organizations (lower(slug));

  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    arabic_name TEXT NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'user',
    permission_mode TEXT NOT NULL DEFAULT 'custom' CHECK (permission_mode IN ('all','custom')),
    access_signature TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (role = 'platform_owner' AND organization_id IS NULL) OR
      (role <> 'platform_owner' AND organization_id IS NOT NULL)
    )
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS access_signature TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx ON users (lower(username));

  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL,
    PRIMARY KEY (user_id, permission)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
  DELETE FROM sessions current_session
  USING sessions newer_session
  WHERE current_session.user_id = newer_session.user_id
    AND (
      current_session.created_at < newer_session.created_at
      OR (
        current_session.created_at = newer_session.created_at
        AND current_session.token < newer_session.token
      )
    );
  CREATE UNIQUE INDEX IF NOT EXISTS sessions_user_uidx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    type TEXT NOT NULL CHECK (type IN ('creditor','debtor')),
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS clients_org_idx ON clients(organization_id);

  CREATE TABLE IF NOT EXISTS sequences (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (organization_id, name)
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contract_number BIGINT NOT NULL,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
    operation_type TEXT NOT NULL DEFAULT 'debit_on_client'
      CHECK (operation_type IN ('debit_on_client','credit_on_client')),
    contract_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, contract_number)
  );
  CREATE INDEX IF NOT EXISTS contracts_org_idx ON contracts(organization_id);
  CREATE INDEX IF NOT EXISTS contracts_client_idx ON contracts(client_id);

  CREATE TABLE IF NOT EXISTS vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    voucher_number BIGINT NOT NULL,
    voucher_type TEXT NOT NULL CHECK (voucher_type IN ('receipt','payment')),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    amount_text TEXT NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, voucher_number)
  );
  CREATE INDEX IF NOT EXISTS vouchers_org_idx ON vouchers(organization_id);
  CREATE INDEX IF NOT EXISTS vouchers_client_idx ON vouchers(client_id);

  CREATE TABLE IF NOT EXISTS settings (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, key)
  );

  CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS services_org_name_lower_uidx
    ON services (organization_id, (lower(name)));

  CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_number BIGINT NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_name TEXT,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_text TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, invoice_number)
  );
  CREATE INDEX IF NOT EXISTS invoices_org_idx ON invoices(organization_id);

  CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(invoice_id);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS audit_logs_org_idx ON audit_logs(organization_id);
  CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
`;

async function initializeDatabase(): Promise<void> {
  await pool.query(schemaSql);
  const owner = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['platform_owner']);
  if (!owner.rowCount) {
    const createdOwner = await pool.query<{ id: string }>(`
      INSERT INTO users
        (arabic_name, username, password_hash, role, permission_mode, is_active, access_signature)
      VALUES ($1, $2, $3, 'platform_owner', 'all', true, '')
      RETURNING id
    `, ['مالك البرنامج', process.env.MAIN_OWNER_USERNAME || 'mainowner', platformOwnerHash()]);
    await refreshAccessSignature(pool, createdOwner.rows[0].id);
  }
  const unsignedUsers = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE access_signature IS NULL'
  );
  for (const user of unsignedUsers.rows) {
    await refreshAccessSignature(pool, user.id);
  }
  await pool.query('ALTER TABLE users ALTER COLUMN access_signature SET NOT NULL');
}

export async function ensureDatabase(): Promise<void> {
  if (!global._maktabSchemaReady) {
    global._maktabSchemaReady = initializeDatabase().catch((error) => {
      global._maktabSchemaReady = undefined;
      throw error;
    });
  }
  await global._maktabSchemaReady;
}

export interface DbExecutor {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  await ensureDatabase();
  return (await pool.query<T>(text, values)).rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}

export async function execute(text: string, values: unknown[] = []): Promise<number> {
  await ensureDatabase();
  return (await pool.query(text, values)).rowCount ?? 0;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function nextSequence(
  organizationId: string,
  name: 'contract_number' | 'voucher_number' | 'invoice_number',
  client?: PoolClient
): Promise<number> {
  await ensureDatabase();
  const executor = client ?? pool;
  const result = await executor.query<{ value: string }>(`
    INSERT INTO sequences (organization_id, name, value)
    VALUES ($1, $2, 1)
    ON CONFLICT (organization_id, name)
    DO UPDATE SET value = sequences.value + 1
    RETURNING value
  `, [organizationId, name]);
  return Number(result.rows[0].value);
}
