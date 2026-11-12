import { createHash } from 'node:crypto';

export const DEVICE_COOKIE = 'breadlet_device';

const salt = () => process.env.SIGNUP_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'breadlet-signup-limit';
const hash = (value: string) => createHash('sha256').update(`${salt()}:${value}`).digest('hex');

function readCookie(request: Request, name: string) {
  const match = (request.headers.get('cookie') || '').split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

// Hashed IP and device ID for this request. The device ID is a random UUID kept in a
// cookie (and mirrored to localStorage by the client), so it survives IP/proxy changes.
export function networkIdentity(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
  const device = readCookie(request, DEVICE_COOKIE);
  // The browser fingerprint (lib/device-fingerprint.ts), sent on signup and login.
  const fingerprint = request.headers.get('x-breadlet-fp') || '';
  return {
    ipHash: hash(ip),
    deviceHash: /^[0-9a-f-]{36}$/i.test(device) ? hash(`device:${device.toLowerCase()}`) : '',
    fingerprintHash: /^[0-9a-f]{64}$/.test(fingerprint) ? hash(`fp:${fingerprint}`) : '',
  };
}

// A banned player's browser fingerprint. Only checked when making a new account: identical school
// computers can share a fingerprint, so it never locks anyone out of an account they already have.
// Needs migration 0084; before that it never matches.
export async function isFingerprintBanned(admin: any, request: Request) {
  const { fingerprintHash } = networkIdentity(request);
  if (!fingerprintHash) return false;
  const { data, error } = await admin.from('network_bans').select('expires_at').eq('kind', 'fingerprint').eq('value_hash', fingerprintHash);
  return !error && (data || []).some((ban: any) => !ban.expires_at || Date.parse(ban.expires_at) > Date.now());
}

// Bans this request's fingerprint for a banned account (it tried to log in, so now we know it).
export async function banFingerprintFor(admin: any, request: Request, profileId: string, expiresAt: string | null) {
  const { fingerprintHash } = networkIdentity(request);
  if (!fingerprintHash) return;
  await admin.from('network_bans').upsert(
    { kind: 'fingerprint', value_hash: fingerprintHash, profile_id: profileId, expires_at: expiresAt },
    { onConflict: 'kind,value_hash,profile_id' },
  ).then(() => undefined, () => undefined);
}

export async function isNetworkBanned(admin: any, request: Request) {
  const { ipHash, deviceHash } = networkIdentity(request);
  const { data, error } = await admin.rpc('network_ban_active', { p_device_hash: deviceHash, p_ip_hash: ipHash });
  return !error && data === true;
}

// Remembers which devices and IPs an account uses, so a ban can follow it. Each server instance
// writes a given account+device+IP at most once every 15 minutes (it used to write on every
// page load). Returns true when it wrote.
const RECORD_EVERY_MS = 15 * 60 * 1000;
const recentlyRecorded = new Map<string, number>();
export async function recordAccountDevice(admin: any, request: Request, profileId: string) {
  const { ipHash, deviceHash, fingerprintHash } = networkIdentity(request);
  const key = `${profileId}|${deviceHash}|${ipHash}|${fingerprintHash}`;
  const now = Date.now();
  if (now - (recentlyRecorded.get(key) || 0) < RECORD_EVERY_MS) return false;
  recentlyRecorded.set(key, now);
  if (recentlyRecorded.size > 5000) recentlyRecorded.delete(recentlyRecorded.keys().next().value as string);
  await admin.from('account_devices').upsert(
    { profile_id: profileId, device_hash: deviceHash, ip_hash: ipHash, last_seen_at: new Date().toISOString() },
    { onConflict: 'profile_id,device_hash,ip_hash' },
  ).then(() => undefined, () => undefined);
  // Separate write so device tracking keeps working before migration 0084 adds the column.
  if (fingerprintHash) {
    await admin.from('account_devices').update({ fingerprint_hash: fingerprintHash })
      .match({ profile_id: profileId, device_hash: deviceHash, ip_hash: ipHash }).then(() => undefined, () => undefined);
  }
  return true;
}

export async function deviceHasAccount(admin: any, request: Request) {
  const { deviceHash } = networkIdentity(request);
  if (!deviceHash) return false;
  const { data } = await admin.from('account_devices').select('profile_id').eq('device_hash', deviceHash).limit(1);
  return Boolean(data?.length);
}

export const NETWORK_BANNED_MESSAGE = 'This device or network is banned from Breadlet.';
