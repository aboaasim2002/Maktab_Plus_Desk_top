import { createHmac, timingSafeEqual } from 'crypto';
import type { DbExecutor } from './postgres';

export interface AccessSignatureUser {
  id: string;
  organization_id: string | null;
  username: string;
  role: string;
  permission_mode: string;
  is_active: boolean;
}

function integritySecret(): string {
  const secret = process.env.ACCESS_INTEGRITY_SECRET
    || process.env.AUTH_INTEGRITY_SECRET
    || process.env.MAIN_OWNER_PASSWORD
    || process.env.DATABASE_URL;
  if (!secret) {
    throw new Error('ACCESS_INTEGRITY_SECRET is required to protect user roles and permissions');
  }
  return secret;
}

function normalizedPermissions(permissions: string[]): string[] {
  return [...new Set(permissions)].sort();
}

export function createAccessSignature(
  user: AccessSignatureUser,
  permissions: string[] = []
): string {
  const payload = JSON.stringify({
    id: user.id,
    organization_id: user.organization_id,
    username: user.username,
    role: user.role,
    permission_mode: user.permission_mode,
    is_active: user.is_active,
    permissions: normalizedPermissions(permissions),
  });

  return createHmac('sha256', integritySecret()).update(payload).digest('hex');
}

export function verifyAccessSignature(
  user: AccessSignatureUser,
  permissions: string[],
  signature: string | null | undefined
): boolean {
  if (!signature) return false;
  const expected = createAccessSignature(user, permissions);
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function refreshAccessSignature(
  executor: DbExecutor,
  userId: string
): Promise<void> {
  const userResult = await executor.query<AccessSignatureUser>(
    'SELECT id, organization_id, username, role, permission_mode, is_active FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) return;

  const permissionResult = await executor.query<{ permission: string }>(
    'SELECT permission FROM user_permissions WHERE user_id = $1',
    [userId]
  );
  const signature = createAccessSignature(
    user,
    permissionResult.rows.map((item) => item.permission)
  );
  await executor.query('UPDATE users SET access_signature = $1 WHERE id = $2', [signature, userId]);
}
