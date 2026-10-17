import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Clan service is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: clans, error: clansErr }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from('clans').select('id, name, description, tags, treasury, member_count, member_capacity, owner_profile_id, thumbnail_url, banner_unlocked, banner_data, name_change_unlocked, colors_unlocked, theme, animated_profiles, created_at').order('treasury', { ascending: false }),
    user ? supabase.from('clan_members').select('clan_id, role, token_contributions').eq('profile_id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  if (clansErr) return NextResponse.json({ error: clansErr.message }, { status: 500 });
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });

  let requests: { id: string; clan_id: string; profile_id: string; username: string; created_at: string }[] = [];
  let myRequests: { id: string; clan_id: string; status: string }[] = [];
  let members: { profileId: string; username: string; role: string; tokenContributions: number; equippedBlook: string }[] = [];
  if (user) {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Clan request service is not configured.' }, { status: 503 });
    if (membership?.clan_id) {
      const { data: memberRows, error: memberError } = await admin.from('clan_members')
        .select('profile_id, role, token_contributions')
        .eq('clan_id', membership.clan_id);
      if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
      const memberIds = (memberRows || []).map((member) => member.profile_id);
      const { data: memberProfiles, error: memberProfilesError } = memberIds.length
        ? await admin.from('profiles').select('id, username, equipped_blook_id').in('id', memberIds)
        : { data: [], error: null };
      if (memberProfilesError) return NextResponse.json({ error: memberProfilesError.message }, { status: 500 });
      const equippedIds = Array.from(new Set((memberProfiles || []).map((profile) => profile.equipped_blook_id).filter((id): id is string => Boolean(id))));
      const { data: equippedBlooks, error: equippedBlooksError } = equippedIds.length
        ? await admin.from('blooks').select('id, name').in('id', equippedIds)
        : { data: [], error: null };
      if (equippedBlooksError) return NextResponse.json({ error: equippedBlooksError.message }, { status: 500 });
      const profileById = new Map((memberProfiles || []).map((profile) => [profile.id, profile]));
      const blookNameById = new Map((equippedBlooks || []).map((blook) => [blook.id, blook.name]));
      members = (memberRows || []).map((member) => {
        const profile = profileById.get(member.profile_id);
        return {
          profileId: member.profile_id,
          username: profile?.username || 'Player',
          role: member.role,
          tokenContributions: Number(member.token_contributions) || 0,
          equippedBlook: profile?.equipped_blook_id ? blookNameById.get(profile.equipped_blook_id) || '' : '',
        };
      });
    }
    const ownedClanIds = (clans || []).filter((clan) => clan.owner_profile_id === user.id).map((clan) => clan.id);
    const [requestResult, myRequestResult] = await Promise.all([
      ownedClanIds.length
        ? admin.from('clan_join_requests').select('id, clan_id, profile_id, created_at').in('clan_id', ownedClanIds).eq('status', 'pending').order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      admin.from('clan_join_requests').select('id, clan_id, status').eq('profile_id', user.id).in('status', ['pending', 'approved']),
    ]);
    if (requestResult.error) return NextResponse.json({ error: requestResult.error.message }, { status: 500 });
    if (myRequestResult.error) return NextResponse.json({ error: myRequestResult.error.message }, { status: 500 });
    const requesterIds = Array.from(new Set((requestResult.data || []).map((request) => request.profile_id)));
    const { data: requestProfiles, error: profilesError } = requesterIds.length
      ? await admin.from('profiles').select('id, username').in('id', requesterIds)
      : { data: [], error: null };
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });
    const usernameByProfileId = new Map((requestProfiles || []).map((profile) => [profile.id, profile.username]));
    requests = (requestResult.data || []).map((request) => ({
      id: request.id,
      clan_id: request.clan_id,
      profile_id: request.profile_id,
      username: usernameByProfileId.get(request.profile_id) || 'Player',
      created_at: request.created_at,
    }));
    myRequests = myRequestResult.data || [];
  }
  return NextResponse.json({ clans: clans || [], membership: membership || null, members, requests, myRequests });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json();
  const name = String(body.name || '').trim().slice(0, 30);
  const description = String(body.description || '').trim().slice(0, 200);
  const tags = Array.isArray(body.tags) ? body.tags.map((t: string) => String(t).trim()).filter(Boolean).slice(0, 3) : [];
  const thumbnailUrl = String(body.thumbnailUrl || '').trim().slice(0, 2_000_000);

  if (!name || name.length < 2) return NextResponse.json({ error: 'Clan name must be at least 2 characters.' }, { status: 400 });

  const { data, error } = await supabase.rpc('create_clan_with_cost', {
    p_name: name,
    p_description: description,
    p_tags: tags,
    p_thumbnail_url: thumbnailUrl || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json();
  const clanId = body.clanId;
  const action = String(body.action || 'donate');
  const amount = Math.max(1, Math.floor(Number(body.amount) || 100));
  if (action !== 'review_request' && !clanId) return NextResponse.json({ error: 'Clan ID is required.' }, { status: 400 });

  if (action === 'request') {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Clan requests are not configured.' }, { status: 503 });
    const { data, error } = await admin.rpc('secure_clan_join_request', { p_profile_id: user.id, p_clan_id: clanId });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ ok: true, requestId: data }, { status: 201 });
  }

  if (action === 'review_request') {
    const decision = String(body.decision || '');
    if (!body.requestId || !['approved', 'declined'].includes(decision)) return NextResponse.json({ error: 'A request and valid decision are required.' }, { status: 400 });
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Clan request reviews are not configured.' }, { status: 503 });
    const { data, error } = await admin.rpc('secure_clan_review_join_request', {
      p_owner_profile_id: user.id,
      p_request_id: body.requestId,
      p_decision: decision,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(data);
  }

  if (action === 'upgrade') {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Clan upgrades are not configured.' }, { status: 503 });
    const { data, error } = await admin.rpc('secure_clan_upgrade', {
      p_profile_id: user.id,
      p_clan_id: clanId,
      p_feature: String(body.feature || ''),
      p_value: typeof body.value === 'string' ? body.value : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(data);
  }

  if (action === 'leave') {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Clan leaving is not configured.' }, { status: 503 });
    const { data, error } = await admin.rpc('secure_clan_leave', {
      p_profile_id: user.id,
      p_clan_id: clanId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json(data);
  }

  if (action === 'join') {
    return NextResponse.json({ error: 'Use a clan request; the owner must approve it.' }, { status: 400 });
  }

  if (action !== 'donate') return NextResponse.json({ error: 'Invalid clan action.' }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Clan donations are not configured.' }, { status: 503 });
  const { data: treasury, error } = await admin.rpc('secure_clan_donation', { p_profile_id: user.id, p_clan_id: clanId, p_amount: amount });
  if (error) return NextResponse.json({ error: error.code === 'PGRST202' ? 'Apply migration 0015_secure_gameplay.sql to enable protected clan donations.' : error.message }, { status: 409 });
  return NextResponse.json({ ok: true, treasury });
}
