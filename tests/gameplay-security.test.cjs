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
const { planGameplay, MAX_MASS_OPEN_COUNT } = loadModule('lib/gameplay-actions.ts', {
  './gameplay-catalog': catalog,
  './market-stock': marketStock,
});

test('server-generated rewards reject forged results and invalid gameplay requests', () => {
  const now = new Date('2026-10-05T01:30:00Z');
  const snapshot = { tokens: 1000, materials: { Metal: 12, Cloth: 8 }, inventory: { Gears: { quantity: 3, rarity: 'Rare' } }, wheelSpun: false };
  const massPack = catalog.liveCapsules.find((pack) => marketStock.isMarketPackInStock(pack.name, now));
  const secondMassPack = catalog.liveCapsules.find((pack) =>
    pack.name !== massPack.name && marketStock.isMarketPackInStock(pack.name, now),
  );
  const massSnapshot = { ...snapshot, tokens: Number.MAX_SAFE_INTEGER };
  assert.throws(
    () => planGameplay({ action: 'open', quantities: { [massPack.name]: MAX_MASS_OPEN_COUNT + 1 } }, massSnapshot, () => 0, now),
    /Invalid item quantity/,
  );
  assert.throws(
    () => planGameplay({ action: 'open', quantities: { [massPack.name]: MAX_MASS_OPEN_COUNT, [secondMassPack.name]: 1 } }, massSnapshot, () => 0, now),
    /at most 2500 Goodybags/,
  );
  assert.equal(
    planGameplay({ action: 'open', quantities: { [massPack.name]: MAX_MASS_OPEN_COUNT } }, massSnapshot, () => 0, now).capsulesOpened,
    2500,
  );
  const inventions = catalog.liveCapsules.find((pack) => pack.name === 'Inventions Bag');
  assert.equal(inventions.pool.find((reward) => reward.name === 'Magnifying Glass').rarity, 'Common');
  assert.equal(inventions.pool.find((reward) => reward.name === 'Magnifying Glass').art, '/assets/magnifying-glass-2.svg');
  assert.equal(inventions.pool.find((reward) => reward.name === 'Bitcoin').rarity, 'Mythic');
  assert.equal(inventions.pool.find((reward) => reward.name === "Light Bulb").rarity, 'Epic');
  const space = catalog.liveCapsules.find((pack) => pack.name === 'Space Bag');
  assert.equal(space.pool.find((reward) => reward.name === 'Space Goo').rarity, 'Uncommon');
  assert.equal(space.pool.some((reward) => reward.name === 'Space Trooper'), false);
  const marsChance = catalog.chanceFor(space, space.pool.find((reward) => reward.name === 'Mars'));
  assert.ok(marsChance > 25 && marsChance < 40, `Mars chance is spread below 40% (was ${marsChance}%)`);
  const foodBag = catalog.liveCapsules.find((pack) => pack.name === 'Food Bag');
  const blookTuberBag = catalog.liveCapsules.find((pack) => pack.name === 'BlookTuber Bag');
  const mythicChance = (pack) => catalog.chanceFor(pack, pack.pool.find((reward) => reward.rarity === 'Mythic'));
  assert.equal(mythicChance(foodBag), 0.5, 'the largest reward pool gives Mythic rewards 0.5% odds');
  const smallestMythicPack = catalog.legacyCapsules.find((pack) => pack.name === 'Legacy Bread Bag');
  assert.equal(mythicChance(smallestMythicPack), 0.2, 'the smallest reward pool gives Mythic rewards 0.2% odds');
  for (const pack of [...catalog.liveCapsules, ...catalog.legacyCapsules]) {
    const mythicReward = pack.pool.find((reward) => reward.rarity === 'Mythic');
    if (mythicReward) {
      const chance = catalog.chanceFor(pack, mythicReward);
      assert.ok(chance >= 0.2 && chance <= 0.5, `${pack.name} Mythic odds stay in the 0.2%-0.5% range`);
    }
  }
  const sortedByPoolSize = [...catalog.liveCapsules, ...catalog.legacyCapsules].sort((left, right) => left.pool.length - right.pool.length);
  for (let index = 1; index < sortedByPoolSize.length; index += 1) {
    assert.ok(mythicChance(sortedByPoolSize[index]) >= mythicChance(sortedByPoolSize[index - 1]),
      'larger reward pools have at least as high Mythic odds');
  }
  assert.equal(space.pool.find((reward) => reward.name === 'Earth').art, '/assets/Lost and found + food pack/earth 2.svg');
  assert.equal(space.pool.find((reward) => reward.name === 'Globe').rarity, 'Uncommon');
  assert.equal(space.pool.find((reward) => reward.name === 'Globe').art, '/assets/earth-globe.svg');
  assert.equal(space.pool.find((reward) => reward.name === 'Alien').art, '/assets/alien%202%20frame%201.svg');
  assert.equal(space.pool.find((reward) => reward.name === 'Sun').rarity, 'Rare');
  assert.equal(space.pool.find((reward) => reward.name === 'Space Goo').rarity, 'Uncommon');
  assert.equal(space.pool.some((reward) => reward.name === 'Space Trooper'), false);
  assert.equal(space.pool.find((reward) => reward.name === 'Consolation').rarity, 'Uncommon');
  assert.equal(space.pool.find((reward) => reward.name === 'Sun').art, '/assets/sun.svg');
  assert.equal(space.pool.find((reward) => reward.name === 'Eclipse').art, '/assets/solar%20ecplise%20but%20good.svg');
  const bread = catalog.liveCapsules.find((pack) => pack.name === 'Bread Bag');
  assert.equal(bread.pool.map((reward) => reward.name).join(','),
    'Sour Dough,Toaster,Golden Toaster,Croissant,Cinnamon Roll,Robo Bread,Slime Bread,Gold Bread,Holy Bread');
  assert.equal(bread.pool.find((reward) => reward.name === 'Holy Bread').art, '/assets/holy-bread-refreshed.svg');
  assert.equal(bread.pool.find((reward) => reward.name === 'Toaster').rarity, 'Rare');
  assert.equal(bread.pool.find((reward) => reward.name === 'Robo Bread').rarity, 'Epic');
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
  assert.equal(combat.pool.find((reward) => reward.name === 'Diamond Sword').rarity, 'Breadled');
  const oliveGrenadeChance = catalog.chanceFor(combat, combat.pool.find((reward) => reward.name === 'Olive Grenade'));
  assert.ok(oliveGrenadeChance > 25 && oliveGrenadeChance < 40, `Olive Grenade chance is spread below 40% (was ${oliveGrenadeChance}%)`);
  assert.equal(combat.pool.find((reward) => reward.name === 'Shuriken').rarity, 'Uncommon');
  for (const art of [
    'grenade2.svg',
    'gold grenade2.svg',
    'shuricken 2.svg',
    'gold shuricken 2.svg',
    'spartin  2.svg',
    'diamond sword frame one.svg',
    ...Array.from({ length: 7 }, (_, index) => `diamond sword${index + 2}.svg`),
  ]) assert.ok(fs.existsSync(`public/assets/${art}`), `${art} replacement artwork exists`);
  assert.equal(catalog.liveCapsules.find((pack) => pack.name === 'Food Bag').pool.find((reward) => reward.name === 'Avocado').rarity, 'Common');
  assert.equal(catalog.liveCapsules.find((pack) => pack.name === 'BlookTuber Bag').pool.find((reward) => reward.name === 'Blooket Gods').rarity, 'Common');
  const blookTuber = catalog.liveCapsules.find((pack) => pack.name === 'BlookTuber Bag');
  const pageSource = fs.readFileSync('app/page.tsx', 'utf8');
  const stylesSource = fs.readFileSync('app/globals.css', 'utf8');
  assert.equal(blookTuber.pool.length, 11);
  for (const name of ['Twisted Bread', 'SRN', 'Blook Master', 'Turtwix', 'Green Astronaut']) {
    const reward = blookTuber.pool.find((item) => item.name === name);
    assert.ok(reward, `${name} is in the BlookTuber Bag`);
    assert.ok(fs.existsSync(`public/${reward.art.slice(1)}`), `${name} artwork exists`);
    assert.ok(pageSource.split('\n').some((line) => line.includes(name) && line.includes(reward.art)), `${name} is mapped to its pack artwork`);
  }
  assert.equal(catalog.liveCapsules.find((pack) => pack.name === 'Bread Bag').pool.find((reward) => reward.name === 'Robo Bread').rarity, 'Epic');
  assert.equal(artifact.pool.find((reward) => reward.name === 'Aztec Coin').art, undefined);
  assert.equal(artifact.pool.find((reward) => reward.name === 'Clay Vase').art, '/assets/clay-vase.svg');
  for (const pack of [space, lostAndFound, artifact]) {
    for (const reward of pack.pool) {
      if (reward.art) assert.ok(fs.existsSync(`public/${decodeURIComponent(reward.art.slice(1))}`), `${reward.name} artwork exists`);
    }
    assert.ok(fs.existsSync('public/assets/magnifying-glass.svg'), 'Magnifying Glass artwork exists');
    assert.ok(fs.existsSync('public/assets/Lost and found + food pack/earth 2.svg'), 'original Earth artwork exists');
    assert.ok(fs.existsSync('public/assets/earth-globe.svg'), 'Globe artwork exists');
    for (let frame = 1; frame <= 13; frame += 1) {
      assert.ok(fs.existsSync(`public/assets/alien 2 frame ${frame}.svg`), `Alien animation frame ${frame} exists`);
    }
    assert.ok(!fs.readFileSync('app/page.tsx', 'utf8').includes('lar blaster (for alien).svg'), 'Alien is rendered without the laser accessory');
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
    ['Sword', '/assets/sword way better.svg'],
    ['Diamond Sword', '/assets/diamond sword frame one.svg'],
    ['Sprinkle Bread', '/assets/Sprinkle bread improved.svg'],
    ['Rock', '/assets/rock-refreshed.svg'],
    ['Candy Corn', '/assets/candy-corn-refreshed.svg'],
  ]) {
    assert.ok(fs.existsSync(`public${art}`), `${name} artwork exists`);
  }
  for (const obsoleteArt of [
    'sword.svg',
    'shuricken.svg',
    'golden-shuriken.svg',
    'grenade.png',
    'golden grenade.png',
    'golden shuricken2 (1).svg',
    'spartin  (1).svg',
    'Blaster (light sword replacement).svg',
    'ted-shop-wordmark.svg',
    'teds-shop-wordmark.png',
  ]) assert.ok(!fs.existsSync(`public/assets/${obsoleteArt}`), `${obsoleteArt} was removed after replacement`);
  assert.ok(!pageSource.includes('Daily Crate'), 'the old Daily Crate tab label was removed');
  assert.ok(pageSource.includes('Claim Tokens</button>}<button onClick={openLookup}'), 'the Claim Tokens shortcut sits beside Find Player');
  assert.ok(!pageSource.includes('id: "event"'), 'the ended Contest of Spooky tab is removed');
  assert.ok(pageSource.includes('aria-label="Previous four Blooks"') && pageSource.includes('aria-label="Next four Blooks"'), 'Bazaar arrows page through four Blooks at a time');
  assert.match(fs.readFileSync('app/globals.css', 'utf8'), /\.bazaar-blook-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/, 'the Bazaar carousel shows four Blooks in a row on desktop');
  assert.ok(pageSource.includes('placeholder="Search Blooks"') && pageSource.includes('aria-label="Filter by rarity"'), 'the Bazaar has clearly labeled Blook search and rarity filtering');
  assert.ok(pageSource.includes('MAX_MARKETPLACE_PRICE = 2147483647') && pageSource.includes('max={MAX_MARKETPLACE_PRICE}'), 'Bazaar price input accepts the signed 32-bit integer maximum');
  assert.ok(fs.readFileSync('app/api/marketplace/route.ts', 'utf8').includes('MAX_MARKETPLACE_PRICE = 2147483647'), 'marketplace API accepts the signed 32-bit integer maximum');
  assert.ok(fs.readFileSync('app/page.tsx', 'utf8').includes('MAX_MASS_OPEN_COUNT'), 'mass-open UI enforces the shared pack cap');
  assert.ok(pageSource.includes('Open Recycle Station') && pageSource.includes('showRecycleStation &&'), 'the dismantle station is hidden until opened from its button');
  assert.match(stylesSource, /\.chat-group-message:hover \.chat-message-icon-button[\s\S]*?opacity:\s*\.85/, 'chat edit and reply controls appear on hover');
  assert.match(fs.readFileSync('app/globals.css', 'utf8'), /\.bazaar-market\s*\{[^}]*background:\s*transparent\s*!important/, 'the Bazaar keeps the animated page background visible');
  assert.match(fs.readFileSync('app/globals.css', 'utf8'), /\.bazaar-filter-control\s*\{[^}]*background:\s*#27251F/, 'Bazaar search and filter controls use the dark sidebar palette');
  assert.match(fs.readFileSync('app/globals.css', 'utf8'), /\.bazaar-art-stage\s*\{[^}]*background:\s*#13120F/, 'Blook art sits on a high-contrast dark stage');
  assert.ok(pageSource.includes('function BlookListingsModal'), 'clicking a Bazaar Blook opens grouped seller offers');
  assert.ok(pageSource.includes('className="token-crate-panel') && pageSource.includes('h-56 w-56'), 'the token crate panel is unboxed and enlarged');
  assert.match(fs.readFileSync('app/globals.css', 'utf8'), /\.token-crate-panel\s*\{[^}]*border:\s*0\s*!important;[^}]*background:\s*transparent\s*!important/, 'the token crate panel styling is transparent and borderless');
  assert.ok(pageSource.includes('messageGroups.map') && pageSource.includes('<Reply size={16} />') && pageSource.includes('<Pencil size={14} />'), 'chat groups consecutive messages and uses reply and edit icons');
  const chatRoute = fs.readFileSync('app/api/chat/route.ts', 'utf8');
  assert.match(chatRoute, /export async function PATCH[\s\S]*?\.eq\('profile_id', user\.id\)[\s\S]*?\.eq\('is_breadlet_bot', false\)/, 'chat edits are limited to the authenticated author and exclude bot messages');
  assert.ok(fs.existsSync('supabase/migrations/0034_allow_owners_to_edit_chat_messages.sql'), 'chat message edits have an owner-only database policy');
  assert.ok(fs.existsSync('public/assets/space goo 2.0.svg'), 'updated Space Goo artwork exists');
  assert.ok(pageSource.includes('"Space Goo": "/assets/space goo 2.0.svg"'), 'Space Goo renders with its updated artwork');
  assert.ok(fs.existsSync('supabase/migrations/0035_update_space_goo_artwork.sql'), 'deployed Space Goo artwork is updated by migration');
  assert.ok(pageSource.includes('className="teds-shop-heading'), 'Ted’s Shop uses the text heading instead of a logo');
  assert.match(stylesSource, /\.clan-workspace \.clan-member-avatar[\s\S]*?background: transparent;/, 'clan member Blooks render without a backing box');
  assert.match(stylesSource, /\.teds-shop-heading[^}]*color: #FFFFFF;[^}]*font-family: "DynaPuff"/, 'Ted’s Shop title uses bold white DynaPuff text');
  for (const pack of [...catalog.liveCapsules, ...catalog.legacyCapsules]) {
    assert.ok(Math.abs(pack.pool.reduce((sum, reward) => sum + catalog.chanceFor(pack, reward), 0) - 100) < 1e-8);
  }
  assert.equal(
    catalog.sortByRarity([{ rarity: 'Breadled' }, { rarity: 'Rare' }, { rarity: 'Common' }, { rarity: 'Epic' }]).map(({ rarity }) => rarity).join(','),
    'Common,Rare,Epic,Breadled',
  );
  const opening = planGameplay({ action: 'open', quantities: { 'Inventions Bag': 1 }, reward: 'Bitcoin', tokens: 999999 }, snapshot, () => 0, now);
  assert.equal(opening.results[0].reward.name, 'Wheel');
  assert.equal(opening.tokenDelta, -25);
  assert.equal(opening.candyDelta, 0);
  assert.equal(planGameplay({ action: 'crate' }, snapshot, () => 0, now).candyDelta, 0);
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
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table blooks(id uuid primary key default gen_random_uuid(), name text unique not null, rarity text not null, artwork_key text, retired boolean not null default false);
      create table chests(id uuid primary key default gen_random_uuid(), name text unique not null, price integer not null, description text, pool jsonb not null default '[]', rarity text, is_retired boolean not null default false, active boolean not null default true);
      create table profiles(id uuid primary key, username text, created_at timestamptz not null default now(), tokens integer not null default 0 check(tokens>=0), stats jsonb not null default '{}', materials jsonb not null default '{}', is_banned boolean default false, account_status text default 'active', equipped_blook_id uuid);
      create table token_transactions(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), type text not null, delta integer not null, reason text not null, created_at timestamptz not null default now());
      create table chest_rolls(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), tokens_spent integer not null);
      create table inventory(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), blook_id uuid references blooks(id), quantity integer not null check(quantity>=0), shiny boolean default false, retired boolean not null default false, unique(profile_id,blook_id,shiny));
      create table marketplace_listings(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), blook_id uuid references blooks(id), quantity integer, price integer, status text, sold_at timestamptz);
      create table notifications(id uuid primary key default gen_random_uuid(), profile_id uuid, type text not null, payload jsonb not null default '{}', is_read boolean not null default false, created_at timestamptz not null default now());
      create table events(id uuid primary key default gen_random_uuid(), name text not null, start_at timestamptz not null, end_at timestamptz not null, active boolean not null default true);
      create table mine_progress(id uuid primary key default gen_random_uuid(), profile_id uuid);
      create table clans(id uuid primary key default gen_random_uuid(), name text not null default ('Clan-' || gen_random_uuid()::text), description text, tags text[] not null default '{}', owner_profile_id uuid, treasury integer default 0, member_count integer default 1, thumbnail_url text, created_at timestamptz not null default now());
      create table clan_members(id uuid primary key default gen_random_uuid(), profile_id uuid, clan_id uuid, role text default 'member', token_contributions integer default 0, joined_at timestamptz not null default now());
      create table global_chat_messages(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), message text not null, reply_to_message_id uuid, created_at timestamptz not null default now(), deleted_at timestamptz);
      create table trades(id uuid primary key default gen_random_uuid(), sender_profile_id uuid, receiver_profile_id uuid, status text);
      create function save_player_inventory(jsonb) returns void language plpgsql as $$begin return; end$$;
      grant all on profiles, inventory, mine_progress, marketplace_listings to authenticated;
      set timezone='America/Denver';
    `);
    const migration = fs.readFileSync('supabase/migrations/0015_secure_gameplay.sql', 'utf8');
    await database.exec(migration);
    const marketplaceLimitMigration = fs.readFileSync('supabase/migrations/0036_raise_bazaar_price_limit.sql', 'utf8');
    await database.exec(marketplaceLimitMigration);
    await database.exec(marketplaceLimitMigration);
    const tankMigration = fs.readFileSync('supabase/migrations/0016_inventions_tank.sql', 'utf8');
    await database.exec(tankMigration);
    await database.query("insert into chests(name,price,pool) values ('Human Bag',25,'[]'),('Pixel Bag',25,'[]'),('Remix Bag',25,'[]'),('BlookTuber Bag',25,'[\"Bread Blook\",\"Blooket Life\",\"Blooket Gods\",\"Fasty Jay\",\"Lagoon\",\"Waymore\"]'),('Inventions Bag',25,'[\"Wheel\"]'),('Space Bag',25,'[\"Mars\",\"Earth\"]'),('Lost and Found Bag',25,'[\"Car Keys\"]'),('Artifact Bag',25,'[\"Aztec Coin\"]'),('Combat Bag',25,'[\"Olive Grenade\"]')");
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
    const latestCatalogMigration = fs.readFileSync('supabase/migrations/0025_latest_catalog_update.sql', 'utf8');
    await database.exec(latestCatalogMigration);
    await database.exec(latestCatalogMigration);
    const alienAnimationMigration = fs.readFileSync('supabase/migrations/0027_alien_animation_artwork.sql', 'utf8');
    await database.exec(alienAnimationMigration);
    await database.exec(alienAnimationMigration);
    const blookTuberMigration = fs.readFileSync('supabase/migrations/0028_blooktuber_pack_rewards.sql', 'utf8');
    await database.exec(blookTuberMigration);
    await database.exec(blookTuberMigration);
    const clanAndBankMigration = fs.readFileSync('supabase/migrations/0029_clan_chapter_two_and_token_bank.sql', 'utf8');
    await database.exec(clanAndBankMigration);
    await database.exec(clanAndBankMigration);
    const revisedRewardArtMigration = fs.readFileSync('supabase/migrations/0030_sword_and_sprinkle_bread_artwork.sql', 'utf8');
    await database.exec(revisedRewardArtMigration);
    await database.exec(revisedRewardArtMigration);
    const clanBlookAndChatBotMigration = fs.readFileSync('supabase/migrations/0031_clan_blook_profiles_and_chat_bot.sql', 'utf8');
    await database.exec(clanBlookAndChatBotMigration);
    await database.exec(clanBlookAndChatBotMigration);
    const diamondSwordMigration = fs.readFileSync('supabase/migrations/0032_diamond_sword_and_combat_artwork.sql', 'utf8');
    await database.exec(diamondSwordMigration);
    await database.exec(diamondSwordMigration);
    const spaceTrooperId = (await database.query("select id from blooks where name='Space Trooper'")).rows[0].id;
    const spaceGooMigration = fs.readFileSync('supabase/migrations/0033_close_spooky_contest_and_replace_space_trooper.sql', 'utf8');
    const contestPlayers = [
      ['00000000-0000-0000-0000-00000000000a', 'CandyWinnerA', 100],
      ['00000000-0000-0000-0000-00000000000b', 'CandyWinnerB', 90],
      ['00000000-0000-0000-0000-00000000000c', 'CandyWinnerC', 80],
      ['00000000-0000-0000-0000-00000000000d', 'CandyWinnerD', 40],
      ['00000000-0000-0000-0000-00000000000e', 'CandyZero', 0],
    ];
    for (const [id, username, candy] of contestPlayers) {
      await database.query(
        'insert into profiles(id,username,stats) values($1,$2,$3)',
        [id, username, JSON.stringify({ candy })],
      );
    }
    await database.query(`
      insert into profiles(id,username,stats)
      select ('00000000-0000-0000-0000-' || lpad(to_hex(100 + n),12,'0'))::uuid,
             'ContestFiller' || n,
             jsonb_build_object('candy',40 - n)
      from generate_series(1,27) as fillers(n)
    `);
    await database.query("insert into events(name,start_at,end_at,active) values('Contest of Spooky',now() - interval '1 day',now() + interval '30 days',true)");
    await database.query("update chests set pool='[\"Mars\",\"Space Trooper\"]' where name='Space Bag'");
    await database.query(
      "insert into inventory(profile_id,blook_id,quantity,shiny) values($1,$2,3,false),($1,$2,1,true)",
      [contestPlayers[0][0], spaceTrooperId],
    );
    await database.query("update profiles set equipped_blook_id=$1 where id=$2", [spaceTrooperId, contestPlayers[0][0]]);
    await database.query(
      "insert into marketplace_listings(profile_id,blook_id,quantity,price,status) values($1,$2,1,25,'active')",
      [contestPlayers[0][0], spaceTrooperId],
    );
    await database.exec(spaceGooMigration);
    await database.exec(spaceGooMigration);
    const replacementBlooks = (await database.query("select name,rarity,artwork_key,retired from blooks where name in ('Space Trooper','Space Goo') order by name")).rows;
    assert.deepEqual(replacementBlooks, [
      { name: 'Space Goo', rarity: 'Uncommon', artwork_key: 'space goo (1).svg', retired: false },
      { name: 'Space Trooper', rarity: 'Uncommon', artwork_key: 'Lost and found + food pack/space troopeer.png', retired: true },
    ]);
    const spaceGooArtworkMigration = fs.readFileSync('supabase/migrations/0035_update_space_goo_artwork.sql', 'utf8');
    await database.exec(spaceGooArtworkMigration);
    await database.exec(spaceGooArtworkMigration);
    assert.equal(
      (await database.query("select artwork_key from blooks where name='Space Goo'")).rows[0].artwork_key,
      'space goo 2.0.svg',
    );
    const transferredInventory = (await database.query(
      "select quantity,shiny from inventory where profile_id=$1 and blook_id=(select id from blooks where name='Space Goo') order by shiny",
      [contestPlayers[0][0]],
    )).rows;
    assert.deepEqual(transferredInventory, [{ quantity: 3, shiny: false }, { quantity: 1, shiny: true }]);
    assert.equal((await database.query("select equipped_blook_id=(select id from blooks where name='Space Goo') as equipped from profiles where id=$1", [contestPlayers[0][0]])).rows[0].equipped, true);
    assert.equal((await database.query("select blook_id=(select id from blooks where name='Space Goo') as replaced from marketplace_listings where profile_id=$1", [contestPlayers[0][0]])).rows[0].replaced, true);
    assert.deepEqual((await database.query("select pool from chests where name='Space Bag'")).rows[0].pool, ['Mars', 'Space Goo']);
    assert.equal((await database.query("select count(*)::integer as total from notifications where profile_id=$1 and type='blook_replacement'", [contestPlayers[0][0]])).rows[0].total, 1);
    assert.equal((await database.query("select count(*)::integer as total from spooky_contest_prizes")).rows[0].total, 30);
    const contestPrizes = (await database.query(
      "select profile.username, prize.placement, reward.name as reward from spooky_contest_prizes prize join profiles profile on profile.id=prize.profile_id join blooks reward on reward.id=prize.reward_blook_id order by prize.placement",
    )).rows;
    assert.deepEqual(contestPrizes.slice(0, 4), [
      { username: 'CandyWinnerA', placement: 1, reward: 'Festive Skeleton Pirate' },
      { username: 'CandyWinnerB', placement: 2, reward: 'Festive Skeleton Pirate' },
      { username: 'CandyWinnerC', placement: 3, reward: 'Festive Skeleton Pirate' },
      { username: 'CandyWinnerD', placement: 4, reward: 'Skeleton Pirate' },
    ]);
    assert.equal(contestPrizes.at(-1).placement, 30);
    assert.equal(contestPrizes.at(-1).reward, 'Skeleton Pirate');
    assert.equal((await database.query("select count(*)::integer as total from spooky_contest_prizes prize join profiles profile on profile.id=prize.profile_id where profile.username like 'ContestFiller%'")).rows[0].total, 26);
    assert.equal((await database.query("select count(*)::integer as total from spooky_contest_prizes prize join profiles profile on profile.id=prize.profile_id where profile.username='CandyZero'")).rows[0].total, 0);
    assert.equal((await database.query("select count(*)::integer as total from notifications where type='spooky_contest_prize'")).rows[0].total, 30);
    assert.equal((await database.query("select active from events where name='Contest of Spooky'")).rows[0].active, false);
    await database.query("select set_config('request.jwt.claim.role','service_role',false)");
    await assert.rejects(
      () => database.query("select apply_gameplay_action($1,0,'open',0,'[]','{}',1,0)", [contestPlayers[0][0]]),
      /Contest of Spooky has ended/i,
    );
    const candyBeforeDisabledTradeAward = (await database.query("select (stats->>'candy')::integer as candy from profiles where id=$1", [contestPlayers[0][0]])).rows[0].candy;
    await database.query("select award_trade_candy('00000000-0000-0000-0000-000000000099')");
    assert.equal((await database.query("select (stats->>'candy')::integer as candy from profiles where id=$1", [contestPlayers[0][0]])).rows[0].candy, candyBeforeDisabledTradeAward);
    await database.query("select set_config('request.jwt.claim.role','',false)");
    assert.equal((await database.query("select rarity from blooks where name='Old Transcendent'")).rows[0].rarity, 'Breadled');
    const tank = (await database.query("select rarity, artwork_key from blooks where name = $1", ["Light Bulb"])).rows[0];
    assert.equal(tank.rarity, 'Epic');
    assert.equal(tank.artwork_key, 'light-bulb.svg');
    const sun = (await database.query("select rarity, artwork_key from blooks where name = 'Sun'")).rows[0];
    assert.equal(sun.rarity, 'Rare');
    assert.equal(sun.artwork_key, 'sun.svg');
    assert.equal((await database.query("select artwork_key from blooks where name='Alien'")).rows[0].artwork_key, 'alien 2 frame 1.svg');
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
      'Aztec Coin:Aztect Coin 2.0.svg,Clay Vase:clay-vase.svg,Coffee Mug:coffee-mug.svg,Earth:Lost and found + food pack/earth 2.svg');
    const newBlookArt = (await database.query("select name, rarity, artwork_key from blooks where name in ('Globe','Magnifying Glass') order by name")).rows;
    assert.equal(newBlookArt.map(({ name, rarity, artwork_key }) => `${name}:${rarity}:${artwork_key}`).join(','),
      'Globe:Uncommon:earth-globe.svg,Magnifying Glass:Common:magnifying-glass.svg');
    assert.deepEqual((await database.query("select pool from chests where name='Inventions Bag'")).rows[0].pool,
      ['Wheel', 'Magnifying Glass']);
    assert.deepEqual((await database.query("select pool from chests where name='Space Bag'")).rows[0].pool,
      ['Mars', 'Space Goo']);
    assert.deepEqual((await database.query("select pool from chests where name='BlookTuber Bag'")).rows[0].pool,
      ['Bread Blook', 'Blooket Life', 'Blooket Gods', 'Fasty Jay', 'Lagoon', 'Waymore', 'Twisted Bread', 'SRN', 'Blook Master', 'Turtwix', 'Green Astronaut']);
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
      ['Olive Grenade', 'The Bomb', 'Golden Grenade', 'Sword', 'Shuriken', 'Nunchucks', 'Spartan', 'Golden Shuriken', 'Diamond Sword'],
    );
    const diamondSword = (await database.query("select rarity, artwork_key, retired from blooks where name='Diamond Sword'")).rows[0];
    assert.deepEqual(diamondSword, { rarity: 'Breadled', artwork_key: 'diamond sword frame one.svg', retired: false });
    const newCombatArt = (await database.query("select name, artwork_key from blooks where name in ('Olive Grenade','Golden Grenade','Shuriken','Spartan','Golden Shuriken') order by name")).rows;
    assert.equal(newCombatArt.map(({ name, artwork_key }) => `${name}:${artwork_key}`).join(','),
      'Golden Grenade:gold grenade2.svg,Golden Shuriken:gold shuricken 2.svg,Olive Grenade:grenade2.svg,Shuriken:shuricken 2.svg,Spartan:spartin  2.svg');
    const newRewardArt = (await database.query("select name, artwork_key from blooks where name in ('Wallet','Sword','Rock','Candy Corn','Sprinkle Bread') order by name")).rows;
    assert.equal(newRewardArt.map(({ name, artwork_key }) => `${name}:${artwork_key}`).join(','),
      'Candy Corn:candy-corn-refreshed.svg,Rock:rock-refreshed.svg,Sprinkle Bread:Sprinkle bread improved.svg,Sword:sword way better.svg,Wallet:wallet.svg');
    assert.equal((await database.query("select count(*)::integer as total from chests where active and name in ('Human Bag','Pixel Bag','Remix Bag')")).rows[0].total, 0);
    await database.query("insert into blooks(name,rarity) values ('Burnt Toast','Common'),('Brioche','Common'),('Donut','Uncommon') on conflict(name) do nothing");
    const buyer = '00000000-0000-0000-0000-000000000001';
    const seller = '00000000-0000-0000-0000-000000000002';
    await database.query('insert into profiles(id,tokens) values($1,1000),($2,1000)', [buyer, seller]);
    const clanCreator = '00000000-0000-0000-0000-000000000003';
    await database.query('insert into profiles(id,tokens) values($1,10000)', [clanCreator]);
    await database.query("select set_config('request.jwt.claim.sub',$1,false)", [clanCreator]);
    await assert.rejects(
      () => database.query("select create_clan_with_cost('Test Clan','','{}',null,'Not a Blook')"),
      /Choose a valid Blook/i,
    );
    await database.query("select create_clan_with_cost('Avatar Test Clan','','{}',null,'Old Transcendent')");
    assert.equal((await database.query("select profile_blook from clans where name='Avatar Test Clan'")).rows[0].profile_blook, 'Old Transcendent');
    await database.query("select set_config('request.jwt.claim.sub','',false)");

    await database.query(
      "insert into global_chat_messages(profile_id,message,is_breadlet_bot) select $1,'human message ' || n,true from generate_series(1,20) n",
      [buyer],
    );
    assert.equal((await database.query('select count(*)::integer as total from global_chat_messages')).rows[0].total, 21);
    assert.equal((await database.query('select count(*)::integer as total from global_chat_messages where is_breadlet_bot')).rows[0].total, 1);
    assert.equal((await database.query('select human_message_count from global_chat_bot_cadence where id=1')).rows[0].human_message_count, 20);
    const firstBot = (await database.query('select message, created_at from global_chat_messages where is_breadlet_bot')).rows[0];
    const lastHuman = (await database.query('select max(created_at) as created_at from global_chat_messages where not is_breadlet_bot')).rows[0];
    assert.ok(firstBot.message.length > 0);
    assert.ok(new Date(firstBot.created_at) > new Date(lastHuman.created_at), 'the fact appears after the twentieth player message');
    await database.query(
      "insert into global_chat_messages(profile_id,message) select $1,'next human message ' || n from generate_series(1,20) n",
      [buyer],
    );
    assert.equal((await database.query('select count(*)::integer as total from global_chat_messages where is_breadlet_bot')).rows[0].total, 2);
    assert.equal((await database.query('select human_message_count from global_chat_bot_cadence where id=1')).rows[0].human_message_count, 40);
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
    const rebalanceMigration = fs.readFileSync('supabase/migrations/0026_rebalance_rarity_weights.sql', 'utf8');
    await database.exec(rebalanceMigration);
    await database.exec(rebalanceMigration);
    const breadRarities = (await database.query("select name, rarity from blooks where name in ('Toaster','Robo Bread') order by name")).rows;
    assert.equal(breadRarities.map(({ name, rarity }) => `${name}:${rarity}`).join(','), 'Robo Bread:Epic,Toaster:Rare');
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
    await apply(0, 'open', -25, [{ blook_id: wheel, quantity: 1, shiny: false }], {}, 0, 1);
    assert.equal((await database.query('select tokens from profiles where id=$1', [buyer])).rows[0].tokens, 975);
    await assert.rejects(() => apply(0, 'open', -25), /state changed/i);
    await cooldown();
    await assert.rejects(() => apply(1, 'open', -5000), /token balance/i);
    await assert.rejects(() => apply(1, 'craft', 0, [{ blook_id: wheel, quantity: 1, shiny: false }], { Metal: -20 }), /materials/i);
    assert.equal((await database.query('select quantity from inventory where profile_id=$1 and blook_id=$2', [buyer, wheel])).rows[0].quantity, 6);
    await apply(1, 'crate', 250);
    await cooldown();
    await assert.rejects(() => apply(2, 'crate', 250), /already claimed/i);
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
    const maximumPriceListing = (await database.query(
      "select secure_marketplace_action($1,'create','Bitcoin',2147483647,null) as result",
      [buyer],
    )).rows[0].result.listing;
    assert.equal(maximumPriceListing.price, 2147483647);
    await database.query('select secure_builtin_promo($1)', [buyer]);
    await assert.rejects(() => database.query('select secure_builtin_promo($1)', [buyer]), /already redeemed/i);
    const clan = (await database.query('insert into clans default values returning id')).rows[0].id;
    await assert.rejects(() => database.query('select secure_clan_donation($1,$2,100)', [buyer, clan]), /Join this clan/i);
    await database.query('insert into clan_members(profile_id,clan_id) values($1,$2)', [buyer, clan]);
    await database.query('select secure_clan_donation($1,$2,100)', [buyer, clan]);
    assert.equal((await database.query('select treasury from clans where id=$1', [clan])).rows[0].treasury, 100);
    await database.query('update clans set owner_profile_id=$2, treasury=60000 where id=$1', [clan, buyer]);
    const upgrade = (profileId, feature, value = null) => database.query(
      'select secure_clan_upgrade($1,$2,$3,$4)', [profileId, clan, feature, value],
    );
    await assert.rejects(() => upgrade(seller, 'banner_unlock'), /Only the clan owner/i);
    await upgrade(buyer, 'banner_unlock');
    await upgrade(buyer, 'colors_unlock');
    await upgrade(buyer, 'theme', 'forest');
    assert.equal((await database.query('select banner_unlocked, colors_unlocked, theme, treasury from clans where id=$1', [clan])).rows[0].theme, 'forest');
    const request = (await database.query('select secure_clan_join_request($1,$2) as id', [seller, clan])).rows[0].id;
    await assert.rejects(() => database.query('select secure_clan_review_join_request($1,$2,$3)', [seller, request, 'approved']), /Only the clan owner/i);
    await database.query('select secure_clan_review_join_request($1,$2,$3)', [buyer, request, 'approved']);
    assert.equal((await database.query('select count(*)::integer as total from clan_members where profile_id=$1 and clan_id=$2', [seller, clan])).rows[0].total, 1);
    await assert.rejects(() => database.query('select secure_clan_join_request($1,$2)', [seller, clan]), /Leave your current clan/i);
    const bankTotals = (await database.query('select historical_estimate, tracked_spent from token_spending_summary where profile_id=$1', [buyer])).rows[0];
    assert.equal(bankTotals.tracked_spent, 225);
    await database.query('update profiles set tokens=tokens-10 where id=$1', [buyer]);
    assert.equal((await database.query('select tracked_spent from token_spending_summary where profile_id=$1', [buyer])).rows[0].tracked_spent, 235);
    await database.query("update clan_members set role='leader' where profile_id=$1 and clan_id=$2", [buyer, clan]);
    await assert.rejects(() => database.query('select secure_clan_join_request($1,$2)', [buyer, clan]), /Leave your current clan/i);
    await database.query('select secure_clan_leave($1,$2)', [buyer, clan]);
    assert.equal((await database.query('select owner_profile_id from clans where id=$1', [clan])).rows[0].owner_profile_id, seller);
    const secondRequest = (await database.query('select secure_clan_join_request($1,$2) as id', [buyer, clan])).rows[0].id;
    await database.query('select secure_clan_review_join_request($1,$2,$3)', [seller, secondRequest, 'approved']);
    await database.query('select secure_clan_leave($1,$2)', [buyer, clan]);
    const retriedRequest = (await database.query('select secure_clan_join_request($1,$2) as id', [buyer, clan])).rows[0].id;
    assert.equal(retriedRequest, secondRequest);
    assert.equal((await database.query('select status from clan_join_requests where id=$1', [retriedRequest])).rows[0].status, 'pending');
    const legacy = (await database.query("insert into marketplace_listings(profile_id,blook_id,quantity,price,status) values($1,$2,1,100,'active') returning id", [seller, bitcoin])).rows[0].id;
    await assert.rejects(() => database.query("select secure_marketplace_action($1,'buy','',0,$2)", [buyer, legacy]), /seller no longer owns/i);
    await database.exec(migration);
    await database.exec(tankMigration);
  } finally {
    await database.close();
  }
});