import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';
import { hasAdminAccess } from '../../../../lib/admin-access';
import { EVIL_AI_MINUTES, MAX_GLOBAL_EVIL_MINUTES, evilUntil, globalEvilUntil, isEvilActive } from '../../../../lib/evil-ai';

export const dynamic = 'force-dynamic';

// Only the admin can turn evil AI mode on or off, for one player (themselves included) or for everyone.
async function adminSession() {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return { error: NextResponse.json({ error: 'Evil AI mode is unavailable.' }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  if (!(await hasAdminAccess(database, user.id))) return { error: NextResponse.json({ error: 'Only admins can control evil AI mode.' }, { status: 403 }) };
  return { database, user };
}

export async function GET() {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const { data: profile } = await session.database.from('profiles').select('stats').eq('id', session.user.id).maybeSingle();
  return NextResponse.json({ globalUntil: await globalEvilUntil(session.database), selfActive: isEvilActive(profile?.stats) });
}

export async function POST(request: Request) {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const { database, user } = session;
  const body = await request.json().catch(() => ({}));

  if (body.scope === 'global') {
    const minutes = Math.floor(Number(body.minutes) || 0);
    if (minutes < 0 || minutes > MAX_GLOBAL_EVIL_MINUTES) return NextResponse.json({ error: `Pick between 1 and ${MAX_GLOBAL_EVIL_MINUTES} minutes.` }, { status: 400 });
    const until = minutes > 0 ? evilUntil(minutes) : null;
    const { error } = await database.from('app_settings').update({ evil_ai_until: until, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return NextResponse.json({ error: /evil_ai_until/.test(error.message) ? 'Run migration 0059_evil_ai_mode.sql first.' : error.message }, { status: 500 });
    await database.rpc('chat_game_bot_say', {
      p_profile_id: user.id,
      p_message: until ? `😈 EVIL AI MODE is on for everyone for ${minutes} minute${minutes === 1 ? '' : 's'}. Ask me something with /ai... if you dare.` : '😇 Evil AI mode is over. Breadlet is nice again!',
    });
    return NextResponse.json({ ok: true, globalUntil: until });
  }

  // One player: toggles their 30-minute evil mode. Defaults to the admin themselves.
  const targetId = String(body.targetId || user.id);
  const { data: target } = await database.from('profiles').select('username, stats').eq('id', targetId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  const active = !isEvilActive(target.stats);
  const stats = { ...(target.stats || {}), evilAiUntil: active ? evilUntil(EVIL_AI_MINUTES) : null };
  const { error } = await database.from('profiles').update({ stats }).eq('id', targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, active, username: target.username, until: stats.evilAiUntil });
}
