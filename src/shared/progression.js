const legacy = require("./adventure");
const { normalizeExpedition, REWARDS } = require("./expedition");
const { LOOT_VERSION, PITY_LIMIT, LOOT_ITEMS, DROP_ITEMS, RATES, GOLD, XP } = require("./loot");
const SCHEMA_VERSION = 1;
const RULES_VERSION = 2;
const GOLD_MAX = 999999999;
const LEVEL_MAX = 50;
const int = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const levelCost = level => 100 + 25 * (level - 1) + 5 * (level - 1) ** 2;
const thresholds = [0];
for (let level = 1; level < LEVEL_MAX; level++) thresholds.push(thresholds.at(-1) + levelCost(level));
const MAX_XP = thresholds.at(-1);

function statsForXp(xp) {
  const total = Math.min(MAX_XP, Math.max(0, Number.isSafeInteger(xp) ? xp : 0));
  const level = thresholds.findLastIndex(value => total >= value) + 1;
  return { level, strength: 8 + (level - 1) * 2, dexterity: 6 + level - 1,
    vitality: 10 + (level - 1) * 2, luck: 4 + Math.floor((level - 1) / 3),
    xp: total - thresholds[level - 1], nextXp: level < LEVEL_MAX ? levelCost(level) : 0 };
}

function migrateXp(xp) {
  const stats = legacy.heroStats(xp);
  return thresholds[stats.level - 1] + (stats.nextXp ? Math.floor(stats.xp / 100 * levelCost(stats.level)) : 0);
}

function createProgression(wallet, expedition, seed, at = new Date().toISOString()) {
  if (!int(seed, 0xffffffff) || !seed) throw new Error("Invalid random seed");
  if (wallet && (!int(wallet.gold, GOLD_MAX) || !int(wallet.runtimeSecondsRemainder || 0, 299))) throw new Error("Invalid legacy wallet; preserve original");
  if (expedition && (typeof expedition !== "object" || Array.isArray(expedition) || expedition.schemaVersion !== 1)) throw new Error("Unsupported legacy expedition");
  const e = normalizeExpedition(expedition);
  const a = e.adventure || legacy.newAdventure();
  const result = {
    schemaVersion: SCHEMA_VERSION, lootVersion: LOOT_VERSION,
    wallet: { ...wallet, gold: Math.min(GOLD_MAX, (wallet?.gold || 0) + (wallet?.runtimeSecondsRemainder > 0 ? 1 : 0)), runtimeSecondsRemainder: 0, updatedAt: at },
    expedition: { ...e, running: false, runIntent: false, unlocked: [...new Set([...e.unlocked, ...REWARDS.map(r => r.id)])],
      adventure: { rulesVersion: RULES_VERSION, xp: migrateXp(a.xp), stage: a.stage, unlocked: a.unlocked,
        elapsedMs: 0, restMs: 0, victories: a.victories, defeats: a.defeats, journal: a.journal,
        counts: Array(8).fill(0), cleared: Array.from({ length: 8 }, (_, i) => i < a.unlocked),
        mode: "advance", pity: 0, seed, sequence: 0, lastReward: null,
        legacyBattle: a.elapsedMs || a.restMs ? a : null } },
    migration: { at, legacyXp: a.xp, legacyLevel: legacy.heroStats(a.xp).level, legacyWalletRemainder: wallet?.runtimeSecondsRemainder || 0 }
  };
  return validateProgression(result);
}

function validateProgression(p) {
  const e = p?.expedition, a = e?.adventure;
  if (p?.schemaVersion !== SCHEMA_VERSION || p.lootVersion !== LOOT_VERSION || !int(p.wallet?.gold, GOLD_MAX) ||
      a?.rulesVersion !== RULES_VERSION || !int(a.xp, MAX_XP) || !int(a.stage, 7) || !int(a.unlocked, 7) || a.stage > a.unlocked ||
      !int(a.elapsedMs, 3600000) || !int(a.restMs, 30000) || !int(a.pity, PITY_LIMIT - 1) ||
      !int(a.seed, 0xffffffff) || !a.seed || !int(a.sequence) || !int(a.victories) || !int(a.defeats) ||
      !["advance", "farm"].includes(a.mode) || !Array.isArray(a.counts) || a.counts.length !== 8 || a.counts.some(n => !int(n, 4)) ||
      !Array.isArray(a.cleared) || a.cleared.length !== 8 || a.cleared.some(n => typeof n !== "boolean") ||
      !Array.isArray(a.journal) || a.journal.length > 12 || a.journal.some(entry => !entry || !["victory", "retreat"].includes(entry.kind) || !int(entry.stage, 7) || !Number.isFinite(Date.parse(entry.at))) ||
      !Array.isArray(e.unlocked) || e.unlocked.some(id => typeof id !== "string") ||
      typeof e.runIntent !== "boolean" || typeof e.running !== "boolean") throw new Error("Invalid or unsupported progression; saved records were not modified");
  if (a.legacyBattle) legacy.normalizeAdventure(a.legacyBattle);
  return p;
}

function battleState(a) {
  if (a.legacyBattle) return { ...legacy.battleState(a.legacyBattle), legacy: true, kind: "normal" };
  const stats = statsForXp(a.xp);
  const kind = a.counts[a.stage] < 4 ? "normal" : [3, 7].includes(a.stage) ? "boss" : "elite";
  const hp = (48 + a.stage * 12) * (kind === "boss" ? 4 : kind === "elite" ? 2 : 1);
  const enemy = { hp, attack: 2 + a.stage, attackMs: 12000, boss: kind === "boss", kind };
  const attackMs = Math.max(2500, Math.round(5000 * 6 / stats.dexterity));
  // A lower-bound encounter length prevents high-level low-stage farming from dominating rewards.
  const victoryAt = Math.max(kind === "boss" ? 80000 : kind === "elite" ? 40000 : 20000, Math.ceil(hp / stats.strength) * attackMs);
  const damage = Math.max(1, enemy.attack - Math.floor(stats.vitality / 3));
  const maxHp = stats.vitality * 4;
  const defeatAt = Math.ceil(maxHp / damage) * enemy.attackMs;
  const hitCount = Math.ceil(hp / stats.strength);
  const effectiveInterval = victoryAt / hitCount;
  return { stats, enemy, kind, maxHp,
    hp: a.restMs ? maxHp : Math.max(0, maxHp - Math.floor(a.elapsedMs / enemy.attackMs) * damage),
    enemyHp: Math.max(0, hp - Math.floor(a.elapsedMs / effectiveInterval) * stats.strength),
    remainingMs: a.restMs || Math.max(0, Math.min(victoryAt, defeatAt) - a.elapsedMs), outcome: victoryAt <= defeatAt ? "victory" : "retreat" };
}

function random(a) {
  let x = a.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  a.seed = x >>> 0;
  return a.seed / 0x100000000;
}

function award(p, battle, at) {
  const e = p.expedition, a = e.adventure, stage = a.stage;
  const roll = random(a);
  let gold = GOLD[battle.kind].find(([, edge]) => roll < edge)[0] + Math.floor(stage / 3);
  const xp = XP[battle.kind] + stage * 2 + Math.floor(battle.stats.luck / 4);
  const rare = random(a) < RATES[battle.kind] || a.pity === PITY_LIMIT - 1;
  const selection = random(a);
  let itemId = null, firstClearId = null;
  if (rare) {
    const pool = DROP_ITEMS.filter(item => !e.unlocked.includes(item.id));
    if (pool.length) { itemId = pool[Math.floor(selection * pool.length)].id; e.unlocked.push(itemId); }
    else gold += 20;
    a.pity = 0;
  } else a.pity += 1;
  a.xp = Math.min(MAX_XP, a.xp + xp);
  a.victories += 1; a.sequence += 1;
  if (a.counts[stage] === 4) {
    a.counts[stage] = 0; a.cleared[stage] = true;
    a.unlocked = Math.max(a.unlocked, Math.min(7, stage + 1));
    if (stage === 7 && !e.unlocked.includes("meadow_badge")) { firstClearId = "meadow_badge"; e.unlocked.push(firstClearId); }
    if (a.mode === "advance") a.stage = Math.min(7, stage + 1);
  } else a.counts[stage] += 1;
  p.wallet = { ...p.wallet, gold: Math.min(GOLD_MAX, p.wallet.gold + gold), updatedAt: at };
  a.lastReward = { sequence: a.sequence, stage, kind: battle.kind, gold, xp, itemId, firstClearId, at, level: statsForXp(a.xp).level };
  a.journal = [...a.journal, { kind: "victory", stage, at, gold, xp, itemId, firstClearId }].slice(-12);
}

function advanceProgression(p, ms, at = new Date().toISOString()) {
  if (!p.expedition.running || !Number.isFinite(ms) || ms <= 0 || ms > 10000) return p;
  const next = structuredClone(p), e = next.expedition, a = e.adventure;
  let left = Math.floor(ms);
  while (left > 0) {
    if (a.legacyBattle) {
      const old = a.legacyBattle, duration = legacy.battleState(old).remainingMs;
      const used = Math.min(left, duration || 1);
      a.legacyBattle = legacy.advanceAdventure(old, used, at); left -= used;
      if (a.legacyBattle.victories !== old.victories || a.legacyBattle.defeats !== old.defeats) {
        const done = a.legacyBattle;
        a.xp = migrateXp(done.xp); a.victories = done.victories; a.defeats = done.defeats; a.journal = done.journal;
        a.stage = done.stage; a.unlocked = done.unlocked; a.restMs = done.restMs; a.legacyBattle = null;
      }
      continue;
    }
    if (a.restMs) { const used = Math.min(left, a.restMs); a.restMs -= used; left -= used; continue; }
    const b = battleState(a), used = Math.min(left, b.remainingMs);
    a.elapsedMs += used; left -= used;
    if (used < b.remainingMs) break;
    if (b.outcome === "victory") award(next, b, at);
    else {
      a.defeats += 1;
      a.journal = [...a.journal, { kind: "retreat", stage: a.stage, at }].slice(-12);
      a.stage = Math.max(0, a.stage - 1); a.restMs = 30000;
    }
    a.elapsedMs = 0;
  }
  return next;
}

function changeProgression(p, action, value) {
  const next = structuredClone(p), e = next.expedition, a = e.adventure;
  if (action === "start" || action === "pause") e.running = e.runIntent = action === "start";
  else if (action === "mode") {
    if (!["advance", "farm"].includes(value)) throw new Error("Invalid exploration mode");
    a.mode = value;
  } else if (action === "stage") {
    if (!int(value, a.unlocked)) throw new Error("Stage is locked");
    if (a.legacyBattle) throw new Error("Finish the saved encounter first");
    a.stage = value; a.elapsedMs = 0; a.restMs = 0;
  } else if (action === "buy") {
    const item = DROP_ITEMS.find(item => item.id === value);
    if (!item || !a.cleared[7]) throw new Error("Complete the meadow first");
    if (e.unlocked.includes(item.id)) return p;
    if (next.wallet.gold < item.price) throw new Error("Not enough gold");
    next.wallet.gold -= item.price;
    e.unlocked.push(item.id);
  } else throw new Error("Invalid progression action");
  return next;
}

function publicProgression(p) {
  const e = p.expedition, { seed, ...a } = e.adventure;
  const b = battleState(e.adventure);
  return { ...e, adventure: a, battle: b, dailyLimitMs: null, clockBlocked: false,
    rewards: LOOT_ITEMS, pityLimit: PITY_LIMIT, rates: RATES, lootVersion: LOOT_VERSION,
    remainingPool: DROP_ITEMS.filter(item => !e.unlocked.includes(item.id)).length,
    rareRate: a.pity === PITY_LIMIT - 1 ? 1 : RATES[b.kind] };
}

module.exports = { SCHEMA_VERSION, RULES_VERSION, GOLD_MAX, MAX_XP, levelCost, thresholds, statsForXp, migrateXp,
  createProgression, validateProgression, battleState, advanceProgression, changeProgression, publicProgression };
