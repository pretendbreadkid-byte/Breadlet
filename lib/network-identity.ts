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
  return {
    ipHash: hash(ip),
    deviceHash: /^[0-9a-f-]{36}$/i.test(device) ? hash(`device:${device.toLowerCase()}`) : '',
  };
}

export async function isNetworkBanned(admin: any, request: Request) {
  const { ipHash, deviceHash } = networkIdentity(request);
  const { data, error } = await admin.rpc('network_ban_active', { p_device_hash: deviceHash, p_ip_hash: ipHash });
  return !error && data === true;
}

// Remembers which devices and IPs an account uses, so a ban can follow it.
export async function recordAccountDevice(admin: any, request: Request, profileId: string) {
  const { ipHash, deviceHash } = networkIdentity(request);
  await admin.from('account_devices').upsert(
    { profile_id: profileId, device_hash: deviceHash, ip_hash: ipHash, last_seen_at: new Date().toISOString() },
    { onConflict: 'profile_id,device_hash,ip_hash' },
  ).then(() => undefined, () => undefined);
}

export async function deviceHasAccount(admin: any, request: Request) {
  const { deviceHash } = networkIdentity(request);
  if (!deviceHash) return false;
  const { data } = await admin.from('account_devices').select('profile_id').eq('device_hash', deviceHash).limit(1);
  return Boolean(data?.length);
}

export const NETWORK_BANNED_MESSAGE = 'This device or network is banned from Breadlet.';
