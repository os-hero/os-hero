const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const timers = new Map(), images = [], events = [];
  let created = 0, id = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/main/trayAnimator.js"), "utf8"), {
    module, require(name) {
      assert.equal(name, "./trayImage");
      return { createTrayImage(character, frame) { created++; return `${character.id}/${frame}`; } };
    },
    setTimeout(fn, ms) { const timer = { id: ++id, fn, ms, unref() { this.unrefed = true; } }; timers.set(timer.id, timer); return timer; },
    clearTimeout(timer) { timers.delete(timer.id); }
  });
  const cpu = { percent: 0 }, tray = { setImage(image) { images.push(image); }, isDestroyed() { return false; } };
  const animator = new module.exports.TrayAnimator(tray, cpu, { onFrame(motion) { events.push({ ...motion }); } });
  const advance = () => { assert.equal(timers.size, 1); const timer = [...timers.values()][0]; timers.delete(timer.id); timer.fn(); };
  return { ...module.exports, animator, cpu, tray, images, events, timers, advance, created: () => created };
}

test("CPU breathing is monotonic, bounded and uses one complete 4-1.6 second cycle", () => {
  const { intervalForCpu } = fixture();
  for (const [cpu, expected] of [[0, 1000], [9.99, 1000], [10, 800], [29.99, 800], [30, 625], [59.99, 625], [60, 500], [84.99, 500], [85, 400], [100, 400]]) assert.equal(intervalForCpu(cpu), expected);
  let previous = Infinity;
  for (let cpu = 0; cpu <= 100; cpu++) {
    const ms = intervalForCpu(cpu); assert.ok(ms <= previous && ms >= 400 && ms <= 1000); previous = ms;
  }
  for (const cpu of [NaN, Infinity, -Infinity, undefined, "85", -100]) assert.equal(intervalForCpu(cpu), 1000);
  assert.equal(intervalForCpu(1000), 400);
});

test("main clock caches art, follows live CPU and preserves phase during equipment changes", () => {
  const f = fixture();
  f.animator.updateCharacter({ id: "old" }); f.animator.start(); f.animator.start();
  assert.equal(f.timers.size, 1); assert.equal(f.created(), 4);
  f.advance();
  assert.equal(f.images.at(-1), "old/1");
  f.animator.updateCharacter({ id: "new" });
  assert.equal(f.images.at(-1), "new/1"); assert.equal(f.timers.size, 1); assert.equal(f.created(), 8);
  f.cpu.percent = 90; f.advance();
  assert.equal(f.images.at(-1), "new/2"); assert.equal([...f.timers.values()][0].ms, 400);
  for (let count = 0; count < 30; count++) f.advance();
  assert.equal(f.created(), 8);
  assert.ok(f.events.every(event => event.kind === "idle" && event.cycleMs === event.intervalMs * 4));
  assert.ok([...f.timers.values()].every(timer => timer.unrefed));
  f.animator.stop(); assert.equal(f.timers.size, 0);
});

test("starting without art re-arms once; stop and destroyed trays cannot leave active timers", () => {
  const f = fixture();
  f.animator.start(); assert.equal(f.timers.size, 0);
  f.animator.updateCharacter({ id: "hero" }); assert.equal(f.timers.size, 1);
  const stale = [...f.timers.values()][0]; f.animator.stop(); stale.fn(); assert.equal(f.timers.size, 0);
  f.animator.start(); assert.equal(f.timers.size, 1);
  f.tray.isDestroyed = () => true; f.advance(); assert.equal(f.timers.size, 0);
  const painted = f.images.length; f.animator.updateCharacter({ id: "other" }); assert.equal(f.images.length, painted); assert.equal(f.timers.size, 0);
});
