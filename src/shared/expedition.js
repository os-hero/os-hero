const MINUTE = 60 * 1000;
const DAILY_LIMIT_MS = 180 * MINUTE;
const MAX_TICK_MS = 10 * 1000;
const REWARDS = [
  { id: "expedition_star_hat", minutes: 75 },
  { id: "expedition_cloak", minutes: 120 },
  { id: "expedition_sword", minutes: 150 }
];

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function bounded(value, max) {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
}

function normalizeExpedition(input, today = dayKey()) {
  const source = input && typeof input === "object" ? input : {};
  const progress = Object.fromEntries(REWARDS.map(({ id, minutes }) => [id, bounded(source.progress?.[id], minutes * MINUTE)]));
  const savedUnlocks = Array.isArray(source.unlocked) ? source.unlocked : [];
  const unlocked = REWARDS.filter(({ id, minutes }) => savedUnlocks.includes(id) || progress[id] >= minutes * MINUTE).map(({ id }) => id);
  unlocked.forEach((id) => { progress[id] = REWARDS.find((reward) => reward.id === id).minutes * MINUTE; });
  const storedDay = /^\d{4}-\d{2}-\d{2}$/.test(source.day || "") ? source.day : today;
  return {
    schemaVersion: 1,
    targetId: REWARDS.some(({ id }) => id === source.targetId) ? source.targetId : REWARDS[0].id,
    progress,
    unlocked,
    day: storedDay > today ? storedDay : today,
    dailyMs: storedDay >= today ? bounded(source.dailyMs, DAILY_LIMIT_MS) : 0,
    running: false,
    lastUnlockedId: unlocked.includes(source.lastUnlockedId) ? source.lastUnlockedId : null
  };
}

function refreshDay(state, today) {
  if (today < state.day) return { ...state, running: false };
  return today > state.day ? { ...state, day: today, dailyMs: 0 } : state;
}

function changeExpedition(state, action, targetId, today = dayKey()) {
  let next = refreshDay(state, today);
  if (action === "select") {
    if (!REWARDS.some(({ id }) => id === targetId)) throw new Error("Unknown expedition reward");
    return { ...next, targetId, running: false };
  }
  if (action === "pause") return { ...next, running: false };
  if (action !== "start") throw new Error("Unknown expedition action");
  if (today < next.day || next.dailyMs >= DAILY_LIMIT_MS || next.unlocked.includes(next.targetId)) {
    return { ...next, running: false };
  }
  return { ...next, running: true };
}

function advanceExpedition(state, elapsedMs, today = dayKey()) {
  const next = refreshDay(state, today);
  if (!next.running || next.unlocked.includes(next.targetId)) return next;
  // A missed heartbeat is not evidence of companionship time (sleep, stalled process).
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_TICK_MS) return { ...next, running: false };
  const reward = REWARDS.find(({ id }) => id === next.targetId);
  const required = reward.minutes * MINUTE;
  const credited = Math.min(Math.floor(elapsedMs), DAILY_LIMIT_MS - next.dailyMs, required - next.progress[reward.id]);
  const progress = { ...next.progress, [reward.id]: next.progress[reward.id] + credited };
  const complete = progress[reward.id] >= required;
  const dailyMs = next.dailyMs + credited;
  return {
    ...next, progress, dailyMs,
    running: !complete && dailyMs < DAILY_LIMIT_MS,
    unlocked: complete ? [...next.unlocked, reward.id] : next.unlocked,
    lastUnlockedId: complete ? reward.id : next.lastUnlockedId
  };
}

function publicExpedition(state) {
  return { ...state, rewards: REWARDS, dailyLimitMs: DAILY_LIMIT_MS };
}

module.exports = { REWARDS, DAILY_LIMIT_MS, MAX_TICK_MS, dayKey, normalizeExpedition, changeExpedition, advanceExpedition, publicExpedition };
