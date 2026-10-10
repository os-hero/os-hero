const path = require("path");
const { PNG } = require("pngjs");
const { IDLE_POSES, renderTrayCharacterBuffer } = require("../src/main/pixelRenderer");
const { renderReview } = require("./qa-idle-art");

function prepare(mainPath) {
  const { CpuMonitor } = require(path.join(path.dirname(mainPath), "cpu.js"));
  const original = CpuMonitor.prototype.sample;
  let percent = 0;
  CpuMonitor.prototype.sample = function () { this.percent = percent; this.emit("change", percent); };
  return { setCpu(value) { percent = value; }, restore() { CpuMonitor.prototype.sample = original; } };
}

async function run({ panel, BrowserWindow, app, output, check, capture, wait, getTrayImage, qaIdle }) {
  const js = code => panel.webContents.executeJavaScript(code, true);
  const until = async predicate => {
    for (let attempt = 0; attempt < 35; attempt++) { if (await predicate()) return true; await wait(80); }
    return false;
  };
  const initial = await js("window.osHeroApi.getState()");
  const bounds = JSON.stringify(panel.getBounds());
  check("canonical presentation declares grounded idle and a low-CPU four-second cycle", initial.hero.motion.kind === "idle" && initial.hero.motion.cycleMs === 4000);
  await js("window.__idleTicks=[];window.__idleUnsubscribe=window.osHeroApi.onHeroMotion(motion=>window.__idleTicks.push({...motion,at:performance.now()}));true");

  for (const [cpu, cycleMs] of [[20, 3200], [45, 2500], [70, 2000], [95, 1600], [0, 4000]]) {
    qaIdle.setCpu(cpu);
    check(`CPU ${cpu}% drives the existing native clock to ${cycleMs}ms per breath`, await until(async () => (await js("window.osHeroApi.getState()")).hero.motion.cycleMs === cycleMs));
    check(`CPU ${cpu}% reaches all visible Hero locations without separate renderer timers`, await until(() => js(`(() => {const frames=Array.from(document.querySelectorAll('[data-canonical-hero]'));return state.hero.motion.cycleMs===${cycleMs} && frames.length>1 && frames.every(img=>Number(img.dataset.heroFrame)===state.hero.motion.frame && img.src===state.hero.frames[state.hero.motion.frame]);})()`)));
  }

  // State can report the sampled CPU before the previously scheduled native tick fires.
  const settled = await until(() => js("window.__idleTicks.at(-1)?.cycleMs===4000"));
  check("native clock enters the new low-CPU cycle before its timing is measured", settled);
  await js("window.__idleTicks=[];true");
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await js("new Set(window.__idleTicks.map(tick=>tick.frame)).size===4")) break;
    await wait(100);
  }
  const ticks = await js("window.__idleTicks");
  check("native clock holds rest and inhale peak longer than chest transition frames", new Set(ticks.map(tick => tick.frame)).size === 4 && ticks.every(tick => tick.cycleMs === 4000 && tick.intervalMs === Math.round(1000 * IDLE_POSES[tick.frame].duration)));
  check("real frame notifications respect the eased native timing, not a uniform renderer interval", ticks.length >= 4 && ticks.slice(1).every((tick, index) => tick.frame === (ticks[index].frame + 1) % 4 && tick.at - ticks[index].at >= ticks[index].intervalMs - 80 && tick.at - ticks[index].at <= ticks[index].intervalMs + 1200));

  for (const id of initial.items.filter(item => item.slot !== "background").map(item => item.id)) {
    await js(`window.osHeroApi.updateEquipment({action:'equip',itemId:${JSON.stringify(id)}})`);
    const state = await js("window.osHeroApi.getState()");
    check(`${id}: equipment refresh keeps all four canonical Idle poses`, state.hero.frames.length === 4 && new Set(state.hero.frames).size === 4);
    check(`${id}: cached native Retina frame matches the same saved Hero without clipping`, [0, 1, 2, 3].some(frame => PNG.sync.read(renderTrayCharacterBuffer(state.character, frame, { platform: "darwin", scaleFactor: 2 })).data.equals(PNG.sync.read(getTrayImage().toPNG({ scaleFactor: 2 })).data)));
  }
  const saved = await js("window.osHeroApi.getState()");
  check("breathing and material updates change no ownership, quests or gold", saved.wallet.gold === initial.wallet.gold && JSON.stringify(saved.quests) === JSON.stringify(initial.quests) && JSON.stringify(saved.items.map(item => item.id)) === JSON.stringify(initial.items.map(item => item.id)));
  check("equipment and animation never resize the tray popup", JSON.stringify(panel.getBounds()) === bounds);

  await js("navigateTray('inventory');document.querySelector('[data-equipped-slot=head]').click()");
  check("inventory preview and header stay on the same canonical breathing frame", await until(() => js("(() => {const image=document.getElementById('character-preview');return image.dataset.heroKey===state.hero.key && Number(image.dataset.heroFrame)===state.hero.motion.frame && image.src===state.hero.sceneFrames[state.hero.motion.frame] && Array.from(document.querySelectorAll('[data-canonical-hero]')).every(img=>Number(img.dataset.heroFrame)===state.hero.motion.frame);})()")));
  await js("navigateTray('customization');document.getElementById('body-color').value='#FFE6BD';document.getElementById('body-color').dispatchEvent(new Event('input'))");
  const before = await js("JSON.stringify(state.character)");
  qaIdle.setCpu(95);
  await wait(1800);
  check("CPU breathing never saves or replaces an appearance draft", await js(`JSON.stringify(state.character)===${JSON.stringify(before)} && document.getElementById('body-color').value==='#FFE6BD' && document.getElementById('character-preview').dataset.heroKey==='draft'`));
  check("draft uses the same connected head and shoulder pose clock", await until(async () => {
    const snapshot = await js("({draft:customizationDraft,frame:Number(document.getElementById('character-preview').dataset.heroFrame),src:document.getElementById('character-preview').src})");
    return snapshot.src === await js(`window.osHeroApi.renderScene(${JSON.stringify(snapshot.draft)},${snapshot.frame},1)`);
  }));
  check("stale motion payload cannot move a different Hero or overwrite the current draft", await js("(() => {const old=previewFrame;applyHeroMotion({characterKey:'stale',frame:(old+1)%4});return previewFrame===old && document.getElementById('body-color').value==='#FFE6BD';})()"));
  await capture(panel, "idle-draft-desktop.png");

  await js("navigateTray('inventory')");
  await capture(panel, "idle-inventory-desktop.png");
  panel.setSize(320, 600);
  await wait(120);
  check("idle preview retains the fixed 3:2 scene without compact overflow", await js("(() => {const r=document.getElementById('character-preview').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth && Math.abs(r.width/r.height-1.5)<0.01;})()"));
  await capture(panel, "idle-inventory-compact.png");
  app.emit("second-instance");
  await wait(100);
  check("actual tray toggle hides the popup before testing clock suspension", !panel.isVisible());
  const hiddenTicks = await js("window.__idleTicks.length");
  await wait(1100);
  check("hidden renderer receives no per-frame IPC work", await js(`window.__idleTicks.length===${hiddenTicks}`));
  app.emit("second-instance");
  check("reopened popup resynchronizes to the current native breathing phase", await until(() => js("state.hero.motion.frame===companionFrame && Array.from(document.querySelectorAll('[data-canonical-hero]')).every(img=>Number(img.dataset.heroFrame)===companionFrame)")));
  check("reopening preserves the isolated appearance draft", await js("navigateTray('customization');document.getElementById('body-color').value==='#FFE6BD'"));
  await js("window.__idleUnsubscribe()");
  await renderReview({ BrowserWindow, output, capture });
  await require("./qa-pocket-buddy-art").renderReview({ BrowserWindow, output, capture });
}

module.exports = { prepare, run };
