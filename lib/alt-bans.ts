import { isProtectedFromMute } from './admin-access';
import { networkIdentity } from './network-identity';

export const ALT_BAN_REASON = 'Alt accounts (more than one account on the same device)';

// Bans every account seen on this request's device when more than one account uses it: the
// alts and the player making them. No admin confirmation; banned players can appeal instead.
// Skipped: groups with a staff account (the owner's test alts), and accounts whose appeal was
// approved (stats.altAppealApproved), so they aren't banned again on their next visit.
export async function autoBanDeviceAlts(admin: any, request: Request) {
  const { deviceHash } = networkIdentity(request);
  if (!deviceHash) return;
  const { data: links } = await admin.from('account_devices').select('profile_id').eq('device_hash', deviceHash);
  const ids = Array.from(new Set((links || []).map((link: any) => link.profile_id)));
  if (ids.length < 2) return;

  const { data: profiles } = await admin.from('profiles').select('id, username, is_banned, stats').in('id', ids);
  if (!profiles?.length || profiles.some((profile: any) => isProtectedFromMute(profile.username))) return;
  const targets = profiles.filter((profile: any) => !profile.is_banned && !profile.stats?.altAppealApproved);
  if (!targets.length) return;

  const targetIds = targets.map((profile: any) => profile.id);
  const { error } = await admin.from('bans').insert(targetIds.map((id: string) => ({ profile_id: id, reason: ALT_BAN_REASON, is_permanent: true })));
  if (error) return;
  await admin.from('profiles').update({ is_banned: true, ban_reason: ALT_BAN_REASON, ban_expires_at: null }).in('id', targetIds);
  // The ban trigger (migration 0052) also bans every IP these accounts used. Automatic bans
  // keep only the device ban, so shared school or family Wi-Fi isn't locked out.
  await admin.from('network_bans').delete().eq('kind', 'ip').in('profile_id', targetIds);
}
