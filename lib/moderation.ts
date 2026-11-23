// Moderation shared by the profile panels (app/api/moderation): bans with device and IP bans,
// mutes and the "kill" (a WASTED screen and a 30 second mute).

export const KILL_MUTE_SECONDS = 30;

// Bans an account. With fullIp the device, fingerprint and IP bans last the whole ban; without it
// IPs are blocked for up to 7 days (devices still for the whole ban).
export async function banPlayer(database: any, targetId: string, byId: string, reason: string, hours: number, fullIp: boolean) {
  const expiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
  const { error } = await database.from('bans').insert({ profile_id: targetId, reason, is_permanent: !hours, expires_at: expiresAt, created_by_admin_id: byId });
  if (error) return { error: error.message as string };
  await database.from('profiles').update({ is_banned: true, ban_reason: reason, ban_expires_at: expiresAt }).eq('id', targetId);
  const withFingerprints = await database.from('account_devices').select('device_hash, ip_hash, fingerprint_hash').eq('profile_id', targetId);
  const seen: any[] = (withFingerprints.error ? (await database.from('account_devices').select('device_hash, ip_hash').eq('profile_id', targetId)).data : withFingerprints.data) || [];
  const unique = (key: string) => Array.from(new Set(seen.map((row: any) => row[key]).filter(Boolean))) as string[];
  const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const ipExpires = fullIp ? expiresAt : (!expiresAt || expiresAt > week ? week : expiresAt);
  const ips = unique('ip_hash');
  const rows = [
    ...unique('device_hash').map((hash) => ({ kind: 'device', value_hash: hash, profile_id: targetId, expires_at: expiresAt })),
    ...unique('fingerprint_hash').map((hash) => ({ kind: 'fingerprint', value_hash: hash, profile_id: targetId, expires_at: expiresAt })),
    ...ips.map((hash) => ({ kind: 'ip', value_hash: hash, profile_id: targetId, expires_at: ipExpires })),
  ];
  await database.from('network_bans').delete().eq('profile_id', targetId);
  if (rows.length) {
    const { error: networkError } = await database.from('network_bans').insert(rows);
    if (networkError) return { error: `The account is banned, but its devices and IPs couldn't be: ${networkError.message}` };
  }
  return { ok: true as const, ips: ips.length };
}

// Mutes for minutes (0 unmutes). keepLonger: don't shorten a mute that already lasts longer.
export async function mutePlayer(database: any, targetId: string, seconds: number, keepLonger = false) {
  const { data: target } = await database.from('profiles').select('stats').eq('id', targetId).maybeSingle();
  if (!target) return { error: 'Player not found.' };
  const { chatMutedUntil, ...stats } = (target.stats || {}) as Record<string, unknown>;
  let until = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
  if (keepLonger && typeof chatMutedUntil === 'string' && until && Date.parse(chatMutedUntil) > Date.parse(until)) until = chatMutedUntil;
  const { error } = await database.from('profiles').update({ stats: until ? { ...stats, chatMutedUntil: until } : stats }).eq('id', targetId);
  if (error) return { error: error.message as string };
  if (!until) await database.from('chat_auto_mutes').delete().eq('profile_id', targetId);
  return { ok: true as const, until };
}
