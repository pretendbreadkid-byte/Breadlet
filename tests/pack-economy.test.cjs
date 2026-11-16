// Opening a Goodybag and selling everything in it must lose Bread Bucks on average, every day, in and
// out of Power Hour. This runs before every build (package.json), so a bag that players could farm
// (like the Candy Bag at ~27 back for 25) can never ship.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const ts = require('typescript');

const loaded = {};
const source = ts.transpileModule(fs.readFileSync('lib/gameplay-catalog.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports: loaded, console, require: () => { throw new Error('gameplay-catalog must not import anything'); } });
const catalog = loaded;

const DAY = 86400000;
// Each of the next 60 days twice: at 03:00 UTC (inside Power Hour) and 01:00 UTC (outside it).
const today = Math.floor(Date.now() / DAY) * DAY;
const times = Array.from({ length: 60 }, (_, index) => [new Date(today + index * DAY + 3 * 3600000), new Date(today + index * DAY + 3600000)]).flat();

test('no Goodybag pays back more than it should, on any day, in or out of Power Hour', () => {
  const problems = [];
  for (const pack of catalog.liveCapsules.filter((item) => item.price > 0)) {
    let worst = { resale: 0, at: null };
    for (const at of times) {
      const resale = catalog.packResaleFor(pack, at);
      if (resale > worst.resale) worst = { resale, at };
    }
    const limit = pack.price * catalog.MAX_PACK_RESALE_RATE;
    if (worst.resale >= limit) problems.push(`${pack.name}: pays back ${worst.resale.toFixed(2)} on average (price ${pack.price}, limit ${limit.toFixed(2)}) at ${worst.at.toISOString()}${catalog.powerHourAt(worst.at.getTime()).live ? ' (Power Hour)' : ''}. Lower its Epic+ odds.`);
  }
  assert.deepEqual(problems, []);
});

test('every Goodybag\'s odds add up to 100%', () => {
  for (const pack of catalog.liveCapsules) {
    for (const at of times.slice(0, 16)) {
      const total = pack.pool.reduce((sum, reward) => sum + catalog.luckyChanceFor(pack, reward, at), 0);
      assert.ok(Math.abs(total - 100) < 0.01, `${pack.name} odds add up to ${total.toFixed(3)}%`);
    }
  }
});
