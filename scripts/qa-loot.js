const fs = require("fs"), path = require("path");
const { powerMonitor } = require("electron");
const P = require("../src/shared/progression");
const { LOOT_ITEMS } = require("../src/shared/loot");
const { normalizeExpedition } = require("../src/shared/expedition");

function prepare({ scenario, output, write, base }) {
  if (scenario === "loot-restart") {
    const fixture = JSON.parse(fs.readFileSync(path.join(output, "loot-restart-fixture.json")));
    for (const [file, data] of Object.entries(fixture)) write(file, data);
    return;
  }
  write("character.json", { ...base, identity: { id: "12345678-1234-1234-1234-123456789abc", name: "모모", registeredAt: "2026-11-17T00:00:00.000Z" }, equipped: { ...base.equipped, hair: "princess_hair", tool: "trail_sword" } });
  const p = P.createProgression({ gold: 17 }, normalizeExpedition({}), 42);
  Object.assign(p.expedition.adventure, { xp: 95, pity: 79 });
  p.expedition.adventure.counts[0] = 4;
  p.expedition.adventure.elapsedMs = P.battleState(p.expedition.adventure).remainingMs - 400;
  if (scenario === "loot-shop") {
    p.wallet.gold = 3017;
    p.expedition.adventure.cleared[7] = true;
    p.expedition.adventure.unlocked = 7;
  }
  write("progression.json", p);
}

async function run({ scenario, panel, BrowserWindow, app, profile, output, check, capture, wait }) {
  const js = code => panel.webContents.executeJavaScript(code, true);
  const get = () => js("window.osHeroApi.getState()");
  await js("navigateTray('companion')"); await wait(100);
  let state = await get();
  if (scenario === "loot-failure") {
    const before = JSON.stringify(state.expedition.adventure);
    await js("window.osHeroApi.expeditionAction({action:'start'})");
    fs.mkdirSync(path.join(profile, "progression.json.tmp")); await wait(1250);
    state = await get();
    check("failed kill publishes no gold XP item or stage", state.wallet.gold === 17 && JSON.stringify(state.expedition.adventure) === before && !state.expedition.running && state.expedition.saveError);
    check("checkpoint error visible in popup", await js("document.getElementById('companion-notice').textContent.includes('저장')"));
    fs.rmdirSync(path.join(profile, "progression.json.tmp"));
    await js("window.osHeroApi.expeditionAction({action:'start'})"); await wait(1250);
    await js("window.osHeroApi.expeditionAction({action:'pause'})");
    state = await get();
    check("failed kill retries exactly once with deterministic loot", state.expedition.adventure.sequence === 1 && state.expedition.adventure.pity === 0 && state.wallet.gold === 17 + state.expedition.adventure.lastReward.gold && !state.expedition.saveError);
    return;
  }
  if (scenario === "loot-shop") {
    const beforeCharacter = JSON.stringify(state.character);
    await js("document.getElementById('reward-change').click()"); await wait(80);
    fs.mkdirSync(path.join(profile, "progression.json.tmp"));
    await js("document.querySelector('[data-loot-buy=moon_coat]').click()"); await wait(100);
    check("failed purchase retains balance and ownership", (await get()).wallet.gold === 3017 && !(await get()).items.some(i => i.id === "moon_coat"));
    fs.rmdirSync(path.join(profile, "progression.json.tmp"));
    await js("Promise.all([window.osHeroApi.buyAdventureItem('moon_coat'),window.osHeroApi.buyAdventureItem('moon_coat')])");
    check("duplicate purchase charges only once", (await get()).wallet.gold === 2417);
    for (const item of LOOT_ITEMS.filter(i => !i.firstClear && i.id !== "moon_coat")) {
      await js(`document.querySelector('[data-loot-buy="${item.id}"]').click()`); await wait(100);
    }
    state = await get();
    check("five fixed purchases are atomic and never auto-equip", state.wallet.gold === 17 && LOOT_ITEMS.filter(i => !i.firstClear).every(i => state.items.some(s => s.id === i.id)) && JSON.stringify(state.character) === beforeCharacter);
    check("completed collection and purchase feedback update without relaunch", await js("[...document.querySelectorAll('[data-loot-buy]:not([hidden])')].every(b=>b.disabled&&b.textContent==='보유')"));
    await capture(panel, "loot-shop-complete.png");
    await js("document.getElementById('dialog-close').click()");
    for (const item of LOOT_ITEMS.filter(i => !i.firstClear)) await js(`window.osHeroApi.updateEquipment({action:'equip',itemId:'${item.id}'})`);
    await js("navigateTray('inventory')"); await wait(100);
    await js("document.querySelector('[data-equipped-slot=hair]').click()"); await wait(100);
    await capture(panel, "loot-complete-outfit.png");
    check("purchased outfit shares canonical Hero in preview and header", await js("document.getElementById('character-preview').dataset.heroKey===state.hero.key"));
    return;
  }
  if (scenario === "loot-restart") {
    check("running intent resumes after restart without offline rewards", state.expedition.running && state.expedition.adventure.sequence === 1 && state.expedition.adventure.elapsedMs < 6000);
    check("identity, collected item and automatic level survive restart", state.character.identity.name === "모모" && state.expedition.battle.stats.level === 2 && state.expedition.adventure.lastReward.itemId && state.items.some(i => i.id === state.expedition.adventure.lastReward.itemId));
    await js("window.osHeroApi.expeditionAction({action:'pause'})");
    const before = await get(); await wait(1200);
    check("manual pause persists and stops all rewards", JSON.stringify((await get()).expedition.adventure) === JSON.stringify(before.expedition.adventure) && !(await get()).expedition.runIntent);
    await capture(panel, "loot-restarted.png");
    return;
  }
  const character = JSON.stringify(state.character), quests = JSON.stringify(state.quests);
  check("stage and shop guards reject forged calls", await js("Promise.all([window.osHeroApi.selectAdventureStage(7),window.osHeroApi.buyAdventureItem('moon_coat')].map(p=>p.then(()=>false,()=>true))).then(a=>a.every(Boolean))"));
  fs.mkdirSync(path.join(profile, "progression.json.tmp"));
  check("failed start is not published", await js("window.osHeroApi.expeditionAction({action:'start'}).then(()=>false,()=>true)"));
  check("failed start retains gold and paused checkpoint", !(await get()).expedition.running && (await get()).wallet.gold === 17);
  fs.rmdirSync(path.join(profile, "progression.json.tmp"));
  await js("document.getElementById('expedition-toggle').click()"); await wait(1250);
  await js("window.osHeroApi.expeditionAction({action:'pause'})");
  state = await get();
  const reward = state.expedition.adventure.lastReward;
  check("real timer awards one kill, automatic level and fifth-enemy stage unlock", state.expedition.adventure.sequence === 1 && state.expedition.battle.stats.level === 2 && state.expedition.adventure.unlocked === 1 && state.expedition.adventure.stage === 1);
  check("pity drops one new owned item without equipping it", reward.itemId && state.items.some(i => i.id === reward.itemId) && JSON.stringify(state.character) === character && state.expedition.adventure.pity === 0);
  const saved = JSON.parse(fs.readFileSync(path.join(profile, "progression.json")));
  check("gold XP ownership and RNG commit together", saved.wallet.gold === 17 + reward.gold && saved.expedition.adventure.xp === 95 + reward.xp && saved.expedition.unlocked.includes(reward.itemId));
  check("all screens retain one Hero and receipt updates live", await js("document.getElementById('expedition-hero').dataset.heroKey===state.hero.key && document.getElementById('loot-receipt').textContent.includes('XP') && document.getElementById('loot-found').textContent.length>0"));
  check("quests unchanged by combat", JSON.stringify(state.quests) === quests);
  check("default popup keeps the primary action visible after a rare drop", await js("document.getElementById('expedition-toggle').getBoundingClientRect().bottom<=innerHeight-4"));
  await capture(panel, "loot-victory-760.png");
  await js("document.querySelector('[data-journey-mode=farm]').click()"); await wait(100);
  check("repeat mode saves without new window", (await get()).expedition.adventure.mode === "farm" && BrowserWindow.getAllWindows().length === 1);
  await js("window.osHeroApi.expeditionAction({action:'start'})");
  powerMonitor.emit("lock-screen"); await wait(150);
  const locked = await get(); await wait(1200);
  check("screen lock keeps intent but stops time", !locked.expedition.running && locked.expedition.runIntent && (await get()).expedition.adventure.elapsedMs === locked.expedition.adventure.elapsedMs);
  powerMonitor.emit("suspend"); powerMonitor.emit("unlock-screen"); await wait(100);
  check("unlock cannot resume a suspended system", !(await get()).expedition.running);
  powerMonitor.emit("resume"); await wait(100);
  check("resume restores intent without offline credit", (await get()).expedition.running && (await get()).expedition.adventure.sequence === 1);
  await js("window.osHeroApi.expeditionAction({action:'pause'})");
  powerMonitor.emit("lock-screen"); powerMonitor.emit("unlock-screen"); await wait(100);
  check("manual pause survives lock and unlock", !(await get()).expedition.running && !(await get()).expedition.runIntent);

  for (const [width, height] of [[760,600],[681,600],[680,600],[520,540],[390,600],[320,480]]) {
    panel.setSize(width, height);
    for (const language of ["ko", "en", "zh-CN"]) {
      await js(`window.osHeroApi.setLanguage('${language}')`); await wait(80);
      for (const route of ["customization", "companion", "inventory"]) {
        await js(`navigateTray('${route}')`); await wait(80);
        check(`${width}x${height} ${language} ${route} has no overflow or missing images`, await js("document.documentElement.scrollWidth<=innerWidth && appRoot.scrollWidth<=appRoot.clientWidth+1 && [...document.images].every(i=>i.complete&&i.naturalWidth) && !document.body.innerText.includes('loot.')"));
      }
      await js("navigateTray('companion');document.getElementById('reward-change').click()"); await wait(80);
      check(`${width} ${language} loot collection fits with actual odds and items`, await js("document.querySelector('.companion-dialog').scrollWidth<=document.querySelector('.companion-dialog').clientWidth+1 && document.querySelectorAll('.loot-row').length===6 && document.getElementById('loot-odds').textContent.includes('%') && [...document.querySelectorAll('.loot-row img')].every(i=>i.naturalWidth>0)"));
      if (language === "ko") await capture(panel, `loot-collection-${width}x${height}.png`);
      await js("document.getElementById('dialog-close').click()"); await wait(60);
    }
  }
  panel.setSize(760,600); await js("window.osHeroApi.setLanguage('ko');navigateTray('inventory')"); await wait(100);
  state = await get();
  const item = LOOT_ITEMS.find(i => i.id === reward.itemId);
  await js(`document.getElementById('inventory-category').value='${item.slot}';document.getElementById('inventory-category').dispatchEvent(new Event('change'))`); await wait(80);
  check("earned loot appears in Inventory without relaunch", await js(`!!document.querySelector('[data-item="${item.id}"]')`));
  await js(`document.querySelector('[data-item="${item.id}"]').click();document.getElementById('equip-button').click()`); await wait(150);
  check("earned item equips through existing slot and preserves identity", (await get()).character.equipped[item.slot] === item.id && (await get()).character.identity.name === "모모");
  await capture(panel, "loot-equipped.png");
  await js("window.osHeroApi.expeditionAction({action:'start'})");
  const files = ["character.json", "settings.json", "quests.json", "wallet.json", "expedition.json", "progression.json"];
  const fixture = Object.fromEntries(files.map(file => [file, JSON.parse(fs.readFileSync(path.join(profile, file)))]));
  fixture["progression.json"].expedition.adventure.elapsedMs = 0;
  // The second process validates resume intent, not rewards from elapsed wall-clock time.
  fs.writeFileSync(path.join(output, "loot-restart-fixture.json"), JSON.stringify(fixture));
}
module.exports = { prepare, run };
