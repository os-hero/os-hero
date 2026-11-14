const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { heroName, normalizeIdentity, heroRegistrationMode } = require("../src/shared/heroIdentity");
const { newAdventure, normalizeAdventure, heroStats, battleState, selectStage, advanceAdventure } = require("../src/shared/adventure");
const { normalizeExpedition, changeExpedition, advanceExpedition, DAILY_LIMIT_MS } = require("../src/shared/expedition");
const { defaultCharacter, normalizeCharacter, equipItem } = require("../src/shared/catalog");
const { renderCharacterDataUrl } = require("../src/main/pixelRenderer");
const { AppStore } = require("../src/main/store");
const AT = "2026-11-14T00:00:00.000Z", DAY = "2026-11-14";
const identity = { id: "12345678-1234-1234-1234-123456789abc", name: "모모", registeredAt: AT };
const tick = (a, ms) => advanceAdventure(a, ms, AT);
function advance(a, ms, step = 1000) { for (let left = ms; left > 0; left -= step) a = tick(a, Math.min(left, step)); return a; }

test("registration names normalize Korean and enforce graphemes and plain text", () => {
  assert.equal(heroName("  모모  "), "모모");
  for (const name of ["모모", "Chungbok Lee", "李忠馥", "가".repeat(12)]) assert.equal(heroName(name), name);
  for (const name of ["", " ", "가".repeat(13), "<script>", "a\nb", "hero\u200b", null]) assert.throws(() => heroName(name));
  assert.deepEqual(normalizeIdentity(identity), identity);
  assert.throws(() => normalizeIdentity({ ...identity, id: "bad" }));
  assert.throws(() => normalizeIdentity({ ...identity, registeredAt: "bad" }));
});
test("registration metadata never changes canonical pixels or independent slots", () => {
  const before = equipItem(equipItem(defaultCharacter(), "princess_hair"), "silver_circlet");
  const after = normalizeCharacter({ ...before, identity });
  assert.equal(after.schemaVersion, 3);
  assert.deepEqual(after.equipped, before.equipped);
  for (let f = 0; f < 4; f++) assert.equal(renderCharacterDataUrl(after, f, 1), renderCharacterDataUrl(before, f, 1));
  assert.deepEqual(equipItem(after, "teal_backpack").identity, identity);
  assert.deepEqual(normalizeCharacter(after), after);
});
test("legacy, new onboarding and registered Heroes retain unambiguous registration modes", () => {
  const legacy = equipItem(defaultCharacter("1.6.4"), "long_hair");
  assert.equal(heroRegistrationMode(legacy), "existing");
  assert.equal(heroRegistrationMode(normalizeCharacter({ ...legacy, registrationMode: "unknown" })), "existing");
  const fresh = normalizeCharacter({ ...legacy, registrationMode: "create" });
  assert.equal(heroRegistrationMode(equipItem(fresh, "teal_backpack")), "create");
  assert.equal(heroRegistrationMode(normalizeCharacter(JSON.parse(JSON.stringify(fresh)))), "create");
  const registered = normalizeCharacter({ ...fresh, identity });
  assert.equal(heroRegistrationMode(registered), "registered");
  assert.equal(Object.hasOwn(registered, "registrationMode"), false);
  assert.deepEqual(normalizeCharacter(registered).identity, identity);
});
test("unsupported or malformed saved Hero records fail without overwriting bytes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-registration-unit-"));
  try {
    const store = new AppStore(dir);
    assert.equal(store.loadCharacter(), null);
    for (const input of [null, [], "legacy", 12, { schemaVersion: 99 }]) {
      const bytes = JSON.stringify(input);
      fs.writeFileSync(store.characterPath, bytes);
      assert.throws(() => store.loadCharacter());
      assert.throws(() => store.saveCharacter(defaultCharacter()));
      assert.equal(fs.readFileSync(store.characterPath, "utf8"), bytes);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("first registration backs up once; failed atomic write cannot change identity", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-registration-unit-"));
  try {
    const store = new AppStore(dir), before = defaultCharacter();
    store.saveCharacter(before);
    const bytes = fs.readFileSync(store.characterPath);
    fs.mkdirSync(`${store.characterPath}.tmp`);
    assert.throws(() => store.saveCharacter(normalizeCharacter({ ...before, identity })));
    assert.deepEqual(fs.readFileSync(store.characterPath), bytes);
    fs.rmdirSync(`${store.characterPath}.tmp`);
    store.saveCharacter(normalizeCharacter({ ...before, identity }));
    store.saveCharacter(equipItem(store.loadCharacter(), "princess_hair"));
    assert.deepEqual(fs.readFileSync(path.join(dir, "backups/hero-registration/character.json")), bytes);
    assert.deepEqual(store.loadCharacter().identity, identity);
    fs.writeFileSync(store.characterPath, "{broken");
    assert.throws(() => store.loadCharacter());
    assert.throws(() => store.saveCharacter(before));
    assert.equal(fs.readFileSync(store.characterPath, "utf8"), "{broken");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("combat resolves exact boundaries once with checkpointed XP and unlock", () => {
  const a = newAdventure(), duration = battleState(a).remainingMs;
  const before = advance(a, duration - 1);
  assert.equal(before.victories, 0);
  const after = tick(before, 1);
  assert.equal(after.victories, 1); assert.equal(after.xp, 21); assert.equal(after.stage, 1); assert.equal(after.unlocked, 1);
  assert.equal(after.journal.length, 1);
  assert.equal(tick(after, 1).victories, 1);
  assert.deepEqual(normalizeAdventure(after), after);
});
test("combat is independent of render cadence and tick partition", () => {
  assert.deepEqual(advance(newAdventure(), 3600000, 1000), advance(newAdventure(), 3600000, 10000));
  assert.equal(newAdventure().xp, 0);
  for (const ms of [0, -1, 10001, NaN, Infinity]) assert.deepEqual(tick(newAdventure(), ms), newAdventure());
});
test("defeat retreats and rests without removing items, gold or XP", () => {
  const a = { ...newAdventure(), stage: 7, unlocked: 7 };
  const b = battleState(a); assert.equal(b.outcome, "retreat");
  const after = advance(a, b.remainingMs);
  assert.equal(after.defeats, 1); assert.equal(after.stage, 6); assert.equal(after.restMs, 30000); assert.equal(after.xp, 0);
  assert.equal(advance(after, 30000).restMs, 0);
  assert.equal(advance(after, 30000).elapsedMs, 0);
  assert.equal("wallet" in after, false); assert.equal("equipped" in after, false);
});
test("stage selection accepts only unlocked integer stages; stats are bounded", () => {
  for (const s of [-1, 0.5, 1, "0", Infinity]) assert.throws(() => selectStage(newAdventure(), s));
  assert.equal(selectStage({ ...newAdventure(), elapsedMs: 9000 }, 0).elapsedMs, 0);
  assert.equal(heroStats(-1).level, 1); assert.equal(heroStats(4900).level, 50); assert.equal(heroStats(4900).nextXp, 0);
  assert.equal(heroStats(NaN).xp, 0);
  assert.throws(() => normalizeAdventure({ rulesVersion: 999 }));
});
test("RPG continues after cosmetic completion without duplicate rewards", () => {
  let e = normalizeExpedition({ adventure: newAdventure(), progress: { expedition_star_hat: 75 * 60000 - 1 } }, DAY);
  e = changeExpedition(e, "start", null, DAY);
  e = advanceExpedition(e, 1000, DAY, AT);
  assert.equal(e.running, true); assert.equal(e.adventure.elapsedMs, 1000);
  for (let i = 0; i < 180; i++) e = advanceExpedition(e, 1000, DAY, AT);
  assert.deepEqual(e.unlocked, ["expedition_star_hat"]); assert.equal(e.adventure.victories, 1);
  assert.equal(e.progress.expedition_star_hat, 75 * 60000);
});
test("RPG shares global daily cap, pauses after restart/sleep and preserves history", () => {
  let e = normalizeExpedition({ adventure: newAdventure(), dailyMs: DAILY_LIMIT_MS - 50, day: DAY }, DAY);
  e = advanceExpedition(changeExpedition(e, "start", null, DAY), 1000, DAY, AT);
  assert.equal(e.dailyMs, DAILY_LIMIT_MS); assert.equal(e.adventure.elapsedMs, 50); assert.equal(e.running, false);
  const next = changeExpedition(e, "start", null, "2026-11-15");
  assert.equal(next.dailyMs, 0); assert.equal(next.adventure.elapsedMs, 50);
  assert.equal(advanceExpedition(next, 10001, "2026-11-15", AT).running, false);
  assert.equal(normalizeExpedition(next, "2026-11-15").running, false);
  assert.deepEqual(normalizeExpedition(next, "2026-11-15").adventure, next.adventure);
});
test("long simulation stays bounded and journals keep the latest twelve events", () => {
  const a = advance(newAdventure(), 86400000, 10000);
  assert.equal(a.journal.length, 12); assert.ok(a.xp <= 4900); assert.ok(a.stage <= a.unlocked && a.unlocked <= 7);
  assert.deepEqual(normalizeAdventure(a), a);
});
