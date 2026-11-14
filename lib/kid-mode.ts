import { NextResponse } from 'next/server';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from './supabase/admin';

// Kid accounts (profiles.stats.kidMode, set at signup or in Settings with a grown-up PIN) can't chat,
// trade, use the Bazaar, add friends, join clans, react or play coin flips. Players can't send them
// trades or friend requests either. Only the server can change profiles, so the flag can't be faked.
export const KID_MODE_MESSAGE = "Kid accounts can't do that. A grown-up can change kid mode in Settings.";
export const KID_TARGET_MESSAGE = "That player has a kid account, so they can't trade or add friends.";

export const isKidStats = (stats: unknown) => Boolean(stats && typeof stats === 'object' && (stats as Record<string, unknown>).kidMode === true);

export async function isKidAccount(profileId: string, database?: any) {
  const admin = database || createAdminClient();
  if (!admin || !profileId) return false;
  const { data } = await admin.from('profiles').select('stats').eq('id', profileId).maybeSingle();
  return isKidStats(data?.stats);
}

// Returns a 403 response when this player is a kid account, otherwise null.
export async function kidModeBlock(profileId: string, database?: any) {
  return (await isKidAccount(profileId, database)) ? NextResponse.json({ error: KID_MODE_MESSAGE }, { status: 403 }) : null;
}

// Grown-up PIN (4 digits). Kept hashed in kid_mode_pins, which players can't read (migration 0093).
export const isPin = (pin: unknown) => typeof pin === 'string' && /^\d{4}$/.test(pin);
export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
}
export function pinMatches(pin: string, stored: string) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const given = scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === given.length && timingSafeEqual(given, expected);
}

// Switches kid mode on with a grown-up PIN (signup and Settings).
export async function turnOnKidMode(admin: any, profileId: string, pin: string) {
  const { data: profile } = await admin.from('profiles').select('stats').eq('id', profileId).maybeSingle();
  if (!profile) return 'Player not found.';
  const { error: pinError } = await admin.from('kid_mode_pins').upsert({ profile_id: profileId, pin_hash: hashPin(pin), failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() });
  if (pinError) return pinError.code === '42P01' || pinError.code === 'PGRST205' ? 'Kid accounts are not switched on yet.' : pinError.message;
  const { error } = await admin.from('profiles').update({ stats: { ...(profile.stats || {}), kidMode: true } }).eq('id', profileId);
  return error ? error.message : '';
}
