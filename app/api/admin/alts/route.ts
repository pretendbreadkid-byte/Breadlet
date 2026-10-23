import { NextResponse } from 'next/server';
import { hasAdminAccess, isProtectedFromMute } from '../../../../lib/admin-access';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Account = { id: string; username: string; created_at: string; is_banned: boolean; tokens: number };

// Suspected alt accounts: groups of accounts seen on the same device (strong signal) or the same
// network (weak signal: could just be a school). Built from account_devices (migration 0052).
export async function GET() {
  const sessionClient = await createClient();
  if (!sessionClient) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const database = createAdminClient();
  if (!database) return NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 });
  if (!(await hasAdminAccess(database, user.id))) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });

  const { data: links, error } = await database.from('account_devices').select('profile_id, device_hash, ip_hash').limit(20000);
  if (error) return NextResponse.json({ error: error.code === '42P01' ? 'Run migration 0052 in Supabase first; alt detection uses the device records it creates.' : error.message }, { status: 500 });

  const groupBy = (key: 'device_hash' | 'ip_hash') => {
    const groups = new Map<string, Set<string>>();
    for (const link of links || []) {
      const value = link[key];
      if (!value) continue;
      if (!groups.has(value)) groups.set(value, new Set());
      groups.get(value)!.add(link.profile_id);
    }
    return Array.from(groups.values()).filter((ids) => ids.size > 1).map((ids) => Array.from(ids));
  };
  const deviceGroups = groupBy('device_hash');
  const deviceKeys = new Set(deviceGroups.map((ids) => [...ids].sort().join(',')));
  // Big network groups are almost certainly schools; only small ones are worth a look.
  const networkGroups = groupBy('ip_hash').filter((ids) => ids.length <= 6 && !deviceKeys.has([...ids].sort().join(',')));

  const ids = Array.from(new Set([...deviceGroups, ...networkGroups].flat()));
  const { data: profiles } = ids.length
    ? await database.from('profiles').select('id, username, created_at, is_banned, tokens').in('id', ids)
    : { data: [] as Account[] };
  const byId = new Map((profiles || []).map((profile: Account) => [profile.id, profile]));
  // Oldest account first: it's most likely the player's main.
  const describe = (group: string[]) => group.map((id) => byId.get(id)).filter(Boolean)
    .sort((a, b) => new Date(a!.created_at).getTime() - new Date(b!.created_at).getTime())
    .map((profile) => ({ ...profile!, staff: isProtectedFromMute(profile!.username) }));

  return NextResponse.json({
    sameDevice: deviceGroups.map(describe).filter((group) => group.length > 1),
    sameNetwork: networkGroups.map(describe).filter((group) => group.length > 1),
  });
}
