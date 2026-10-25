import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';
import { LIMITED_MUTES_PER_DAY, chatModerationRole, isProtectedFromMute } from '../../../../lib/admin-access';

export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return NextResponse.json({ error: 'Moderation is unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const role = await chatModerationRole(database, user.id);
  if (!role) return NextResponse.json({ error: 'Only moderators can time players out.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const targetId = String(body.targetId || '');
  if (!targetId || targetId === user.id) return NextResponse.json({ error: 'Choose another player.' }, { status: 400 });

  const { data: target } = await database.from('profiles').select('username, stats').eq('id', targetId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  if (isProtectedFromMute(target.username)) return NextResponse.json({ error: 'You cannot time out a moderator.' }, { status: 403 });

  // Limited moderators: count today's timeouts (UTC day) in their own stats.
  const today = new Date().toISOString().slice(0, 10);
  let modStats: any = null;
  let usedToday = 0;
  if (role === 'limited') {
    const { data: mod } = await database.from('profiles').select('stats').eq('id', user.id).single();
    modStats = mod?.stats || {};
    usedToday = modStats.modMutes?.date === today ? Number(modStats.modMutes.count) || 0 : 0;
    if (usedToday >= LIMITED_MUTES_PER_DAY) return NextResponse.json({ error: `You've used your ${LIMITED_MUTES_PER_DAY} timeouts for today. They reset at midnight UTC.` }, { status: 429 });
  }

  const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await database.from('profiles').update({ stats: { ...(target.stats || {}), chatMutedUntil: until } }).eq('id', targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (role === 'limited') {
    await database.from('profiles').update({ stats: { ...modStats, modMutes: { date: today, count: usedToday + 1 } } }).eq('id', user.id);
    return NextResponse.json({ ok: true, until, mutesLeft: LIMITED_MUTES_PER_DAY - usedToday - 1 });
  }
  return NextResponse.json({ ok: true, until });
}
