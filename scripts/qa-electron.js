const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");
const childProcess = require("child_process");
const { PassThrough } = require("stream");
const spawnProcess = childProcess.spawn;
childProcess.spawn = function (command, ...args) {
  const child = spawnProcess.call(this, command, ...args);
  if (path.basename(command) === "oshero-outside-click") {
    // Keep the real helper lifecycle, but isolate automation from the user's mouse.
    child.stdout.resume();
    const isolatedMouse = new PassThrough();
    Object.defineProperty(child, "stdout", { value: isolatedMouse });
    child.on("close", () => isolatedMouse.end());
  }
  return child;
};
const { app, BrowserWindow, powerMonitor, Tray } = require("electron");
let qaTray = null;
const trayOn = Tray.prototype.on;
Tray.prototype.on = function (...args) { qaTray = this; return trayOn.apply(this, args); };
const { defaultCharacter } = require("../src/shared/catalog");
const { normalizeExpedition, dayKey } = require("../src/shared/expedition");
const scenario = process.argv.includes("--updates") ? "updates" : process.argv.includes("--tray-shell") ? "tray-shell" : process.argv.includes("--inventory-layout") ? "inventory-layout" : process.argv.includes("--wardrobe") ? "wardrobe" : process.argv.includes("--restart") ? "restart" : process.argv.includes("--completion") ? "completion" : "flow";
const profile = process.env.OS_HERO_QA_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), "oshero-qa-"));
const output = path.resolve(__dirname, "../review-artifacts/2026-10-06");
fs.mkdirSync(output, { recursive: true });
process.env.OS_HERO_USER_DATA_DIR = profile;
const write = (name, data) => fs.writeFileSync(path.join(profile, name), JSON.stringify(data));
const base = defaultCharacter("1.2.0");
write("character.json", base);
if (scenario === "wardrobe") write("character.json", { hasCharacter: true, gender: "male", bodyColor: "#F1C27D", eyeType: "default", equipped: { head: "long_hair", clothes: "default_clothes", tool: "small_bag" }, version: "1.2.0" });
write("settings.json", { language: "ko", launchAtLogin: false });
write("wallet.json", { gold: 17 });
const now = new Date().toISOString();
write("quests.json", { quests: [
  { id: "qa-proposal", type: "adventure", title: "제안서 초안 정리", status: "in_progress", createdAt: now, updatedAt: now },
  { id: "qa-notes", type: "adventure", title: "회의 메모 정리", status: "done", createdAt: now, updatedAt: now }
] });
const initialExpedition = normalizeExpedition({ day: dayKey(), progress: { expedition_star_hat: scenario === "completion" ? 75 * 60000 - 500 : 50 * 60000 } });
write("expedition.json", initialExpedition);
if (scenario === "restart") {
  const saved = JSON.parse(fs.readFileSync(path.join(output, "restart-fixture.json")));
  for (const [file, data] of Object.entries(saved)) write(file, data);
}
const errors = [];
const checks = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (_event, level, message) => { if (level >= 3) errors.push(message); });
  contents.on("render-process-gone", (_event, details) => errors.push(`renderer gone: ${details.reason}`));
});
const qaUpdates = scenario === "updates" ? require("./qa-updates").prepare(process.env.OS_HERO_QA_APP || path.resolve(__dirname, "../src/main/main.js")) : null;
require(process.env.OS_HERO_QA_APP || "../src/main/main");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (name, value) => { assert.ok(value, name); checks.push(name); };
async function capture(window, name) {
  window.show();
  window.focus();
  await window.webContents.executeJavaScript("Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {}))).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
  await wait(100);
  await fs.promises.writeFile(path.join(output, name), (await window.webContents.capturePage()).toPNG());
}

app.whenReady().then(async () => {
  try {
    await wait(600);
    app.emit("second-instance");
    await wait(800);
    let panel = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("view=tray"));
    check("actual lazy-created tray panel opens", panel);
    const js = (code) => panel.webContents.executeJavaScript(code, true);
    let state = await js("window.osHeroApi.getState()");
    check("existing gold preserved", state.wallet.gold === 17);
    if (scenario !== "restart") check("legacy items retained; new rewards not owned", state.items.length > 30 && !state.items.some(({ id }) => id === "expedition_star_hat"));
    check("canonical icons match hero at same frame", await js("JSON.stringify(Array.from(document.querySelectorAll('[data-canonical-hero]')).map(img=>img.src).every(src=>src===document.querySelector('[data-canonical-hero]').src))") === "true");
    await capture(panel, `${scenario}-desktop.png`);

    if (scenario === "updates") {
      await require("./qa-updates").run({ panel, app, profile, output, check, capture, wait, qaUpdates });
    } else if (scenario === "tray-shell") {
      await require("./qa-tray-shell")({ panel, BrowserWindow, app, tray: qaTray, profile, output, check, capture, wait });
    } else if (scenario === "inventory-layout") {
      await require("./qa-inventory-layout")({ panel, BrowserWindow, output, check, capture, wait });
    } else if (scenario === "wardrobe") {
      await require("./qa-wardrobe")({ panel, BrowserWindow, profile, output, check, capture, wait });
    } else if (scenario === "restart") {
      check("earned item retained after process restart", state.items.some(({ id }) => id === "expedition_star_hat"));
      check("saved equipment retained after process restart", state.character.equipped.head === "expedition_star_hat");
      check("running checkpoint resumes paused with no offline credit", !state.expedition.running && state.expedition.progress.expedition_cloak === 0);
      check("restart does not duplicate reward", state.expedition.unlocked.length === 1);
      check("all independent slots and hair color survive restart", state.character.equipped.hair === "ponytail_hair" && state.character.equipped.face === "round_glasses" && state.character.equipped.back === "teal_backpack" && state.character.equipped.tool === "travel_mug" && state.character.hairColor === "#714D38");
    } else if (scenario === "completion") {
      const prior = state.character;
      await js("window.osHeroApi.expeditionAction({action:'start'})");
      await wait(1400);
      state = await js("window.osHeroApi.getState()");
      check("completion unlocks exactly one reward", state.expedition.unlocked.length === 1 && state.items.some(({ id }) => id === "expedition_star_hat"));
      check("reward does not auto-equip or alter Hero", JSON.stringify(prior) === JSON.stringify(state.character));
      for (let i = 0; i < 5; i++) await js("window.osHeroApi.expeditionAction({action:'start'})");
      state = await js("window.osHeroApi.getState()");
      check("replayed starts cannot duplicate reward", state.expedition.unlocked.length === 1 && !state.expedition.running);
      const saved = JSON.parse(fs.readFileSync(path.join(profile, "expedition.json")));
      check("entitlement and progress durable together", saved.unlocked.length === 1 && saved.progress.expedition_star_hat === 75 * 60000);
      for (const id of ["ponytail_hair", "round_glasses", "teal_backpack", "travel_mug", "travel_jacket"]) await js(`window.osHeroApi.updateEquipment({action:'equip',itemId:${JSON.stringify(id)}})`);
      await js(`window.osHeroApi.saveCharacter({gender:'male',bodyColor:'#F1C27D',eyeType:'default',hairColor:'#714D38'})`);
      await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'expedition_star_hat'})");
      await wait(300);
      check("unlocked item is equippable", (await js("window.osHeroApi.getState()")).character.equipped.head === "expedition_star_hat");
      await capture(panel, "completion-equipped.png");
      await js("window.osHeroApi.expeditionAction({action:'select',targetId:'expedition_cloak'})");
      await js("window.osHeroApi.expeditionAction({action:'start'})");
      const fixture = Object.fromEntries(["character.json", "settings.json", "quests.json", "wallet.json", "expedition.json"].map((file) => [file, JSON.parse(fs.readFileSync(path.join(profile, file)))]));
      fs.writeFileSync(path.join(output, "restart-fixture.json"), JSON.stringify(fixture));
    } else {
      const before = state.expedition.progress.expedition_star_hat;
      await js("document.querySelector('[data-quest-toggle]').click()");
      await wait(200);
      state = await js("window.osHeroApi.getState()");
      check("quest completion changes no reward progress or gold", state.expedition.progress.expedition_star_hat === before && state.wallet.gold === 17);
      check("completion celebration visible", await js("document.getElementById('companion-notice').textContent.includes('완료')"));
      await js("document.getElementById('companion-add').click()");
      await js("document.getElementById('quick-quest-title').value='QA 새 퀘스트'; document.getElementById('quick-quest-form').requestSubmit()");
      await wait(250);
      check("quick quest form creates persisted task", (await js("window.osHeroApi.getState()")).quests.some(({ title }) => title === "QA 새 퀘스트"));
      await js("document.getElementById('reward-change').click()");
      await js("document.querySelector('[data-reward=expedition_cloak]').click()");
      await wait(150);
      check("target picker saves selection and pauses", (await js("window.osHeroApi.getState()")).expedition.targetId === "expedition_cloak");
      await js("window.osHeroApi.expeditionAction({action:'start'})");
      await wait(1250);
      await js("window.osHeroApi.expeditionAction({action:'pause'})");
      state = await js("window.osHeroApi.getState()");
      const paused = state.expedition.progress.expedition_cloak;
      check("measured time accrues", paused >= 1000 && paused < 2200);
      await wait(1100);
      check("pause freezes time", (await js("window.osHeroApi.getState()")).expedition.progress.expedition_cloak === paused);
      check("locked equipment rejected", await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'expedition_sword'}).then(()=>false,()=>true)"));
      fs.mkdirSync(path.join(profile, "expedition.json.tmp"));
      check("failed save rejects action without publishing a running session", await js("window.osHeroApi.expeditionAction({action:'start'}).then(()=>false,()=>true)"));
      check("failed start leaves expedition paused", !(await js("window.osHeroApi.getState()")).expedition.running);
      fs.rmdirSync(path.join(profile, "expedition.json.tmp"));
      await js("window.osHeroApi.expeditionAction({action:'start'})");
      powerMonitor.emit("suspend");
      await wait(150);
      check("OS suspend pauses expedition", !(await js("window.osHeroApi.getState()")).expedition.running);
      powerMonitor.emit("resume");
      check("wake does not silently resume", !(await js("window.osHeroApi.getState()")).expedition.running);
      await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'long_hair'})");
      await wait(150);
      state = await js("window.osHeroApi.getState()");
      check("equipment broadcasts canonical hero live", await js(`document.getElementById('expedition-hero').dataset.heroKey === ${JSON.stringify(state.hero.key)}`));
      const framePng = await js("window.osHeroApi.renderCharacter(null,0,1)");
      check("canonical payload is identical to renderer output", state.hero.frames[0] === framePng);
      await capture(panel, "flow-long-hair.png");
      await js("window.osHeroApi.openTrayView('inventory')");
      await wait(300);
      const inventory = panel;
      check("inventory opens with six independent categories", inventory && await inventory.webContents.executeJavaScript("document.querySelectorAll('[data-tab]').length === 6"));
      await inventory.webContents.executeJavaScript("document.querySelector('[data-item=long_hair]').click()");
      await wait(150);
      check("inventory worn-item preview uses same canonical pixels", await inventory.webContents.executeJavaScript(`document.getElementById('character-preview').dataset.heroKey === ${JSON.stringify(state.hero.key)}`));
      await capture(inventory, "flow-inventory.png");
      await inventory.webContents.executeJavaScript("document.querySelector('[data-item=bob_hair]').click()");
      check("item preview does not change equipped Hero", (await js("window.osHeroApi.getState()")).character.equipped.hair === "long_hair");
      await js("window.osHeroApi.openTrayView('customization')");
      await wait(300);
      const custom = panel;
      check("customization opens", custom);
      await custom.webContents.executeJavaScript("document.getElementById('body-color').value='#FFE6BD'; document.getElementById('body-color').dispatchEvent(new Event('input'))");
      check("unsaved appearance stays isolated", (await js("window.osHeroApi.getState()")).character.bodyColor === base.bodyColor);
      fs.mkdirSync(path.join(profile, "character.json.tmp"));
      await custom.webContents.executeJavaScript("document.getElementById('save-button').click()");
      await wait(150);
      check("appearance save failure leaves canonical Hero intact", (await js("window.osHeroApi.getState()")).character.bodyColor === base.bodyColor);
      check("appearance failure is visible and retryable", await custom.webContents.executeJavaScript("document.getElementById('color-error').textContent.includes('저장') && !document.getElementById('save-button').disabled"));
      fs.rmdirSync(path.join(profile, "character.json.tmp"));
      await custom.webContents.executeJavaScript("document.getElementById('save-button').click()");
      await wait(350);
      state = await js("window.osHeroApi.getState()");
      await js("navigateTray('companion')");
      check("saved appearance broadcasts without restart", state.character.bodyColor === "#FFE6BD" && await js(`document.getElementById('expedition-hero').dataset.heroKey === ${JSON.stringify(state.hero.key)}`));
      panel.setSize(390, 720);
      panel.show();
      await wait(300);
      check("compact width has no horizontal overflow", await js("document.querySelector('.tray-shell').scrollWidth <= window.innerWidth"));
      await capture(panel, "flow-compact.png");
      for (const language of ["en", "zh-CN"]) {
        await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
        await wait(150);
        check(`${language} labels localized`, await js("!document.body.innerText.includes('companion.')"));
        await capture(panel, `flow-${language}.png`);
      }
      // The real panel, not a test-created BrowserWindow, must be disposable while idle.
      app.emit("second-instance");
      await wait(10500);
      check("hidden tray renderer destroyed after idle grace", panel.isDestroyed());
      app.emit("second-instance");
      await wait(500);
      panel = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("view=tray"));
      state = await js("window.osHeroApi.getState()");
      check("recreated panel loads current saved Hero", state.character.bodyColor === "#FFE6BD" && state.character.equipped.hair === "long_hair");
    }
    const unexpected = errors.filter((error) => !error.includes("Item not owned"));
    assert.deepEqual(unexpected, [], "renderer console errors");
    fs.writeFileSync(path.join(output, `qa-${scenario}.json`), JSON.stringify({ scenario, checks, errors: unexpected, result: "passed" }, null, 2));
    console.log(JSON.stringify({ scenario, checks, result: "passed" }, null, 2));
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    fs.writeFileSync(path.join(output, `qa-${scenario}.json`), JSON.stringify({ scenario, checks, errors, failure: error.message, result: "failed" }, null, 2));
    app.exit(1);
  }
});
if (!process.env.OS_HERO_QA_PROFILE) app.on("quit", () => fs.rmSync(profile, { recursive: true, force: true }));
