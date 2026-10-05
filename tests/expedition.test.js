const test = require("node:test");
const assert = require("node:assert/strict");
const { REWARDS, DAILY_LIMIT_MS, normalizeExpedition, changeExpedition, advanceExpedition } = require("../src/shared/expedition");
const TODAY = "2026-10-05";
const fresh = () => normalizeExpedition(null, TODAY);
const start = (state = fresh()) => changeExpedition(state, "start", null, TODAY);
const tick = (state, ms) => advanceExpedition(state, ms, TODAY);

test("no quest input or wall-clock duration can award time", () => {
  let state = fresh();
  for (let i = 0; i < 100; i++) state = tick(state, 1000);
  assert.equal(state.progress[REWARDS[0].id], 0);
  assert.deepEqual(state.unlocked, []);
});
test("start is idempotent; only a single measured interval is credited", () => {
  let state = start();
  for (let i = 0; i < 100; i++) state = start(state);
  state = tick(state, 1000);
  assert.equal(state.progress[state.targetId], 1000);
});
test("pause freezes progress; restart preserves progress without offline credit", () => {
  let state = tick(start(), 5000);
  state = changeExpedition(state, "pause", null, TODAY);
  state = tick(state, 5000);
  assert.equal(state.progress[state.targetId], 5000);
  state = normalizeExpedition({ ...state, running: true }, TODAY);
  assert.equal(state.running, false);
  assert.equal(state.progress[state.targetId], 5000);
});
test("sleep-sized gaps, negative ticks and nonfinite intervals never accrue", () => {
  for (const ms of [10001, 3600000, -1, Infinity, NaN]) {
    const state = tick(start(), ms);
    assert.equal(state.running, false);
    assert.equal(state.progress[state.targetId], 0);
  }
});
test("completion atomically unlocks once, stops, and does not auto-equip", () => {
  const id = REWARDS[0].id;
  let state = start(normalizeExpedition({ progress: { [id]: 75 * 60000 - 500 } }, TODAY));
  state = tick(state, 1000);
  assert.deepEqual(state.unlocked, [id]);
  assert.equal(state.dailyMs, 500);
  assert.equal(state.running, false);
  for (let i = 0; i < 100; i++) state = tick(start(state), 1000);
  assert.deepEqual(state.unlocked, [id]);
  assert.equal(state.progress[id], 75 * 60000);
  assert.equal("equipped" in state, false);
});
test("switching targets pauses and preserves independent progress", () => {
  let state = tick(start(), 1000);
  state = changeExpedition(state, "select", REWARDS[1].id, TODAY);
  assert.equal(state.running, false);
  state = tick(start(state), 2000);
  assert.equal(state.progress[REWARDS[0].id], 1000);
  assert.equal(state.progress[REWARDS[1].id], 2000);
  assert.throws(() => changeExpedition(state, "select", "unknown", TODAY));
});
test("daily cap is global across rewards and resets only forward", () => {
  let state = start(normalizeExpedition({ day: TODAY, dailyMs: DAILY_LIMIT_MS - 300 }, TODAY));
  state = tick(state, 1000);
  assert.equal(state.dailyMs, DAILY_LIMIT_MS);
  assert.equal(state.progress[state.targetId], 300);
  assert.equal(start(state).running, false);
  state = changeExpedition(state, "select", REWARDS[1].id, TODAY);
  assert.equal(start(state).running, false);
  const tomorrow = changeExpedition(state, "start", null, "2026-10-06");
  assert.equal(tomorrow.dailyMs, 0);
  assert.equal(tomorrow.running, true);
  const rollback = changeExpedition(tomorrow, "start", null, TODAY);
  assert.equal(rollback.running, false);
  assert.equal(rollback.day, "2026-10-06");
});
test("malformed saved state is bounded; local restart never resumes itself", () => {
  const state = normalizeExpedition({ running: true, day: TODAY, dailyMs: -5, unlocked: "expedition_star_hat", progress: { [REWARDS[0].id]: Infinity } }, TODAY);
  assert.equal(state.dailyMs, 0);
  assert.equal(state.running, false);
  assert.deepEqual(state.unlocked, []);
  assert.equal(state.progress[state.targetId], 0);
});
