const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

function loadModule(path, dependencies = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, Request, Response, URL, console,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const filter = loadModule('lib/chat-filter.ts');

test('automatic ban matches are conservative and handle common disguises', () => {
  const slur = ['n', 'i', 'g', 'g', 'e', 'r'].join('');
  assert.equal(filter.hasBannableSlur(slur), true);
  assert.equal(filter.hasBannableSlur(slur.split('').join(' ')), true);
  assert.equal(filter.hasBannableSlur(slur.replace('i', '1').replace('e', '3')), true);
  assert.equal(filter.hasBannableSlur(`hello,${slur}!`), true);
  assert.equal(filter.hasBannableSlur('minigame'), false);
  assert.equal(filter.hasBannableSlur('Nigeria'), false);
  assert.equal(filter.hasBannableSlur('spicy food'), false);
  assert.equal(filter.hasBannableSlur('please kill yourself'), false);
  assert.equal(filter.hasBannableSlur('ordinary conversation'), false);
  assert.equal(filter.hasBannableSlur('unrelated words separated by spaces'), false);
});

test('chat API enforces verified images and routes actual text through moderation', async () => {
  const next = { NextResponse: { json: (body, options) => Response.json(body, options) } };
  const sender = { username: 'Player', is_banned: false, account_status: 'active', stats: { badges: [] } };
  const calls = [];
  let status = 'allowed';
  const admin = {
    from: (table) => {
      assert.equal(table, 'profiles');
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: sender, error: null }),
      };
      return query;
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { status }, error: null };
    },
  };
  const moderation = loadModule('lib/chat-moderation.ts', {
    'node:crypto': require('node:crypto'),
    'next/server': next,
    './chat-filter': filter,
  });
  const route = loadModule('app/api/chat/route.ts', {
    'next/server': next,
    '../../../lib/admin-access': { isProtectedFromMute: () => false, isStaffLookalike: () => false },
    '../../../lib/chat-ai': {},
    '../../../lib/game-knowledge': {},
    '../../../lib/evil-ai': {},
    '../../../lib/og-badge': {},
    '../../../lib/inbox': {},
    '../../../lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'player' } } }) } }) },
    '../../../lib/supabase/admin': { createAdminClient: () => admin },
    '../../../lib/chat-filter': filter,
    '../../../lib/chat-moderation': moderation,
    '../../../lib/network-identity': { isNetworkBanned: async () => false },
  });
  const send = (message) => route.POST(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
  }));
  const image = '[img]data:image/png;base64,AAAA[/img]';
  assert.equal((await send(image)).status, 403);
  assert.equal(calls.length, 0);
  const editResponse = await route.PATCH(new Request('http://localhost/api/chat', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'existing', message: image }),
  }));
  assert.equal(editResponse.status, 400);
  sender.stats.badges.push('Verified');
  status = 'muted';
  assert.equal((await send(image)).status, 403);
  assert.equal(calls[0].args.p_slur_message, null);
  status = 'banned_slur';
  const slur = ['n', 'i', 'g', 'g', 'e', 'r'].join('');
  assert.equal((await send(slur)).status, 403);
  assert.equal(calls[1].args.p_slur_message, slur);
});

test('moderation serializes spam, bans slurs, preserves appeals and denies direct writes', async () => {
  const db = new PGlite();
  const id = '00000000-0000-0000-0000-000000000001';
  const staff = '00000000-0000-0000-0000-000000000002';
  const repeated = 'a'.repeat(64);
  const call = (profile, hash, evidence = null) =>
    db.query('select public.moderate_chat_attempt($1, $2, $3) as result', [profile, hash, evidence]);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.role() returns text language sql
        as $$ select current_setting('request.jwt.claim.role', true) $$;
      create table public.profiles (
        id uuid primary key, username text not null, stats jsonb not null default '{}',
        is_banned boolean not null default false, account_status text not null default 'active',
        ban_reason text, ban_expires_at timestamptz
      );
      create table public.bans (profile_id uuid, reason text, is_permanent boolean, expires_at timestamptz);
      create table public.network_bans (profile_id uuid);
      create table public.global_chat_messages (profile_id uuid, message text, is_breadlet_bot boolean default false);
      create table public.trade_messages (profile_id uuid, message text);
      create table public.clan_chat_messages (profile_id uuid, message text);
      grant insert, update, delete on public.profiles, public.global_chat_messages, public.trade_messages, public.clan_chat_messages to authenticated;
      insert into public.profiles (id, username) values
        ('${id}', 'Player'), ('${staff}', 'breadblook');
      set request.jwt.claim.role = 'service_role';
    `);
    await db.exec(fs.readFileSync('supabase/migrations/0081_chat_auto_moderation.sql', 'utf8'));

    for (let i = 0; i < 4; i += 1) {
      assert.equal((await call(id, repeated)).rows[0].result.status, 'allowed');
      assert.equal((await call(id, i.toString(16).padStart(64, '0'))).rows[0].result.status, 'allowed');
      await db.exec(`update public.chat_moderation_attempts set created_at = clock_timestamp() - interval '20 seconds' where profile_id = '${id}'`);
    }
    assert.equal((await call(id, repeated)).rows[0].result.status, 'spam');
    let profile = (await db.query('select * from public.profiles where id = $1', [id])).rows[0];
    assert.equal(profile.is_banned, false);
    const remaining = Date.parse(profile.stats.chatMutedUntil) - Date.now();
    assert.ok(remaining > 29 * 60 * 1000 && remaining <= 30 * 60 * 1000);
    await assert.rejects(() => db.query('insert into public.trade_messages values ($1, $2)', [id, 'hello']), /muted/);
    assert.equal((await call(id, repeated)).rows[0].result.status, 'muted');
    await db.exec(`update public.profiles set stats = '{}' where id = '${id}'`);
    assert.equal((await call(id, repeated)).rows[0].result.status, 'muted', 'stale profile updates cannot clear an automatic mute');
    await assert.rejects(() => db.query('insert into public.trade_messages values ($1, $2)', [id, 'hello']), /muted/);
    await db.exec(`delete from public.chat_auto_mutes where profile_id = '${id}'`);

    const parallel = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      call(id, i.toString(16).padStart(64, '0'))));
    assert.equal(parallel.filter((entry) => entry.rows[0].result.status === 'allowed').length, 9);
    assert.equal(parallel.filter((entry) => entry.rows[0].result.status === 'spam').length, 1);
    profile = (await db.query('select * from public.profiles where id = $1', [id])).rows[0];
    assert.equal(profile.is_banned, false);
    assert.equal((await db.query('select * from public.bans where profile_id = $1', [id])).rows.length, 0);

    assert.equal((await call(staff, repeated, 'flagged')).rows[0].result.status, 'blocked');
    assert.equal((await call(id, repeated, 'flagged')).rows[0].result.status, 'banned_slur');
    profile = (await db.query('select * from public.profiles where id = $1', [id])).rows[0];
    assert.equal(profile.is_banned, true);
    assert.equal(profile.ban_expires_at, null);
    const bans = await db.query('select * from public.bans where profile_id = $1', [id]);
    assert.equal(bans.rows.length, 1);
    assert.equal(bans.rows[0].is_permanent, true);
    assert.equal((await db.query('select * from public.chat_auto_ban_evidence where profile_id = $1', [id])).rows[0].message, 'flagged');
    await assert.rejects(() => db.query('insert into public.global_chat_messages values ($1, $2, false)', [id, 'hello']), /cannot chat/);
    await db.exec("set request.jwt.claim.role = 'authenticated'");
    await assert.rejects(() => call(id, repeated), /Server moderation access/);
    const privileges = await db.query(`select
      has_table_privilege('authenticated', 'public.global_chat_messages', 'INSERT') as chat_insert,
      has_table_privilege('authenticated', 'public.trade_messages', 'INSERT') as trade_insert,
      has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as profile_update,
      has_function_privilege('authenticated', 'public.moderate_chat_attempt(uuid,text,text)', 'EXECUTE') as moderate`);
    assert.deepEqual(privileges.rows[0], { chat_insert: false, trade_insert: false, profile_update: false, moderate: false });
  } finally {
    await db.close();
  }
});
