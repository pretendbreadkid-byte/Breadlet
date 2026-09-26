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
  const { data, error } = await session.supabase.from('profiles').select('id, username, is_banned, ban_reason, ban_expires_at').order('username').limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const body = await request.json();
  if (body.action === 'ban') {
    const targetId = String(body.targetId || '');
    const reason = String(body.reason || '').trim().slice(0, 500);
    const permanent = Boolean(body.permanent);
    const hours = Math.floor(Number(body.durationHours) || 0);
    if (!targetId || !reason || (!permanent && (hours < 1 || hours > 8760))) {
      return NextResponse.json({ error: 'Choose a player, give a reason, and set a valid duration.' }, { status: 400 });
    }
    if (targetId === session.userId) return NextResponse.json({ error: 'You cannot ban your own account.' }, { status: 400 });
    const { data: target, error: targetError } = await session.supabase.from('profiles').select('id').eq('id', targetId).maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    const { error: banError } = await session.supabase.from('bans').insert({
      profile_id: targetId,
      reason,
      is_permanent: permanent,
      expires_at: permanent ? null : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
      created_by_admin_id: session.userId,
    });
    if (banError) return NextResponse.json({ error: banError.message }, { status: 400 });
    await session.supabase.from('profiles').update({ is_banned: true, ban_reason: reason, ban_expires_at: permanent ? null : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() }).eq('id', targetId);
    return NextResponse.json({ ok: true });
  }

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

export async function DELETE(request: Request) {
  const session = await adminSession();
  if ('error' in session) return session.error;
  const targetId = new URL(request.url).searchParams.get('targetId') || '';
  if (!targetId) return NextResponse.json({ error: 'Choose an account to delete.' }, { status: 400 });
  if (targetId === session.userId) return NextResponse.json({ error: 'You cannot delete your own admin account.' }, { status: 400 });

  const { data: target, error: targetError } = await session.supabase.from('profiles').select('id, username').eq('id', targetId).maybeSingle();
  if (targetError || !target) return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  const { data: targetAdminRole, error: roleError } = await session.supabase.from('admin_roles').select('role').eq('profile_id', targetId).limit(1).maybeSingle();
  if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 });
  if (targetAdminRole) return NextResponse.json({ error: 'Admin accounts cannot be deleted from this panel.' }, { status: 403 });

  const { error: deleteError } = await session.supabase.auth.admin.deleteUser(targetId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
  return NextResponse.json({ ok: true, username: target.username });
}