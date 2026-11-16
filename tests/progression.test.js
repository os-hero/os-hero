const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const P = require("../src/shared/progression");
const { REWARDS, normalizeExpedition } = require("../src/shared/expedition");
const { newAdventure, heroStats } = require("../src/shared/adventure");
const { AppStore } = require("../src/main/store");
const { LOOT_ITEMS, DROP_ITEMS, PITY_LIMIT } = require("../src/shared/loot");
const { lootMessages } = require("../src/shared/lootMessages");
const { ITEMS, defaultCharacter, equipItem } = require("../src/shared/catalog");
const { renderCharacterLayers, IDLE_POSES } = require("../src/main/pixelRenderer");
const { newerVersion } = require("../src/main/updater");
const AT = "2026-11-17T00:00:00.000Z";
const fresh = seed => P.createProgression({ gold: 17 }, normalizeExpedition({}), seed || 42, AT);
function advance(p, ms, step = 10000) { while (ms > 0) { p = P.advanceProgression(p, Math.min(ms, step), AT); ms -= step; } return p; }
function kill(p) { return advance(p, P.battleState(p.expedition.adventure).remainingMs); }

test("local beta can receive its eventual stable version but never the older public channel", () => {
  assert.equal(newerVersion("1.8.0", "1.8.0-beta.1"), true);
  assert.equal(newerVersion("1.7.0", "1.8.0-beta.1"), false);
  assert.equal(newerVersion("1.8.0", "1.8.0"), false);
  assert.equal(newerVersion("1.8.0-beta.2", "1.8.0-beta.1"), false);
});

test("migration preserves every old level and progress fraction without modifying input", () => {
  for (let xp = 0; xp <= 4900; xp += 37) {
    const old = normalizeExpedition({ adventure: { ...newAdventure(), xp, unlocked: 5, stage: 3, victories: 7 } });
    const before = JSON.stringify(old);
    const p = P.createProgression({ gold: 812, runtimeSecondsRemainder: 149 }, old, 42, AT);
    assert.equal(p.wallet.gold, 813); assert.equal(p.wallet.runtimeSecondsRemainder, 0);
    const stats = P.statsForXp(p.expedition.adventure.xp), prior = heroStats(xp);
    assert.equal(stats.level, prior.level);
    assert.ok(Math.abs(stats.xp / stats.nextXp - prior.xp / 100) < 0.01);
    assert.equal(p.expedition.adventure.unlocked, 5); assert.equal(p.expedition.adventure.victories, 7);
    assert.ok(REWARDS.every(r => p.expedition.unlocked.includes(r.id)));
    assert.equal(JSON.stringify(old), before);
  }
  assert.equal(P.statsForXp(P.migrateXp(4900)).level, 50);
});

test("only a completed kill grants gold, XP and one sequence; ticks are partition invariant", () => {
  const p = P.changeProgression(fresh(), "start"), duration = P.battleState(p.expedition.adventure).remainingMs;
  const before = advance(p, duration - 1);
  assert.equal(before.wallet.gold, 17); assert.equal(before.expedition.adventure.xp, 0);
  const after = P.advanceProgression(before, 1, AT);
  assert.equal(after.expedition.adventure.victories, 1); assert.equal(after.expedition.adventure.sequence, 1);
  assert.ok(after.wallet.gold >= 18); assert.equal(after.expedition.adventure.xp, 7);
  assert.equal(after.expedition.adventure.unlocked, 0); assert.equal(after.expedition.adventure.counts[0], 1);
  assert.deepEqual(advance(p, 7200000, 1000), advance(p, 7200000, 10000));
});

test("five enemies unlock a stage; advance and repeat modes have distinct behavior", () => {
  let p = P.changeProgression(fresh(), "start");
  for (let i = 0; i < 4; i++) p = kill(p);
  assert.equal(p.expedition.adventure.unlocked, 0); assert.equal(P.battleState(p.expedition.adventure).kind, "elite");
  p = kill(p); assert.equal(p.expedition.adventure.unlocked, 1); assert.equal(p.expedition.adventure.stage, 1);
  let farm = P.changeProgression(P.changeProgression(p, "stage", 0), "mode", "farm");
  for (let i = 0; i < 5; i++) farm = kill(farm);
  assert.equal(farm.expedition.adventure.stage, 0); assert.equal(farm.expedition.adventure.unlocked, 1);
  for (const invalid of [-1, "1", 2, 1.5, Infinity]) assert.throws(() => P.changeProgression(p, "stage", invalid));
});

test("pity gives an unowned item at 80, survives reload and never resets on mode or day changes", () => {
  let p = P.changeProgression(fresh(), "start"); p.expedition.adventure.pity = PITY_LIMIT - 1;
  const seed = p.expedition.adventure.seed;
  p = P.changeProgression(P.validateProgression(JSON.parse(JSON.stringify(p))), "stage", 0);
  assert.equal(p.expedition.adventure.seed, seed); assert.equal(p.expedition.adventure.pity, 79);
  for (let i = 0; i < DROP_ITEMS.length; i++) {
    p.expedition.adventure.pity = 79;
    p = kill(p);
    assert.equal(p.expedition.adventure.pity, 0);
    assert.equal(DROP_ITEMS.filter(item => p.expedition.unlocked.includes(item.id)).length, i + 1);
  }
  p.expedition.adventure.pity = 79; p = kill(p);
  assert.equal(p.expedition.adventure.lastReward.itemId, null); assert.ok(p.expedition.adventure.lastReward.gold >= 21);
});

test("first clear and fixed-price purchase are idempotent and never equip items", () => {
  let p = P.changeProgression(fresh(), "start");
  Object.assign(p.expedition.adventure, { stage: 7, unlocked: 7, xp: P.MAX_XP }); p.expedition.adventure.counts[7] = 4;
  p = kill(p); assert.ok(p.expedition.unlocked.includes("meadow_badge"));
  p.wallet.gold = 1200;
  const id = DROP_ITEMS.find(i => !p.expedition.unlocked.includes(i.id)).id;
  p = P.changeProgression(p, "buy", id); assert.equal(p.wallet.gold, 600);
  assert.deepEqual(P.changeProgression(p, "buy", id), p);
  assert.throws(() => P.changeProgression(p, "buy", "meadow_badge"));
  assert.throws(() => P.changeProgression(fresh(), "buy", id));
  assert.equal("character" in p, false);
});

test("unlimited active time, pause and discarded stalled heartbeat grant no offline reward", () => {
  const p = P.changeProgression(fresh(), "start");
  const later = advance(p, 4 * 3600000);
  assert.ok(later.expedition.adventure.victories > 100); assert.equal(later.expedition.running, true);
  for (const ms of [10001, 86400000, -1, NaN, Infinity]) assert.deepEqual(P.advanceProgression(later, ms, AT), later);
  const paused = P.changeProgression(later, "pause"); assert.deepEqual(advance(paused, 3600000), paused);
  assert.equal(paused.expedition.runIntent, false);
  assert.equal(P.publicProgression(later).dailyLimitMs, null); assert.equal("seed" in P.publicProgression(later).adventure, false);
});

test("unfinished legacy encounter finishes once under old rules and does not grant new gold", () => {
  const old = normalizeExpedition({ adventure: { ...newAdventure(), elapsedMs: 179999 } });
  let p = P.changeProgression(P.createProgression({ gold: 17 }, old, 42, AT), "start");
  assert.throws(() => P.changeProgression(p, "stage", 0));
  p = P.advanceProgression(p, 1, AT);
  assert.equal(p.expedition.adventure.legacyBattle, null); assert.equal(p.wallet.gold, 17);
  assert.equal(p.expedition.adventure.victories, 1); assert.equal(p.expedition.adventure.unlocked, 1);
  assert.equal(p.expedition.adventure.xp, P.migrateXp(21));
});

test("migration and failed reward save preserve old records, retry once, reject corruption and future schema", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-progression-test-"));
  try {
    const store = new AppStore(dir);
    store.saveWallet({ gold: 41, runtimeSecondsRemainder: 25 }); store.saveExpedition(normalizeExpedition({}));
    const bytes = fs.readFileSync(store.walletPath);
    fs.mkdirSync(`${store.progressionPath}.tmp`); assert.throws(() => store.loadProgression(42));
    assert.equal(fs.existsSync(store.progressionPath), false); fs.rmdirSync(`${store.progressionPath}.tmp`);
    const initial = store.loadProgression(42); assert.equal(initial.wallet.gold, 42);
    assert.deepEqual(store.loadProgression(99), initial); assert.deepEqual(fs.readFileSync(store.walletPath), bytes);
    assert.deepEqual(fs.readFileSync(path.join(dir, "backups/progression-v1/wallet.json")), bytes);
    const earned = kill(P.changeProgression(initial, "start"));
    fs.mkdirSync(`${store.progressionPath}.tmp`); assert.throws(() => store.saveProgression(earned));
    assert.deepEqual(store.loadProgression(1), initial); fs.rmdirSync(`${store.progressionPath}.tmp`);
    store.saveProgression(earned); store.saveProgression(earned); assert.deepEqual(store.loadProgression(1), earned);
    for (const invalid of ["{broken", JSON.stringify({ ...earned, schemaVersion: 99 }), "null"]) {
      fs.writeFileSync(store.progressionPath, invalid);
      assert.throws(() => store.loadProgression(1)); assert.throws(() => store.saveProgression(initial));
      assert.equal(fs.readFileSync(store.progressionPath, "utf8"), invalid);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("new collection is localized, in bounds and protects face and chin in every hair/hat combination", () => {
  assert.equal(LOOT_ITEMS.length, 6);
  for (const language of ["ko", "en", "zh-CN"]) {
    assert.deepEqual(Object.keys(lootMessages(language)).sort(), Object.keys(lootMessages("en")).sort());
    for (const item of LOOT_ITEMS) assert.ok(lootMessages(language)[`item.${item.id}`]);
  }
  for (const hair of ITEMS.filter(i => i.slot === "hair")) for (const head of [null, ...ITEMS.filter(i => i.slot === "head").map(i => i.id)]) for (let frame = 0; frame < 4; frame++) {
    let hero = defaultCharacter();
    for (const id of [hair.id, "moon_coat", "leaf_cape", "firefly_lantern", "meadow_badge", head].filter(Boolean)) hero = equipItem(hero, id);
    const layers = renderCharacterLayers(hero, frame), bob = IDLE_POSES[frame].bob;
    for (const grid of Object.values(layers)) assert.equal(grid.clippedPixels.length, 0);
    for (let y = 6 + bob; y <= 11 + bob; y++) for (let x = 7; x <= 16; x++) {
      for (const name of ["tool", "back", "face"]) assert.equal(layers[name][y * 24 + x][3], 0, `${name} covered face`);
    }
    assert.equal(layers.grip[(16 + bob) * 24 + 18][3], 255);
  }
});
