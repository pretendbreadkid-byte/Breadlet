import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

async function adminSession() {
  const sessionClient = await createClient();
  if (!sessionClient) return { error: NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 }) };
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) };
  const supabase = createAdminClient();
  if (!supabase) return { error: NextResponse.json({ error: 'Admin server configuration is missing.' }, { status: 503 }) };
  const { data: role } = await supabase.from('admin_roles').select('role').eq('profile_id', user.id).in('role', ['owner', 'admin']).limit(1).maybeSingle();
  if (!role) return { error: NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 }) };
  return { supabase, userId: user.id };
}

export async function GET() {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const { data, error } = await session.supabase.from('profiles').select('id, username').order('username').limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const body = await request.json();
  const targetId = String(body.targetId || '');
  const tokens = Math.max(0, Math.floor(Number(body.tokens) || 0));
  const blookName = String(body.blookName || '').trim().slice(0, 80);
  const badge = String(body.badge || '').trim().slice(0, 40);
  if (!targetId || (!tokens && !blookName && !badge)) return NextResponse.json({ error: 'Choose a player and at least one reward.' }, { status: 400 });
  const { data: target, error: targetError } = await session.supabase.from('profiles').select('tokens, stats').eq('id', targetId).single();
  if (targetError || !target) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  if (tokens) {
    const { error } = await session.supabase.from('profiles').update({ tokens: target.tokens + tokens }).eq('id', targetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (badge) {
    const badges = Array.from(new Set([...(target.stats?.badges || []), badge]));
    const { error } = await session.supabase.from('profiles').update({ stats: { ...(target.stats || {}), badges } }).eq('id', targetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (blookName) {
    const { data: blook, error: blookError } = await session.supabase.from('blooks').select('id').eq('name', blookName.replace(/^Shiny /, '')).single();
    if (blookError || !blook) return NextResponse.json({ error: 'That Blook is not in the canonical catalog.' }, { status: 400 });
    const shiny = blookName.startsWith('Shiny ');
    const { data: owned } = await session.supabase.from('inventory').select('id, quantity').eq('profile_id', targetId).eq('blook_id', blook.id).eq('shiny', shiny).maybeSingle();
    const { error } = owned
      ? await session.supabase.from('inventory').update({ quantity: owned.quantity + 1 }).eq('id', owned.id)
      : await session.supabase.from('inventory').insert({ profile_id: targetId, blook_id: blook.id, quantity: 1, shiny });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}