const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

function loadModule(file, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports, Request, console,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const catalog = loadModule('lib/gameplay-catalog.ts');
const { planGameplay } = loadModule('lib/gameplay-actions.ts', { './gameplay-catalog': catalog });

test('server-generated rewards reject forged results and invalid gameplay requests', () => {
  const now = new Date('2026-10-05T17:30:00Z');
  const snapshot = { tokens: 1000, materials: { Metal: 12, Cloth: 8 }, inventory: { Gears: { quantity: 3, rarity: 'Rare' } }, wheelSpun: false };
  const inventions = catalog.liveCapsules.find((pack) => pack.name === 'Inventions Bag');
  assert.equal(inventions.pool.find((reward) => reward.name === 'Bitcoin').rarity, 'Mythic');
  for (const pack of [...catalog.liveCapsules, ...catalog.retiredCapsules]) {
    assert.ok(Math.abs(pack.pool.reduce((sum, reward) => sum + catalog.chanceFor(pack, reward), 0) - 100) < 1e-8);
  }
  const opening = planGameplay({ action: 'open', quantities: { 'Inventions Bag': 1 }, reward: 'Bitcoin', tokens: 999999 }, snapshot, () => 0, now);
  assert.equal(opening.results[0].reward.name, 'Wheel');
  assert.equal(opening.tokenDelta, -25);
  assert.equal(opening.candyDelta, 1);
  assert.throws(() => planGameplay({ action: 'open', quantities: { 'Inventions Bag': 1 } }, { ...snapshot, tokens: 0 }, () => 0, now));
  for (const quantity of [0, -1, 1.5, 501, Infinity]) {
    assert.throws(() => planGameplay({ action: 'open', quantities: { 'Inventions Bag': quantity } }, snapshot, () => 0, now));
  }
  assert.throws(() => planGameplay({ action: 'open', quantities: { 'Pixel Bag': 1 } }, snapshot, () => 0, new Date('2026-10-05T16:00:00Z')));
  assert.throws(() => planGameplay({ action: 'crate' }, { ...snapshot, wheelSpun: true }, () => 0, now));
  assert.equal(planGameplay({ action: 'crate', reward: { amount: 999999 } }, snapshot, () => 0, now).tokenDelta, 250);
  assert.equal(planGameplay({ action: 'sell', quantities: { Gears: 2 } }, snapshot, () => 0, now).tokensEarned, 30);
  assert.throws(() => planGameplay({ action: 'sell', quantities: { Gears: 3 } }, snapshot, () => 0, now));
  assert.throws(() => planGameplay({ action: 'dismantle', name: 'Bitcoin' }, snapshot, () => 0, now));
  for (const name of ['Bitcoin', 'Crystal Ball', 'Gold Bread', 'Wheel']) {
    for (const material of Object.keys(catalog.dismantleBundleFor(name, 'Mythic'))) assert.ok(material !== 'Gold' && material !== 'Gem');
  }
  assert.throws(() => planGameplay({ action: 'craft', name: 'Rainbow Astro' }, snapshot, () => 0, now));
  assert.equal(planGameplay({ action: 'craft', name: 'Yeti' }, snapshot, () => 0, now).inventoryDelta.Yeti, 1);
  assert.equal(planGameplay({ action: 'open', quantities: { 'Inventions Bag': 2 } }, snapshot, () => 0, new Date('2026-10-25T17:30:00Z')).candyDelta, 0);
});

test('known access codes cannot create admin or reviewer privileges, and saves reject economy fields', async () => {
  let role = null;
  let writes = 0;
  const database = {
    auth: { getUser: async () => ({ data: { user: { id: 'tester' } } }) },
    from: () => {
      const query = {
        select: () => query, eq: () => query, in: () => query, limit: () => query,
        maybeSingle: async () => ({ data: role, error: null }),
        upsert: () => { writes += 1; throw new Error('Privilege write attempted'); },
      };
      return query;
    },
  };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    '../../../../lib/supabase/server': { createClient: async () => database },
    '../../../../lib/supabase/admin': { createAdminClient: () => database },
    '../../../lib/supabase/server': { createClient: async () => database },
    '../../../lib/supabase/admin': { createAdminClient: () => database },
  };
  const request = (body) => new Request('https://example.invalid/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const unlock = loadModule('app/api/admin/unlock/route.ts', dependencies);
  const requests = loadModule('app/api/requests/route.ts', dependencies);
  const player = loadModule('app/api/player/route.ts', dependencies);
  assert.equal((await unlock.POST(request({ code: 'admincodeiscool32' }))).status, 403);
  assert.equal((await requests.POST(request({ action: 'unlock-reviewer', code: 'admin1234532!' }))).status, 403);
  assert.equal((await requests.POST(request({ action: 'review', requestId: 'fake', decision: 'accept' }))).status, 403);
  for (const field of ['tokens', 'inventory', 'materials', 'badges', 'candy', 'wheelSpun', 'pickaxe', 'stats']) {
    assert.equal((await player.PATCH(request({ player: { [field]: 99999 } }))).status, 403);
  }
  role = { role: 'admin' };
  assert.equal((await unlock.POST(request({}))).status, 200);
  assert.equal(writes, 0);
});

test('database transactions enforce replay, balance, ownership, escrow, and permission guards', async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
      create table blooks(id uuid primary key default gen_random_uuid(), name text unique not null, rarity text not null, artwork_key text);
      create table profiles(id uuid primary key, tokens integer not null default 0 check(tokens>=0), stats jsonb not null default '{}', materials jsonb not null default '{}', is_banned boolean default false, account_status text default 'active', equipped_blook_id uuid);
      create table inventory(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), blook_id uuid references blooks(id), quantity integer not null check(quantity>=0), shiny boolean default false, unique(profile_id,blook_id,shiny));
      create table marketplace_listings(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), blook_id uuid references blooks(id), quantity integer, price integer, status text, sold_at timestamptz);
      create table mine_progress(id uuid primary key default gen_random_uuid(), profile_id uuid);
      create table clans(id uuid primary key default gen_random_uuid(), treasury integer default 0);
      create table clan_members(id uuid primary key default gen_random_uuid(), profile_id uuid, clan_id uuid, token_contributions integer default 0);
      create table trades(id uuid primary key default gen_random_uuid(), sender_profile_id uuid, receiver_profile_id uuid, status text);
      create function save_player_inventory(jsonb) returns void language plpgsql as $$begin return; end$$;
      grant all on profiles, inventory, mine_progress, marketplace_listings to authenticated;
      set timezone='America/Denver';
    `);
    const migration = fs.readFileSync('supabase/migrations/0015_secure_gameplay.sql', 'utf8');
    await database.exec(migration);
    const buyer = '00000000-0000-0000-0000-000000000001';
    const seller = '00000000-0000-0000-0000-000000000002';
    await database.query('insert into profiles(id,tokens) values($1,1000),($2,1000)', [buyer, seller]);
    const wheel = (await database.query("select id from blooks where name='Wheel'")).rows[0].id;
    const bitcoin = (await database.query("select id from blooks where name='Bitcoin'")).rows[0].id;
    await database.query('insert into inventory(profile_id,blook_id,quantity) values($1,$2,5),($3,$4,1)', [buyer, wheel, seller, bitcoin]);
    await database.exec("set request.jwt.claim.role='service_role'");
    const apply = (revision, action, delta, items = [], materials = {}, candy = 0, opened = 0) => database.query('select apply_gameplay_action($1,$2,$3,$4,$5,$6,$7,$8)', [buyer, revision, action, delta, JSON.stringify(items), JSON.stringify(materials), candy, opened]);
    const cooldown = () => database.query("update profiles set stats=stats-'lastGameplayAt' where id=$1", [buyer]);
    await apply(0, 'open', -25, [{ blook_id: wheel, quantity: 1, shiny: false }], {}, 1, 1);
    assert.equal((await database.query('select tokens from profiles where id=$1', [buyer])).rows[0].tokens, 975);
    await assert.rejects(() => apply(0, 'open', -25), /state changed/i);
    await cooldown();
    await assert.rejects(() => apply(1, 'open', -5000), /token balance/i);
    await assert.rejects(() => apply(1, 'craft', 0, [{ blook_id: wheel, quantity: 1, shiny: false }], { Metal: -20 }), /materials/i);
    assert.equal((await database.query('select quantity from inventory where profile_id=$1 and blook_id=$2', [buyer, wheel])).rows[0].quantity, 6);
    await apply(1, 'crate', 250, [], {}, 1);
    await cooldown();
    await assert.rejects(() => apply(2, 'crate', 250), /already opened/i);
    await assert.rejects(() => apply(2, 'dismantle', 0, [{ blook_id: bitcoin, quantity: -1, shiny: false }]), /collection changed/i);
    await database.exec('set role authenticated');
    await assert.rejects(() => database.query('update profiles set tokens=999999 where id=$1', [buyer]), /permission denied/i);
    await assert.rejects(() => apply(2, 'crate', 5000), /permission denied/i);
    await database.exec('reset role');
    await assert.rejects(() => database.query("select secure_marketplace_action($1,'create','Bitcoin',100,null)", [buyer]), /do not own/i);
    const listing = (await database.query("select secure_marketplace_action($1,'create','Bitcoin',100,null) as result", [seller])).rows[0].result.listing.id;
    assert.equal((await database.query('select count(*)::integer as total from inventory where profile_id=$1 and blook_id=$2', [seller, bitcoin])).rows[0].total, 0);
    await database.query("select secure_marketplace_action($1,'buy','',0,$2)", [buyer, listing]);
    await assert.rejects(() => database.query("select secure_marketplace_action($1,'buy','',0,$2)", [buyer, listing]), /no longer active/i);
    await database.query('select secure_builtin_promo($1)', [buyer]);
    await assert.rejects(() => database.query('select secure_builtin_promo($1)', [buyer]), /already redeemed/i);
    const clan = (await database.query('insert into clans default values returning id')).rows[0].id;
    await assert.rejects(() => database.query('select secure_clan_donation($1,$2,100)', [buyer, clan]), /Join this clan/i);
    await database.query('insert into clan_members(profile_id,clan_id) values($1,$2)', [buyer, clan]);
    await database.query('select secure_clan_donation($1,$2,100)', [buyer, clan]);
    assert.equal((await database.query('select treasury from clans where id=$1', [clan])).rows[0].treasury, 100);
    const legacy = (await database.query("insert into marketplace_listings(profile_id,blook_id,quantity,price,status) values($1,$2,1,100,'active') returning id", [seller, bitcoin])).rows[0].id;
    await assert.rejects(() => database.query("select secure_marketplace_action($1,'buy','',0,$2)", [buyer, legacy]), /seller no longer owns/i);
    await database.exec(migration);
  } finally {
    await database.close();
  }
});