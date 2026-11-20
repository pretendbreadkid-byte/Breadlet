import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { networkIdentity } from '../../../../lib/network-identity';
import { ADMIN_USERNAME } from '../../../../lib/admin-access';

export const dynamic = 'force-dynamic';

// Help for players who can't get into their account (the "Forgot password?" screen).
//   POST { action: 'accounts' }  usernames that have logged in on this device (forgot your username?)
//   POST { action: 'request', username, contact?, note? }
//     sends the admin an Inbox message asking for help. It says whether the request came from a
//     device or network that has logged into that account, so the admin can tell if it's really them,
//     then the admin uses Set new password on the player's profile.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { deviceHash, ipHash } = networkIdentity(request);

  if (body.action === 'accounts') {
    if (!deviceHash) return NextResponse.json({ accounts: [] });
    const { data: links } = await admin.from('account_devices').select('profile_id, last_seen_at')
      .eq('device_hash', deviceHash).order('last_seen_at', { ascending: false }).limit(20);
    const ids = Array.from(new Set((links || []).map((row: any) => row.profile_id))).slice(0, 10);
    if (!ids.length) return NextResponse.json({ accounts: [] });
    const { data: profiles } = await admin.from('profiles').select('id, username').in('id', ids);
    const names = new Map((profiles || []).map((row: any) => [row.id, row.username]));
    return NextResponse.json({ accounts: ids.map((id) => names.get(id)).filter(Boolean) });
  }

  if (body.action === 'request') {
    const username = String(body.username || '').trim();
    const contact = String(body.contact || '').trim().slice(0, 120);
    const note = String(body.note || '').trim().slice(0, 400);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return NextResponse.json({ error: 'Type the username of the account you want back.' }, { status: 400 });
    const { data: target } = await admin.from('profiles').select('id, username').ilike('username', username).maybeSingle();
    if (!target) return NextResponse.json({ error: "There's no account with that username. Try \"Forgot your username?\"." }, { status: 404 });
    const { data: staff } = await admin.from('profiles').select('id').ilike('username', ADMIN_USERNAME).maybeSingle();
    if (!staff) return NextResponse.json({ error: 'No admin is set up to get requests.' }, { status: 503 });

    // One request per account every 15 minutes.
    const since = new Date(Date.now() - 15 * 60000).toISOString();
    const { data: recent } = await admin.from('notifications').select('id').eq('profile_id', staff.id).eq('type', 'recovery_request')
      .gte('created_at', since).contains('payload', { targetId: target.id }).limit(1);
    if (recent?.length) return NextResponse.json({ error: 'A request for this account was just sent. The admin will look at it soon.' }, { status: 429 });

    const { data: seen } = await admin.from('account_devices').select('device_hash, ip_hash').eq('profile_id', target.id);
    const sameDevice = Boolean(deviceHash) && (seen || []).some((row: any) => row.device_hash === deviceHash);
    const sameNetwork = (seen || []).some((row: any) => row.ip_hash === ipHash);
    const proof = sameDevice ? '✅ Sent from a device that has logged into this account.'
      : sameNetwork ? '🟡 Sent from a different device, but on a Wi-Fi/network this account has used.'
      : '⚠️ Sent from a device and network this account has NEVER used. Be careful.';
    const message = [
      `${target.username} can't get into their account.`,
      proof,
      contact && `How to reach them: ${contact}`,
      note && `They said: ${note}`,
      'If it looks right, open their profile and use Set new password.',
    ].filter(Boolean).join('\n');
    const { error } = await admin.from('notifications').insert({
      profile_id: staff.id,
      type: 'recovery_request',
      payload: { title: `Account help: ${target.username}`, message, targetId: target.id, username: target.username, sameDevice, sameNetwork },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown request.' }, { status: 400 });
}
