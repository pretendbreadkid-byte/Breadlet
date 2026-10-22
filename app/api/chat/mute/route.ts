import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';
import { isChatModerator, isProtectedFromMute } from '../../../../lib/admin-access';

export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return NextResponse.json({ error: 'Moderation is unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await isChatModerator(database, user.id))) return NextResponse.json({ error: 'Only moderators can time players out.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const targetId = String(body.targetId || '');
  if (!targetId || targetId === user.id) return NextResponse.json({ error: 'Choose another player.' }, { status: 400 });

  const { data: target } = await database.from('profiles').select('username, stats').eq('id', targetId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  if (isProtectedFromMute(target.username)) return NextResponse.json({ error: 'You cannot time out a moderator.' }, { status: 403 });

  const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error } = await database.from('profiles').update({ stats: { ...(target.stats || {}), chatMutedUntil: until } }).eq('id', targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, until });
}
