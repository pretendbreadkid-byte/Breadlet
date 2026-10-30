import { NextResponse } from 'next/server';
import { hasAdminAccess } from '../../../../lib/admin-access';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Device and network (IP) bans left by banned players (migration 0052). Lifting one lets other
// people on that device or Wi-Fi play again; the banned account itself stays banned.
async function adminSession() {
  const sessionClient = await createClient();
  if (!sessionClient) return { error: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  const supabase = createAdminClient();
  if (!supabase) return { error: NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 }) };
  if (!(await hasAdminAccess(supabase, user.id))) return { error: NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 }) };
  return { supabase };
}

// GET: active network bans grouped by the player who caused them.
export async function GET() {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const now = new Date().toISOString();
  const { data, error } = await session.supabase.from('network_bans').select('kind, profile_id, expires_at, created_at').or(`expires_at.is.null,expires_at.gt.${now}`).limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const groups = new Map<string, { profileId: string; devices: number; networks: number; expiresAt: string | null; createdAt: string }>();
  for (const row of data || []) {
    const group = groups.get(row.profile_id) || { profileId: row.profile_id, devices: 0, networks: 0, expiresAt: row.expires_at, createdAt: row.created_at };
    if (row.kind === 'device') group.devices += 1; else group.networks += 1;
    // Show the latest end (null means a device ban that never ends).
    if (group.expiresAt !== null && (row.expires_at === null || row.expires_at > group.expiresAt)) group.expiresAt = row.expires_at;
    if (row.created_at < group.createdAt) group.createdAt = row.created_at;
    groups.set(row.profile_id, group);
  }
  const ids = Array.from(groups.keys());
  const { data: profiles } = ids.length ? await session.supabase.from('profiles').select('id, username, is_banned').in('id', ids) : { data: [] };
  const byId = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return NextResponse.json(Array.from(groups.values())
    .map((group) => ({ ...group, username: byId.get(group.profileId)?.username || 'Unknown player', stillBanned: Boolean(byId.get(group.profileId)?.is_banned) }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
}

// POST { profileId } lifts that player's device and network bans; { all: true } lifts every one.
export async function POST(request: Request) {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const body = await request.json().catch(() => ({}));
  const profileId = String(body.profileId || '');
  if (!body.all && !profileId) return NextResponse.json({ error: 'Choose whose network bans to lift.' }, { status: 400 });
  const query = session.supabase.from('network_bans').delete();
  const { error } = body.all ? await query.neq('value_hash', '') : await query.eq('profile_id', profileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
