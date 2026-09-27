import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  console.log('[CHAT_GET] Starting GET /api/chat');
  const supabase = await createClient();
  if (!supabase) {
    console.log('[CHAT_GET] Supabase not configured');
    return NextResponse.json([], { status: 200 });
  }

  let { data, error }: { data: any[] | null; error: any } = await supabase
    .from('global_chat_messages')
    .select('id, message, created_at, profile_id, reply_to_message_id, profiles(username, tokens, stats, equipped_blook_id)')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  console.log('[CHAT_GET] SELECT result count:', data?.length ?? 0, 'Error:', error);

  if (error) {
    console.warn('[CHAT_GET] Join query failed, falling back to simple select:', error.message);
    const fallback = await supabase
      .from('global_chat_messages')
      .select('id, message, created_at, profile_id, reply_to_message_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (fallback.error) {
      console.error('[CHAT_GET] Fallback SELECT error:', fallback.error);
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }
    data = fallback.data as any[] | null;
  }

  const profileIds = Array.from(new Set((data || []).map((row: any) => row.profile_id).filter(Boolean)));
  let profileMap = new Map<string, { username: string; tokens: number; badges: string[]; equippedBlook: string }>();
  if (profileIds.length > 0) {
      const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
        .select('id, username, tokens, stats, equipped_blook_id')
      .in('id', profileIds);
    if (!profileErr && profiles) {
        const blookIds = Array.from(new Set(profiles.map((profile: any) => profile.equipped_blook_id).filter(Boolean)));
        const { data: blooks } = blookIds.length
          ? await supabase.from('blooks').select('id, name').in('id', blookIds)
          : { data: [] };
        const blookNames = new Map((blooks || []).map((blook: any) => [blook.id, blook.name]));
        profileMap = new Map(profiles.map((p: any) => [p.id, { username: p.username, tokens: p.tokens || 0, badges: p.stats?.badges || [], equippedBlook: blookNames.get(p.equipped_blook_id) === "Surgeon" ? "Doctor" : blookNames.get(p.equipped_blook_id) || "" }]));
    }
  }

  const replyIds = Array.from(new Set((data || []).map((row: any) => row.reply_to_message_id).filter(Boolean)));
  const { data: replyRows } = replyIds.length
    ? await supabase.from('global_chat_messages').select('id, message, profile_id').in('id', replyIds)
    : { data: [] };
  const replyProfileIds = Array.from(new Set((replyRows || []).map((row: any) => row.profile_id).filter(Boolean)));
  const { data: replyProfiles } = replyProfileIds.length
    ? await supabase.from('profiles').select('id, username').in('id', replyProfileIds)
    : { data: [] };
  const replyUsernames = new Map((replyProfiles || []).map((profile: any) => [profile.id, profile.username]));
  const replies = new Map((replyRows || []).map((row: any) => [row.id, { id: row.id, message: row.message, user: replyUsernames.get(row.profile_id) || 'Player' }]));

  const normalized = (data || []).map((row: any) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const profileData = profileMap.get(row.profile_id);
    const username = profile?.username || profileData?.username || 'Player';
    const tokens = Number(profile?.tokens ?? profileData?.tokens ?? 0);
    const badges = Array.from(new Set([
      ...(profile?.stats?.badges || profileData?.badges || []),
      ...(tokens >= 10000 ? ['10K Tokens'] : []),
      ...(tokens >= 100000 ? ['100K Tokens'] : []),
      ...(tokens >= 1000000 ? ['1M Tokens'] : []),
    ]));
    return {
      id: row.id,
      message: row.message,
      created_at: row.created_at,
      profile_id: row.profile_id,
      replyTo: row.reply_to_message_id ? replies.get(row.reply_to_message_id) || null : null,
      user: username,
      equippedBlook: profileData?.equippedBlook || "",
      badges,
      profiles: { username },
    };
  });

  console.log('[CHAT_GET] Returning messages count:', normalized.length);
  return NextResponse.json(normalized);
}

export async function POST(request: Request) {
  console.log('[CHAT_POST] Starting POST /api/chat');
  const supabase = await createClient();
  if (!supabase) {
    console.log('[CHAT_POST] Supabase not configured');
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  console.log('[CHAT_POST] Authenticated user ID:', user?.id, 'Auth error:', authError);
  if (!user) {
    console.warn('[CHAT_POST] User is unauthenticated');
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const body = await request.json();
  const message = String(body.message || '').trim().slice(0, 500);
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  const replyToMessageId = String(body.replyToMessageId || '').trim() || null;
  let replyTo: { id: string; message: string; user: string } | null = null;
  if (replyToMessageId) {
    const { data: target, error: targetError } = await supabase.from('global_chat_messages').select('id, message, profile_id').eq('id', replyToMessageId).is('deleted_at', null).maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: 'The message you are replying to is no longer available.' }, { status: 404 });
    const { data: targetProfile } = await supabase.from('profiles').select('username').eq('id', target.profile_id).maybeSingle();
    replyTo = { id: target.id, message: target.message, user: targetProfile?.username || 'Player' };
  }

  console.log('[CHAT_POST] Executing INSERT into global_chat_messages:', { profile_id: user.id, message, reply_to_message_id: replyToMessageId });
  const { data, error } = await supabase
    .from('global_chat_messages')
    .insert({ profile_id: user.id, message, reply_to_message_id: replyToMessageId })
    .select('id, message, created_at, profile_id, reply_to_message_id')
    .maybeSingle();

  console.log('[CHAT_POST] INSERT result:', data, 'Error:', error);
  if (error) {
    console.error('[CHAT_POST] Error inserting into global_chat_messages:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  const username = profile?.username || user.user_metadata?.username || 'Player';

  const responsePayload = {
    id: data?.id,
    message: data?.message || message,
    created_at: data?.created_at,
    profile_id: data?.profile_id || user.id,
    replyTo,
    user: username,
    profiles: { username },
  };

  console.log('[CHAT_POST] Returning inserted message:', responsePayload);
  return NextResponse.json(responsePayload, { status: 201 });
}
