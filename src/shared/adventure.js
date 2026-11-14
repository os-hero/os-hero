const RULES_VERSION = 1;
const STAGES = Array.from({ length: 8 }, (_, index) => ({
  id: index, hp: index === 7 ? 192 : 48 + index * 16,
  attack: 2 + index, attackMs: 45000, xp: index === 7 ? 60 : 20,
  boss: index === 7
}));
const int = (value, max = 10000000) => Number.isSafeInteger(value) ? Math.max(0, Math.min(max, value)) : 0;

function normalizeAdventure(input) {
  if (!input) return null;
  if (input.rulesVersion !== RULES_VERSION) throw new Error("Unsupported adventure rules; keep the saved checkpoint");
  const unlocked = int(input.unlocked, 7);
  return {
    rulesVersion: RULES_VERSION, stage: Math.min(int(input.stage, 7), unlocked), unlocked,
    elapsedMs: int(input.elapsedMs, 3600000), restMs: int(input.restMs, 30000),
    xp: int(input.xp, 4900), victories: int(input.victories), defeats: int(input.defeats),
    journal: (Array.isArray(input.journal) ? input.journal : []).filter(entry =>
      entry && ["victory", "retreat"].includes(entry.kind) && Number.isFinite(Date.parse(entry.at)) &&
      Number.isInteger(entry.stage) && entry.stage >= 0 && entry.stage < 8
    ).slice(-12).map(entry => ({ kind: entry.kind, at: new Date(entry.at).toISOString(), stage: entry.stage }))
  };
}

function newAdventure() { return normalizeAdventure({ rulesVersion: RULES_VERSION }); }

function heroStats(xp = 0) {
  xp = int(xp, 4900);
  const level = Math.min(50, 1 + Math.floor(int(xp, 4900) / 100));
  return { level, strength: 8 + (level - 1) * 2, dexterity: 6 + level - 1,
    vitality: 10 + (level - 1) * 2, luck: 4 + Math.floor((level - 1) / 3), xp: xp % 100, nextXp: level < 50 ? 100 : 0 };
}

function battleState(adventure) {
  const a = adventure || newAdventure();
  const stats = heroStats(a.xp);
  const enemy = STAGES[a.stage];
  const attackMs = Math.max(5000, Math.round(30000 * 6 / stats.dexterity));
  const incoming = Math.max(1, enemy.attack - Math.floor(stats.vitality / 4));
  const maxHp = stats.vitality * 4;
  const victoryAt = Math.ceil(enemy.hp / stats.strength) * attackMs;
  const defeatAt = Math.ceil(maxHp / incoming) * enemy.attackMs;
  return { stats, enemy, maxHp, hp: a.restMs ? maxHp : Math.max(0, maxHp - Math.floor(a.elapsedMs / enemy.attackMs) * incoming),
    enemyHp: Math.max(0, enemy.hp - Math.floor(a.elapsedMs / attackMs) * stats.strength),
    remainingMs: a.restMs || Math.max(0, Math.min(victoryAt, defeatAt) - a.elapsedMs),
    outcome: victoryAt <= defeatAt ? "victory" : "retreat" };
}

function selectStage(adventure, stage) {
  if (!Number.isInteger(stage) || stage < 0 || stage > adventure.unlocked) throw new Error("Stage is locked");
  return { ...adventure, stage, elapsedMs: 0, restMs: 0 };
}

function advanceAdventure(adventure, milliseconds, at) {
  if (!adventure || !Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 10000) return adventure;
  let next = { ...adventure, journal: [...adventure.journal] };
  let remaining = Math.floor(milliseconds);
  // Resolve time boundaries, not render frames. A completion and its XP share the expedition checkpoint.
  while (remaining > 0) {
    if (next.restMs) {
      const used = Math.min(remaining, next.restMs);
      next.restMs -= used; remaining -= used;
      continue;
    }
    const battle = battleState(next);
    const used = Math.min(remaining, battle.remainingMs);
    next.elapsedMs += used; remaining -= used;
    if (used < battle.remainingMs) break;
    next.journal = [...next.journal, { kind: battle.outcome, stage: next.stage, at }].slice(-12);
    if (battle.outcome === "victory") {
      next.xp = Math.min(4900, next.xp + battle.enemy.xp + Math.floor(battle.stats.luck / 4));
      next.victories += 1;
      next.unlocked = Math.max(next.unlocked, Math.min(7, next.stage + 1));
      next.stage = Math.min(7, next.stage + 1);
    } else {
      next.defeats += 1;
      next.stage = Math.max(0, next.stage - 1);
      next.restMs = 30000;
    }
    next.elapsedMs = 0;
  }
  return next;
}

module.exports = { RULES_VERSION, STAGES, normalizeAdventure, newAdventure, heroStats, battleState, selectStage, advanceAdventure };
