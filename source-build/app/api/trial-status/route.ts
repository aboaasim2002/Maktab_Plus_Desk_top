import { NextResponse } from 'next/server';

export async function GET() {
  const isTrial = process.env.ELECTRON_IS_TRIAL === '1';
  const expiresAt = process.env.ELECTRON_TRIAL_EXPIRES_AT || null;
  const envDaysRemaining = Number(process.env.ELECTRON_TRIAL_DAYS_REMAINING);

  let daysRemaining = Number.isFinite(envDaysRemaining) ? envDaysRemaining : 0;
  if (expiresAt) {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();
    daysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  }

  return NextResponse.json({
    isTrial,
    valid: isTrial ? daysRemaining > 0 : true,
    daysRemaining,
    expiresAt,
  });
}
