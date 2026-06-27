import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { execute, one, query, transaction } from './postgres';
import type { Permission } from './permissions';
import { verifyAccessSignature } from './access-integrity';

export interface SessionUser {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  arabic_name: string;
  username: string;
  role: 'platform_owner' | 'office_owner' | 'user';
  permission_mode: 'all' | 'custom';
  permissions: string[];
  subscription_status: string | null;
  subscription_ends_at: string | null;
  is_impersonating: boolean;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$v1$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.startsWith('scrypt$v1$') ? stored.split('$') : stored.split(':');
  const salt = stored.startsWith('scrypt$v1$') ? parts[2] : parts[0];
  const hash = stored.startsWith('scrypt$v1$') ? parts[3] : parts[1];
  if (!salt || !hash) return false;
  try {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeUsername(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);
    await client.query('DELETE FROM sessions WHERE expires_at <= now() OR user_id = $1', [userId]);
    await client.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, userId, expiresAt]
    );
  });
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await execute('DELETE FROM sessions WHERE token = $1', [token]);
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get('cookie') ?? '';
  for (const part of cookies.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = cookieValue(request, 'office_session');
  if (!token) return null;
  const row = await one<Omit<SessionUser, 'permissions'> & {
    access_signature: string;
    is_active: boolean;
  }>(`
    SELECT u.id,
      CASE WHEN u.role='platform_owner' THEN s.active_organization_id ELSE u.organization_id END AS organization_id,
      o.name AS organization_name,
      u.arabic_name, u.username, u.role, u.permission_mode, u.is_active, u.access_signature,
      o.subscription_status, o.subscription_ends_at,
      (u.role='platform_owner' AND s.active_organization_id IS NOT NULL) AS is_impersonating
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN organizations o ON o.id = CASE
      WHEN u.role='platform_owner' THEN s.active_organization_id
      ELSE u.organization_id
    END
    WHERE s.token = $1
      AND s.expires_at > now()
      AND u.is_active = true
      AND (
        u.role = 'platform_owner'
        OR (
          o.is_active = true
          AND o.subscription_status IN ('trial', 'active')
          AND (o.subscription_ends_at IS NULL OR o.subscription_ends_at >= now())
        )
      )
  `, [token]);
  if (!row) return null;
  const permissions = await query<{ permission: string }>(
    'SELECT permission FROM user_permissions WHERE user_id = $1',
    [row.id]
  );
  const permissionKeys = permissions.map((item) => item.permission);
  const signatureUser = {
    id: row.id,
    organization_id: row.role === 'platform_owner' ? null : row.organization_id,
    username: row.username,
    role: row.role,
    permission_mode: row.permission_mode,
    is_active: row.is_active,
  };
  if (!verifyAccessSignature(signatureUser, permissionKeys, row.access_signature)) {
    await deleteSession(token);
    return null;
  }
  const { access_signature, is_active, ...user } = row;
  return { ...user, permissions: permissionKeys };
}

export function hasPermission(user: SessionUser, permission: Permission | string): boolean {
  return user.role === 'platform_owner'
    || user.role === 'office_owner'
    || user.permission_mode === 'all'
    || user.permissions.includes(permission);
}

export function isOwnDataOnly(user: SessionUser): boolean {
  return user.role === 'user'
    && user.permission_mode === 'custom'
    && user.permissions.includes('scope.own_only');
}

export async function audit(
  user: Pick<SessionUser, 'id' | 'organization_id'> | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: unknown
): Promise<void> {
  await execute(`
    INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, details)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
  `, [
    user?.organization_id ?? null,
    user?.id ?? null,
    action,
    entityType,
    entityId ?? null,
    details === undefined ? null : JSON.stringify(details),
  ]);
}
