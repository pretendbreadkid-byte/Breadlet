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
const marketStock = loadModule('lib/market-stock.ts');
const { planGameplay } = loadModule('lib/gameplay-actions.ts', {
  './gameplay-catalog': catalog,
  './market-stock': marketStock,
});

test('server-generated rewards reject forged results and invalid gameplay requests', () => {
  const now = new Date('2026-10-05T01:30:00Z');
  const snapshot = { tokens: 1000, materials: { Metal: 12, Cloth: 8 }, inventory: { Gears: { quantity: 3, rarity: 'Rare' } }, wheelSpun: false };
  const inventions = catalog.liveCapsules.find((pack) => pack.name === 'Inventions Bag');
  assert.equal(inventions.pool.find((reward) => reward.name === 'Bitcoin').rarity, 'Mythic');
  assert.equal(inventions.pool.find((reward) => reward.name === "Leonardo da Vinci's Tank").rarity, 'Epic');
  const space = catalog.liveCapsules.find((pack) => pack.name === 'Space Bag');
  assert.equal(space.pool.find((reward) => reward.name === 'Earth').art, '/assets/earth-globe.svg');
  assert.equal(space.pool.find((reward) => reward.name === 'Sun').rarity, 'Rare');
  assert.equal(space.pool.find((reward) => reward.name === 'Space Trooper').rarity, 'Uncommon');
  assert.equal(space.pool.find((reward) => reward.name === 'Consolation').rarity, 'Uncommon');
  assert.equal(space.pool.find((reward) => reward.name === 'Sun').art, '/assets/sun.svg');
  assert.equal(space.pool.find((reward) => reward.name === 'Eclipse').art, '/assets/solar%20ecplise%20but%20good.svg');
  const bread = catalog.liveCapsules.find((pack) => pack.name === 'Bread Bag');
  assert.equal(bread.pool.map((reward) => reward.name).join(','),
    'Sour Dough,Toaster,Golden Toaster,Croissant,Cinnamon Roll,Robo Bread,Slime Bread,Gold Bread,Holy Bread');
  assert.equal(bread.pool.find((reward) => reward.name === 'Holy Bread').art, '/assets/holy-bread-refreshed.svg');
  assert.equal(bread.pool.find((reward) => reward.name === 'Golden Toaster').rarity, 'Breadled');
  assert.equal(catalog.chanceFor(bread, bread.pool.find((reward) => reward.name === 'Golden Toaster')), 0.004);
  for (const reward of bread.pool) assert.ok(fs.existsSync(`public/${reward.art.slice(1)}`), `${reward.name} artwork exists`);
  assert.ok(!catalog.liveCapsules.some((pack) => ['Human Bag', 'Pixel Bag', 'Remix Bag'].includes(pack.name)));
  const lostAndFound = catalog.liveCapsules.find((pack) => pack.name === 'Lost and Found Bag');
  const combat = catalog.liveCapsules.find((pack) => pack.name === 'Combat Bag');
  const artifact = catalog.liveCapsules.find((pack) => pack.name === 'Artifact Bag');
  assert.equal(lostAndFound.art, '/assets/lost-and-found-bag-updated.png');
  assert.ok(fs.existsSync(`public/${lostAndFound.art.slice(1)}`), 'updated Lost and Found Bag artwork exists');
  assert.equal(lostAndFound.pool.find((reward) => reward.name === 'Wallet').rarity, 'Uncommon');
  assert.equal(lostAndFound.pool.find((reward) => reward.name === 'Coffee Mug').art, '/assets/coffee-mug.svg');
  assert.equal(lostAndFound.pool.find((reward) => reward.name === 'Lost and Found Box').rarity, 'Breadled');
  assert.equal(catalog.chanceFor(lostAndFound, lostAndFound.pool.find((reward) => reward.name === 'Lost and Found Box')), 0.003);
  assert.equal(space.pool.find((reward) => reward.name === 'Star Ship').rarity, 'Breadled');
  assert.equal(catalog.chanceFor(space, space.pool.find((reward) => reward.name === 'Star Ship')), 0.005);
  assert.equal(combat.pool.find((reward) => reward.name === 'Sword').rarity, 'Rare');
  assert.equal(combat.pool.find((reward) => reward.name === 'Shuriken').rarity, 'Uncommon');
  assert.equal(catalog.liveCapsules.find((pack) => pack.name === 'Food Bag').pool.find((reward) => reward.name === 'Avocado').rarity, 'Common');
  assert.equal(catalog.liveCapsules.find((pack) => pack.name === 'BlookTuber Bag').pool.find((reward) => reward.name === 'Blooket Gods').rarity, 'Common');
  assert.equal(catalog.liveCapsules.find((pack) => pack.name === 'Bread Bag').pool.find((reward) => reward.name === 'Robo Bread').rarity, 'Uncommon');
  assert.equal(artifact.pool.find((reward) => reward.name === 'Aztec Coin').art, undefined);
  assert.equal(artifact.pool.find((reward) => reward.name === 'Clay Vase').art, '/assets/clay-vase.svg');
  for (const pack of [space, lostAndFound, artifact]) {
    for (const reward of pack.pool) {
      if (reward.art) assert.ok(fs.existsSync(`public/${decodeURIComponent(reward.art.slice(1))}`), `${reward.name} artwork exists`);
    }
  }
  for (const art of [
    'public/assets/Lost and found box frame 1.svg',
    'public/assets/Lost and found box 2.svg',
    'public/assets/Lost and found box 3.svg',
    'public/assets/Lost and found box 4.svg',
    'public/assets/Lost and found box 5.svg',
    'public/assets/Lost and found box 6.svg',
    'public/assets/goldenToaster frame 1.svg',
    'public/assets/goldenToaster2.svg',
    'public/assets/goldenToaster3.svg',
    'public/assets/goldenToaster4.svg',
  ]) assert.ok(fs.existsSync(art), `${art} exists`);
  for (const [name, art] of [
    ['Wallet', '/assets/wallet.svg'],
    ['Sword', '/assets/sword.svg'],
    ['Rock', '/assets/rock-refreshed.svg'],
    ['Candy Corn', '/assets/candy-corn-refreshed.svg'],
    ["Ted's Shop wordmark", '/assets/ted-shop-wordmark.svg'],
  ]) {
    assert.ok(fs.existsSync(`public${art}`), `${name} artwork exists`);
  }
  for (const pack of [...catalog.liveCapsules, ...catalog.legacyCapsules]) {
    assert.ok(Math.abs(pack.pool.reduce((sum, reward) => sum + catalog.chanceFor(pack, reward), 0) - 100) < 1e-8);
  }
  const opening = planGameplay({ action: 'open', quantities: { 'Inventions Bag': 1 }, reward: 'Bitcoin', tokens: 999999 }, snapshot, () => 0, now);
  assert.equal(opening.results[0].reward.name, 'Wheel');
  assert.equal(opening.tokenDelta, -25);
  assert.equal(opening.candyDelta, 1);
  assert.throws(() => planGameplay({ action: 'open', quantities: { 'Inventions Bag': 1 } }, { ...snapshot, tokens: 0 }, () => 0, now));
  for (const name of ['Human Bag', 'Pixel Bag', 'Remix Bag']) {
    assert.throws(() => planGameplay({ action: 'open', quantities: { [name]: 1 } }, snapshot, () => 0, now), /Unknown Goodybag/);
    assert.equal(marketStock.isMarketPackInStock(name, now), false);
  }
  for (const quantity of [0, -1, 1.5, 501, Infinity]) {
    assert.throws(() => planGameplay({ action: 'open', quantities: { 'Inventions Bag': quantity } }, snapshot, () => 0, now));
  }
  const stockRefresh = new Date('2026-10-05T16:00:00Z');
  const unavailablePack = marketStock.marketPackStock.find((pack) => !marketStock.isMarketPackInStock(pack.name, stockRefresh));
  assert.ok(unavailablePack);
  assert.throws(() => planGameplay({ action: 'open', quantities: { [unavailablePack.name]: 1 } }, snapshot, () => 0, stockRefresh), /out of stock/);
  assert.equal(marketStock.marketPackStock.length, 8);
  assert.equal(
    marketStock.marketPackStock.map(({ chance }) => chance).join(','),
    '0.45,1,0.8,0.5,0.25,0.2,0.05,0.4',
  );
  let verifiedSparseHour = false;
  for (let hour = 0; hour < 168; hour += 1) {
    const date = new Date(Date.UTC(2026, 9, 5 + Math.floor(hour / 24), hour % 24));
    const hourKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCHours()).padStart(2, '0')}`;
    const hash = (packName) => {
      let value = 2166136261;
      for (const character of `${hourKey}:${packName}`) {
        value ^= character.charCodeAt(0);
        value = Math.imul(value, 16777619);
      }
      return (value >>> 0) / 0x100000000;
    };
    const rawInStock = marketStock.marketPackStock.filter(({ name, chance }) => hash(name) < chance);
    const finalStock = marketStock.marketStockFor(date);
    assert.ok(Object.values(finalStock).filter(Boolean).length >= 4);
    if (rawInStock.length < 4) {
      const forcedInStock = [...marketStock.marketPackStock]
        .sort((left, right) => right.chance - left.chance)
        .filter(({ name }) => !rawInStock.some((pack) => pack.name === name))
        .slice(0, 4 - rawInStock.length)
        .map(({ name }) => name);
      assert.ok(forcedInStock.every((name) => finalStock[name]));
      verifiedSparseHour = true;
    }
  }
  assert.ok(verifiedSparseHour, 'tested at least one hour where fallback stock was needed');
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
  assert.equal(planGameplay({ action: 'open', quantities: { 'Inventions Bag': 2 } }, snapshot, () => 0, new Date('2026-10-25T01:30:00Z')).candyDelta, 0);
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
      create table blooks(id uuid primary key default gen_random_uuid(), name text unique not null, rarity text not null, artwork_key text, retired boolean not null default false);
      create table chests(id uuid primary key default gen_random_uuid(), name text unique not null, price integer not null, description text, pool jsonb not null default '[]', rarity text, is_retired boolean not null default false, active boolean not null default true);
      create table profiles(id uuid primary key, tokens integer not null default 0 check(tokens>=0), stats jsonb not null default '{}', materials jsonb not null default '{}', is_banned boolean default false, account_status text default 'active', equipped_blook_id uuid);
      create table inventory(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), blook_id uuid references blooks(id), quantity integer not null check(quantity>=0), shiny boolean default false, retired boolean not null default false, unique(profile_id,blook_id,shiny));
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
    const tankMigration = fs.readFileSync('supabase/migrations/0016_inventions_tank.sql', 'utf8');
    await database.exec(tankMigration);
    await database.query("insert into chests(name,price,pool) values ('Human Bag',25,'[]'),('Pixel Bag',25,'[]'),('Remix Bag',25,'[]'),('Lost and Found Bag',25,'[\"Car Keys\"]'),('Artifact Bag',25,'[\"Aztec Coin\"]'),('Combat Bag',25,'[\"Olive Grenade\"]')");
    const breadMigration = fs.readFileSync('supabase/migrations/0018_refreshed_bread_bag.sql', 'utf8');
    await database.exec(breadMigration);
    const breadReplacementMigration = fs.readFileSync('supabase/migrations/0019_replace_legacy_bread_inventory.sql', 'utf8');
    await database.exec(breadReplacementMigration);
    const extraBlooksMigration = fs.readFileSync('supabase/migrations/0020_add_lost_found_and_combat_blooks.sql', 'utf8');
    await database.exec(extraBlooksMigration);
    await database.exec(extraBlooksMigration);
    await database.query("insert into blooks(name,rarity) values ('Old Transcendent','Transcendent')");
    const breadledMigration = fs.readFileSync('supabase/migrations/0021_breadled_reward_items.sql', 'utf8');
    await database.exec(breadledMigration);
    await database.exec(breadledMigration);
    const newPackArtMigration = fs.readFileSync('supabase/migrations/0022_new_pack_art_and_rewards.sql', 'utf8');
    await database.exec(newPackArtMigration);
    await database.exec(newPackArtMigration);
    await database.query("insert into blooks(name,rarity) values ('Consolation','Rare'),('Avocado','Rare'),('Shuriken','Rare'),('Blooket Gods','Rare') on conflict(name) do update set rarity=excluded.rarity");
    const rarityMigration = fs.readFileSync('supabase/migrations/0023_adjust_reward_rarities.sql', 'utf8');
    await database.exec(rarityMigration);
    await database.exec(rarityMigration);
    const coinArtworkMigration = fs.readFileSync('supabase/migrations/0024_restore_aztec_coin_artwork.sql', 'utf8');
    await database.exec(coinArtworkMigration);
    await database.exec(coinArtworkMigration);
    assert.equal((await database.query("select rarity from blooks where name='Old Transcendent'")).rows[0].rarity, 'Breadled');
    const tank = (await database.query("select rarity, artwork_key from blooks where name = $1", ["Leonardo da Vinci's Tank"])).rows[0];
    assert.equal(tank.rarity, 'Epic');
    assert.equal(tank.artwork_key, "DaVinci'sOrnothopter2.svg");
    const sun = (await database.query("select rarity, artwork_key from blooks where name = 'Sun'")).rows[0];
    assert.equal(sun.rarity, 'Rare');
    assert.equal(sun.artwork_key, 'sun.svg');
    const breadBag = (await database.query("select active, is_retired, pool from chests where name = 'Bread Bag'")).rows[0];
    assert.equal(breadBag.active, true);
    assert.equal(breadBag.is_retired, false);
    assert.equal(breadBag.pool.length, 9);
    assert.deepEqual(
      (await database.query("select pool from chests where name='Lost and Found Bag'")).rows[0].pool,
      ['Car Keys', 'Wallet', 'Lost and Found Box', 'Coffee Mug'],
    );
    assert.deepEqual(
      (await database.query("select pool from chests where name='Artifact Bag'")).rows[0].pool,
      ['Aztec Coin', 'Clay Vase'],
    );
    const updatedArtwork = (await database.query("select name, artwork_key from blooks where name in ('Aztec Coin','Earth','Coffee Mug','Clay Vase') order by name")).rows;
    assert.equal(updatedArtwork.map(({ name, artwork_key }) => `${name}:${artwork_key}`).join(','),
      'Aztec Coin:Aztect Coin 2.0.svg,Clay Vase:clay-vase.svg,Coffee Mug:coffee-mug.svg,Earth:earth-globe.svg');
    const adjustedRarities = (await database.query("select name, rarity from blooks where name in ('Space Trooper','Consolation','Avocado','Shuriken','Blooket Gods','Robo Bread') order by name")).rows;
    assert.equal(adjustedRarities.map(({ name, rarity }) => `${name}:${rarity}`).join(','),
      'Avocado:Common,Blooket Gods:Common,Consolation:Uncommon,Robo Bread:Uncommon,Shuriken:Uncommon,Space Trooper:Uncommon');
    assert.deepEqual(
      (await database.query("select pool from chests where name='Bread Bag'")).rows[0].pool.slice(-1),
      ['Golden Toaster'],
    );
    const breadledBlooks = (await database.query("select name, rarity from blooks where name in ('Star Ship','Lost and Found Box','Golden Toaster') order by name")).rows;
    assert.equal(breadledBlooks.map(({ name, rarity }) => `${name}:${rarity}`).join(','),
      'Golden Toaster:Breadled,Lost and Found Box:Breadled,Star Ship:Breadled');
    assert.deepEqual(
      (await database.query("select pool from chests where name='Combat Bag'")).rows[0].pool,
      ['Olive Grenade', 'Sword'],
    );
    const newRewardArt = (await database.query("select name, artwork_key from blooks where name in ('Wallet','Sword','Rock','Candy Corn') order by name")).rows;
    assert.equal(newRewardArt.map(({ name, artwork_key }) => `${name}:${artwork_key}`).join(','),
      'Candy Corn:candy-corn-refreshed.svg,Rock:rock-refreshed.svg,Sword:sword.svg,Wallet:wallet.svg');
    assert.equal((await database.query("select count(*)::integer as total from chests where active and name in ('Human Bag','Pixel Bag','Remix Bag')")).rows[0].total, 0);
    await database.query("insert into blooks(name,rarity) values ('Burnt Toast','Common'),('Brioche','Common'),('Donut','Uncommon') on conflict(name) do nothing");
    const buyer = '00000000-0000-0000-0000-000000000001';
    const seller = '00000000-0000-0000-0000-000000000002';
    await database.query('insert into profiles(id,tokens) values($1,1000),($2,1000)', [buyer, seller]);
    const legacyBreadIds = (await database.query("select name,id from blooks where name in ('Burnt Toast','Brioche','Donut')")).rows;
    const legacyBread = Object.fromEntries(legacyBreadIds.map(({ name, id }) => [name, id]));
    const toasterId = (await database.query("select id from blooks where name='Toaster'")).rows[0].id;
    const croissantId = (await database.query("select id from blooks where name='Croissant'")).rows[0].id;
    const cinnamonRollId = (await database.query("select id from blooks where name='Cinnamon Roll'")).rows[0].id;
    await database.query(
      'insert into inventory(profile_id,blook_id,quantity,shiny) values($1,$2,3,false),($1,$3,2,false),($1,$4,4,false),($1,$2,1,true),($1,$5,1,false)',
      [buyer, legacyBread['Burnt Toast'], legacyBread.Brioche, legacyBread.Donut, cinnamonRollId],
    );
    await database.query('update profiles set equipped_blook_id=$2 where id=$1', [buyer, legacyBread.Brioche]);
    await database.query("insert into marketplace_listings(profile_id,blook_id,quantity,price,status) values($1,$2,1,50,'active')", [buyer, legacyBread['Burnt Toast']]);
    const extraBreadReplacementMigration = fs.readFileSync('supabase/migrations/0019_replace_legacy_bread_inventory.sql', 'utf8');
    await database.exec(extraBreadReplacementMigration);
    await database.exec(extraBreadReplacementMigration);
    assert.equal((await database.query('select quantity from inventory where profile_id=$1 and blook_id=$2 and shiny=false', [buyer, toasterId])).rows[0].quantity, 3);
    assert.equal((await database.query('select quantity from inventory where profile_id=$1 and blook_id=$2 and shiny=true', [buyer, toasterId])).rows[0].quantity, 1);
    assert.equal((await database.query('select quantity from inventory where profile_id=$1 and blook_id=$2 and shiny=false', [buyer, croissantId])).rows[0].quantity, 2);
    assert.equal((await database.query('select quantity from inventory where profile_id=$1 and blook_id=$2 and shiny=false', [buyer, cinnamonRollId])).rows[0].quantity, 5);
    assert.equal((await database.query('select equipped_blook_id from profiles where id=$1', [buyer])).rows[0].equipped_blook_id, croissantId);
    assert.equal((await database.query("select blook_id from marketplace_listings where profile_id=$1 and status='active'", [buyer])).rows[0].blook_id, toasterId);
    assert.equal((await database.query('select count(*)::integer as total from inventory where profile_id=$1 and blook_id=any($2::uuid[])', [buyer, legacyBreadIds.map(({ id }) => id)])).rows[0].total, 0);
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
    await database.exec(tankMigration);
  } finally {
    await database.close();
  }
});