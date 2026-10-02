import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json([], { status: 200 });
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: clans, error: clansErr }, { data: membership }] = await Promise.all([
    supabase.from('clans').select('id, name, description, tags, treasury, member_count, owner_profile_id, thumbnail_url, created_at').order('treasury', { ascending: false }),
    user ? supabase.from('clan_members').select('clan_id, role, token_contributions').eq('profile_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (clansErr) return NextResponse.json({ error: clansErr.message }, { status: 500 });
  return NextResponse.json({ clans: clans || [], membership: membership || null });
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
  if (!clanId) return NextResponse.json({ error: 'Clan ID is required.' }, { status: 400 });

  if (action === 'leave') {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Clan leaving is not configured.' }, { status: 503 });
    const [{ data: membership }, { data: members }, { data: profile }] = await Promise.all([
      admin.from('clan_members').select('id, role').eq('profile_id', user.id).eq('clan_id', clanId).maybeSingle(),
      admin.from('clan_members').select('id, profile_id, role, joined_at').eq('clan_id', clanId).order('joined_at', { ascending: true }),
      admin.from('profiles').select('stats').eq('id', user.id).single(),
    ]);
    if (!membership) return NextResponse.json({ error: 'You are not a member of that clan.' }, { status: 400 });
    const otherMembers = (members || []).filter((member) => member.profile_id !== user.id);
    if (membership.role === 'leader' && otherMembers.length) {
      const nextLeader = otherMembers[0];
      const { error: promoteError } = await admin.from('clan_members').update({ role: 'leader' }).eq('id', nextLeader.id);
      if (promoteError) return NextResponse.json({ error: promoteError.message }, { status: 400 });
      const { error: ownerError } = await admin.from('clans').update({ owner_profile_id: nextLeader.profile_id }).eq('id', clanId);
      if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 400 });
    }
    const { error: leaveError } = await admin.from('clan_members').delete().eq('id', membership.id);
    if (leaveError) return NextResponse.json({ error: leaveError.message }, { status: 400 });
    if (otherMembers.length) {
      await admin.from('clans').update({ member_count: Math.max(1, (members || []).length - 1) }).eq('id', clanId);
    } else {
      await admin.from('clans').delete().eq('id', clanId);
    }
    await admin.from('profiles').update({ stats: { ...(profile?.stats || {}), clanTag: '' } }).eq('id', user.id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'join') {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Clan joining is not configured.' }, { status: 503 });
    const [{ data: membership }, { data: clan, error: clanError }, { data: profile }] = await Promise.all([
      admin.from('clan_members').select('clan_id').eq('profile_id', user.id).limit(1).maybeSingle(),
      admin.from('clans').select('id, name, description, tags, treasury, member_count, thumbnail_url').eq('id', clanId).maybeSingle(),
      admin.from('profiles').select('stats').eq('id', user.id).single(),
    ]);
    if (membership) return NextResponse.json({ error: 'You are already in a clan.' }, { status: 400 });
    if (clanError || !clan) return NextResponse.json({ error: 'Clan not found.' }, { status: 404 });
    if (clan.member_count >= 25) return NextResponse.json({ error: 'That clan is full.' }, { status: 400 });

    const { data: joined, error: joinError } = await admin.from('clan_members').insert({
      clan_id: clan.id,
      profile_id: user.id,
      role: 'member',
      token_contributions: 0,
    }).select('id').single();
    if (joinError || !joined) return NextResponse.json({ error: joinError?.message || 'Could not join that clan.' }, { status: 400 });

    const { data: updatedClan, error: countError } = await admin.from('clans')
      .update({ member_count: clan.member_count + 1 })
      .eq('id', clan.id)
      .eq('member_count', clan.member_count)
      .lt('member_count', 25)
      .select('member_count')
      .maybeSingle();
    if (countError || !updatedClan) {
      await admin.from('clan_members').delete().eq('id', joined.id);
      return NextResponse.json({ error: 'That clan filled up. Try another clan.' }, { status: 409 });
    }

    const clanTag = clan.name.slice(0, 5).toUpperCase();
    const { error: profileError } = await admin.from('profiles').update({
      stats: { ...(profile?.stats || {}), clanTag },
    }).eq('id', user.id);
    if (profileError) {
      await Promise.all([
        admin.from('clan_members').delete().eq('id', joined.id),
        admin.from('clans').update({ member_count: clan.member_count }).eq('id', clan.id).eq('member_count', clan.member_count + 1),
      ]);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, clan: { ...clan, member_count: updatedClan.member_count }, clanTag });
  }

  const [{ data: profile }, { data: clan }] = await Promise.all([
    supabase.from('profiles').select('tokens').eq('id', user.id).single(),
    supabase.from('clans').select('id, treasury').eq('id', clanId).single(),
  ]);

  if (!profile || profile.tokens < amount) {
    return NextResponse.json({ error: 'Insufficient tokens.' }, { status: 400 });
  }
  if (!clan) return NextResponse.json({ error: 'Clan not found.' }, { status: 404 });

  await Promise.all([
    supabase.from('profiles').update({ tokens: profile.tokens - amount }).eq('id', user.id),
    supabase.from('clans').update({ treasury: (clan.treasury || 0) + amount }).eq('id', clanId),
  ]);

  return NextResponse.json({ ok: true, treasury: (clan.treasury || 0) + amount });
}
