const fs = require("fs"), path = require("path");
const P = require("../src/shared/progression");
const { DROP_ITEMS } = require("../src/shared/loot");
const AT = "2026-11-17T00:00:00.000Z";
const HOUR = 3600000;
function simulate(seed, hours, farm) {
  let p = P.changeProgression(P.createProgression({ gold: 0 }, null, seed, AT), "start");
  if (farm) p = P.changeProgression(p, "mode", "farm");
  const milestones = {}, hourly = [], rareMinutes = [];
  for (let ms = 10000; ms <= hours * HOUR; ms += 10000) {
    const previousSequence = p.expedition.adventure.sequence;
    p = P.advanceProgression(p, 10000, AT);
    const a = p.expedition.adventure, level = P.statsForXp(a.xp).level;
    for (const n of [2, 5, 10, 20, 50]) if (level >= n && !milestones[`level${n}Minutes`]) milestones[`level${n}Minutes`] = ms / 60000;
    if (a.cleared[7] && !milestones.firstClearMinutes) milestones.firstClearMinutes = ms / 60000;
    if (p.wallet.gold >= 600 && !milestones.firstPurchaseMinutes) milestones.firstPurchaseMinutes = ms / 60000;
    if (a.sequence !== previousSequence && a.lastReward?.itemId) rareMinutes.push(ms / 60000);
    if (DROP_ITEMS.every(i => p.expedition.unlocked.includes(i.id)) && !milestones.collectionMinutes) milestones.collectionMinutes = ms / 60000;
    if (ms % HOUR === 0) hourly.push({ hour: ms / HOUR, gold: p.wallet.gold, level, kills: a.victories, defeats: a.defeats, stage: a.stage + 1 });
  }
  return { seed, farm, milestones, rareMinutes, hourly };
}
const runs = Array.from({ length: 100 }, (_, i) => simulate((0x9e3779b9 ^ (i + 1) * 65537) >>> 0, 8, false));
const percentile = (values, fraction) => values.sort((a,b) => a-b)[Math.ceil(values.length * fraction) - 1];
const firstDrops = runs.map(r => r.rareMinutes[0]).filter(Number.isFinite);
const summary = {
  rulesVersion: P.RULES_VERSION, sampleCount: runs.length, simulation: "Actual pure runtime engine, 10-second ticks, no sleep/quit/user purchases. Deterministic seeds; not user retention evidence.",
  firstRareMinutes: { mean: firstDrops.reduce((a,b) => a+b,0) / firstDrops.length, p50: percentile([...firstDrops], .5), p90: percentile([...firstDrops], .9) },
  milestones: runs[0].milestones,
  hourly: runs[0].hourly,
  lowStageFarm: simulate(42, 8, true),
  longRun: simulate(42, 200, false),
  runs
};
const output = process.argv[2];
if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, JSON.stringify(summary, null, 2)); }
console.log(JSON.stringify({ ...summary, runs: undefined, longRun: { milestones: summary.longRun.milestones, final: summary.longRun.hourly.at(-1) } }, null, 2));
